/**
 * SvnProxyService — SVN 프록시 터널 (소유자 ↔ VaultLine 서버 ↔ 수신자)
 *
 * 소유자 측:
 *   - WS "svn_connect" 수신 → 로컬 svnserve TCP 연결
 *   - TCP 데이터 → WS "svn_data" 전송 (base64)
 *   - WS "svn_data" 수신 → TCP로 기록
 *
 * 수신자 측:
 *   - 로컬 TCP 프록시 서버 시작 (127.0.0.1:동적포트)
 *   - SVN 클라이언트 → TCP 연결 → WS "svn_new_session" 전송
 *   - TCP 데이터 → WS "svn_data" 전송 (base64)
 *   - WS "svn_data" 수신 → TCP로 기록
 */

import net from 'net'
import { existsSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { BrowserWindow } from 'electron'
import log from 'electron-log'
import { wsService } from './WsService'
import { ServerConnectionService } from './ServerConnectionService'
import { getDatabase } from '../DatabaseService'
import * as SvnServeService from '../SvnServeService'

// 소유자 측: session_id → svnserve TCP 소켓
const _ownerSessions = new Map<string, net.Socket>()
// 수신자 측: session_id → SVN 클라이언트 TCP 소켓
const _recipientSessions = new Map<string, net.Socket>()
// 수신자 측: shareId → {server, port}
const _proxyServers = new Map<number, { server: net.Server; port: number }>()
// 수신자 측: shareId → 소유자가 보낸 오류 메시지 (svn_relay_error)
const _recipientErrors = new Map<number, string>()

let _initialized = false

export const SvnProxyService = {
  /** 초기화 — WS 핸들러 등록 (1회) */
  init(): void {
    if (_initialized) return
    _initialized = true

    // 소유자: 수신자가 새 세션을 요청함 → svnserve TCP 연결
    wsService.on('svn_connect', (msg) => {
      _handleOwnerConnect(
        msg.session_id as string,
        msg.share_id as number,
      ).catch((err) => log.error('[SvnProxy] svn_connect 처리 실패:', err))
    })

    // 양방향: 데이터 중계
    wsService.on('svn_data', (msg) => {
      _handleData(msg.session_id as string, msg.data as string)
    })

    // 양방향: 세션 종료
    wsService.on('svn_close', (msg) => {
      _handleClose(msg.session_id as string)
    })

    // WS 재연결 시 자동 복원
    wsService.on('__connected', () => {
      SvnProxyService.registerProviders().catch((err) =>
        log.error('[SvnProxy] provider 재등록 실패:', err)
      )
      SvnProxyService.restartRecipientProxies().catch((err) =>
        log.error('[SvnProxy] 수신자 프록시 복원 실패:', err)
      )
    })

    // 수신자: 공유자가 공유 취소 → 로컬 remote_repo 정리 + renderer 갱신
    wsService.on('share_revoked', (msg) => {
      const shareId = (msg.data as Record<string, unknown>)?.share_id as number
      if (!shareId) return
      SvnProxyService.stopProxy(shareId)
      try {
        const db = getDatabase()
        db.prepare('DELETE FROM remote_repos WHERE server_share_id = ?').run(shareId)
      } catch { /* 무시 */ }
      BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('share:revoked', { shareId }))
      log.info(`[SvnProxy] 공유 취소 수신 — share=${shareId}`)
    })

    // 공유자: 수신자가 공유 해제 → renderer 공유 목록 갱신
    wsService.on('share_left', (msg) => {
      const shareId = (msg.data as Record<string, unknown>)?.share_id as number
      if (!shareId) return
      BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('share:left', { shareId }))
      log.info(`[SvnProxy] 수신자 공유 해제 수신 — share=${shareId}`)
    })

    log.info('[SvnProxy] 초기화 완료')
  },

  // ── 소유자 측 ──

  /** 활성 공유에 대한 provider 등록 전송 */
  async registerProviders(): Promise<void> {
    const db = getDatabase()
    const rows = db.prepare(
      'SELECT DISTINCT server_share_id, repo_id FROM shared_users WHERE server_share_id IS NOT NULL'
    ).all() as Array<{ server_share_id: number; repo_id: number }>

    // 서버에서 현재 로그인 사용자가 실제로 소유한 share 목록 조회
    // — 같은 PC에 여러 Electron 인스턴스가 같은 DB를 공유할 때 타인 share 탈취 방지
    // — server_share_id가 NULL인 shared_users 복구에도 사용
    let serverShares: Array<{ id: number; svn_username: string | null }> = []
    let ownedShareIds: Set<number>
    try {
      const client = ServerConnectionService.getClient()
      const res = await client.get('/shares', { params: { limit: 200 } })
      serverShares = res.data.items as Array<{ id: number; svn_username: string | null }>
      ownedShareIds = new Set<number>(serverShares.map((s) => s.id))
    } catch (err) {
      log.warn('[SvnProxy] 소유 share 목록 조회 실패 — 전체 등록 진행 (서버가 재검증):', (err as Error).message)
      ownedShareIds = new Set(rows.map((r) => r.server_share_id))
    }

    // server_share_id가 NULL인 shared_users를 서버 svn_username으로 매핑해 복구
    if (serverShares.length > 0) {
      const nullRows = db.prepare(
        'SELECT id, repo_id, username FROM shared_users WHERE server_share_id IS NULL AND is_active = 1'
      ).all() as Array<{ id: number; repo_id: number; username: string }>

      for (const nullRow of nullRows) {
        const matched = serverShares.find((s) => s.svn_username === nullRow.username)
        if (matched) {
          db.prepare('UPDATE shared_users SET server_share_id = ? WHERE id = ?')
            .run(matched.id, nullRow.id)
          rows.push({ server_share_id: matched.id, repo_id: nullRow.repo_id })
          log.info(`[SvnProxy] shared_users server_share_id 복구: user=${nullRow.username} shareId=${matched.id}`)
        }
      }
    }

    const ownedRows = rows.filter((r) => ownedShareIds.has(r.server_share_id))
    if (ownedRows.length === 0) {
      log.info('[SvnProxy] 소유한 server share 없음 — provider 등록 생략')
      return
    }

    for (const row of ownedRows) {
      const status = SvnServeService.getStatus(row.repo_id)
      if (!status.running) {
        try {
          const started = await SvnServeService.start(row.repo_id)
          log.info(`[SvnProxy] registerProviders svnserve 시작 성공 — repoId=${row.repo_id} port=${started.port} pid=${started.pid}`)
        } catch (err) {
          log.warn(`[SvnProxy] registerProviders svnserve 시작 실패 — repoId=${row.repo_id}:`, (err as Error).message)
        }
      } else {
        log.info(`[SvnProxy] registerProviders svnserve 이미 실행 중 — repoId=${row.repo_id} port=${status.port}`)
      }
    }

    const shareIds = ownedRows.map((r) => r.server_share_id)
    wsService.send({ type: 'svn_register_provider', share_ids: shareIds })
    log.info(`[SvnProxy] Provider 등록: ${shareIds}`)
  },

  // ── 수신자 측 ──

  /** share에 대한 로컬 TCP 프록시 시작 → 포트 반환 */
  async startProxy(shareId: number): Promise<number> {
    const existing = _proxyServers.get(shareId)
    if (existing) return existing.port

    return new Promise<number>((resolve, reject) => {
      const server = net.createServer((socket) => {
        _handleRecipientConnection(socket, shareId)
      })

      server.on('error', reject)

      server.listen(0, '127.0.0.1', () => {
        const port = (server.address() as net.AddressInfo).port
        _proxyServers.set(shareId, { server, port })
        log.info(`[SvnProxy] 수신자 프록시 시작: share=${shareId} port=${port}`)
        resolve(port)
      })
    })
  },

  /** share에 대한 로컬 프록시 중지 */
  stopProxy(shareId: number): void {
    const entry = _proxyServers.get(shareId)
    if (!entry) return
    try { entry.server.close() } catch { /* 무시 */ }
    _proxyServers.delete(shareId)
    log.info(`[SvnProxy] 수신자 프록시 중지: share=${shareId}`)
  },

  /** 현재 프록시 포트 조회 */
  getProxyPort(shareId: number): number | null {
    return _proxyServers.get(shareId)?.port ?? null
  },

  /** 앱 시작/WS 재연결 시 — remote_repos 내 server share들의 프록시 복원 + WC URL 갱신 */
  async restartRecipientProxies(): Promise<void> {
    const db = getDatabase()
    const repos = db.prepare(
      'SELECT id, server_share_id, wc_path, svn_url FROM remote_repos WHERE server_share_id IS NOT NULL'
    ).all() as Array<{ id: number; server_share_id: number; wc_path: string; svn_url: string }>

    for (const repo of repos) {
      try {
        const port = await SvnProxyService.startProxy(repo.server_share_id)
        const newUrl = `svn://127.0.0.1:${port}`

        // 포트가 변경된 경우 WC 내부 URL을 직접 갱신 (svn relocate는 UUID 검증을 위해
        // 릴레이 네트워크가 필요하므로 WS 연결 직후 race condition 발생 가능)
        if (repo.svn_url !== newUrl && repo.wc_path && existsSync(repo.wc_path)) {
          try {
            _updateWcRepoUrl(repo.wc_path, newUrl)
            log.info(`[SvnProxy] WC URL 갱신: share=${repo.server_share_id} ${repo.svn_url} → ${newUrl}`)
          } catch (updateErr) {
            log.warn(`[SvnProxy] WC URL 갱신 실패 share=${repo.server_share_id}:`, (updateErr as Error).message)
          }
        }

        db.prepare('UPDATE remote_repos SET svn_url = ? WHERE id = ?').run(newUrl, repo.id)
        log.info(`[SvnProxy] 프록시 복원: share=${repo.server_share_id} port=${port}`)
      } catch (err) {
        log.warn(`[SvnProxy] 프록시 복원 실패 share=${repo.server_share_id}:`, (err as Error).message)
      }
    }
  },

  /** 수신자 측 릴레이 오류 메시지 조회 및 제거 */
  getAndClearError(shareId: number): string | null {
    const err = _recipientErrors.get(shareId) ?? null
    _recipientErrors.delete(shareId)
    return err
  },

  /** 수신자 측 릴레이 오류 메시지 조회 (제거 없음 — 커밋 오류 변환용) */
  peekRelayError(shareId: number): string | null {
    return _recipientErrors.get(shareId) ?? null
  },

  /** 앱 종료 시 정리 */
  cleanup(): void {
    for (const [, entry] of _proxyServers) {
      try { entry.server.close() } catch { /* 무시 */ }
    }
    _proxyServers.clear()
    for (const [, socket] of _ownerSessions) {
      try { socket.destroy() } catch { /* 무시 */ }
    }
    _ownerSessions.clear()
    for (const [, socket] of _recipientSessions) {
      try { socket.destroy() } catch { /* 무시 */ }
    }
    _recipientSessions.clear()
    log.info('[SvnProxy] 정리 완료')
  },
}

// ── 소유자 측 TCP 연결 처리 ──

async function _handleOwnerConnect(sessionId: string, shareId: number): Promise<void> {
  const db = getDatabase()
  let row = db.prepare(
    'SELECT repo_id FROM shared_users WHERE server_share_id = ? LIMIT 1'
  ).get(shareId) as { repo_id: number } | undefined

  if (!row) {
    // server_share_id가 없는 경우 — 서버에서 SVN 사용자명 조회 후 복구 시도
    log.warn(`[SvnProxy] share ${shareId} server_share_id 미설정 → 서버 조회로 복구 시도`)
    try {
      const client = ServerConnectionService.getClient()
      const res = await client.get(`/shares/${shareId}/credentials`)
      const svnUsername: string | undefined = res.data?.svn_username
      if (svnUsername) {
        const found = db.prepare(
          'SELECT id, repo_id FROM shared_users WHERE username = ? AND is_active = 1 LIMIT 1'
        ).get(svnUsername) as { id: number; repo_id: number } | undefined
        if (found) {
          db.prepare('UPDATE shared_users SET server_share_id = ? WHERE id = ?').run(shareId, found.id)
          log.info(`[SvnProxy] share ${shareId} 복구 완료: SVN 사용자 ${svnUsername}`)
          row = found
        }
      }
    } catch (err) {
      log.warn(`[SvnProxy] share ${shareId} 서버 조회 실패:`, (err as Error).message)
    }
  }

  if (!row) {
    log.warn(`[SvnProxy] share ${shareId} SVN 사용자 없음 — 공유를 재생성해 주세요`)
    wsService.send({ type: 'svn_relay_error', session_id: sessionId, error: 'SVN 사용자 미설정 — 소유자 앱에서 공유를 삭제하고 다시 생성해 주세요.' })
    wsService.send({ type: 'svn_close', session_id: sessionId })
    return
  }

  let svnStatus = SvnServeService.getStatus(row.repo_id)
  if (!svnStatus.running) {
    try {
      svnStatus = await SvnServeService.start(row.repo_id)
    } catch (err) {
      const reason = (err as Error).message
      log.error('[SvnProxy] svnserve 시작 실패:', reason)
      wsService.send({ type: 'svn_relay_error', session_id: sessionId, error: `svnserve 시작 실패: ${reason}` })
      wsService.send({ type: 'svn_close', session_id: sessionId })
      return
    }
  }

  const svnPort = svnStatus.port!
  log.info(`[SvnProxy] svnserve TCP 연결 시도 — session=${sessionId} port=${svnPort} pid=${svnStatus.pid}`)
  const socket = new net.Socket()

  socket.connect(svnPort, '127.0.0.1', () => {
    _ownerSessions.set(sessionId, socket)
    wsService.send({ type: 'svn_owner_ready', session_id: sessionId })
    log.info(`[SvnProxy] svnserve TCP 연결: session=${sessionId} port=${svnPort}`)
  })

  socket.on('data', (buf) => {
    wsService.send({
      type: 'svn_data',
      session_id: sessionId,
      data: buf.toString('base64'),
    })
  })

  socket.on('close', () => {
    if (_ownerSessions.has(sessionId)) {
      _ownerSessions.delete(sessionId)
      wsService.send({ type: 'svn_close', session_id: sessionId })
    }
  })

  socket.on('error', (err) => {
    log.warn(`[SvnProxy] TCP 오류 session=${sessionId}:`, err.message)
    _ownerSessions.delete(sessionId)
    wsService.send({ type: 'svn_close', session_id: sessionId })
  })
}

// ── 수신자 측 TCP 연결 처리 ──

function _handleRecipientConnection(socket: net.Socket, shareId: number): void {
  const sessionId = randomUUID()
  let ownerReady = false
  const dataBuffer: Buffer[] = []

  _recipientSessions.set(sessionId, socket)

  wsService.send({ type: 'svn_new_session', session_id: sessionId, share_id: shareId })

  // 소유자 TCP 연결 완료 신호 대기 후 버퍼 플러시
  const onOwnerReady = (msg: Record<string, unknown>) => {
    if (msg.session_id !== sessionId) return
    cleanup()
    ownerReady = true
    for (const chunk of dataBuffer) {
      wsService.send({ type: 'svn_data', session_id: sessionId, data: chunk.toString('base64') })
    }
    dataBuffer.length = 0
  }

  // 소유자 측 오류 메시지 수신 → shareId에 저장
  const onRelayError = (msg: Record<string, unknown>) => {
    if (msg.session_id !== sessionId) return
    const reason = (msg.error as string) || '소유자 측 오류'
    log.warn(`[SvnProxy] 소유자 오류 수신: session=${sessionId}:`, reason)
    _recipientErrors.set(shareId, reason)
  }

  const readyTimeout = setTimeout(() => {
    cleanup()
    if (!ownerReady) {
      log.warn(`[SvnProxy] 소유자 응답 타임아웃: session=${sessionId}`)
      _recipientErrors.set(shareId, '소유자 앱이 응답하지 않습니다 (타임아웃 10초). 소유자가 온라인인지 확인해 주세요.')
      socket.destroy()
      _recipientSessions.delete(sessionId)
      wsService.send({ type: 'svn_close', session_id: sessionId })
    }
  }, 10000)

  function cleanup() {
    clearTimeout(readyTimeout)
    wsService.off('svn_owner_ready', onOwnerReady)
    wsService.off('svn_relay_error', onRelayError)
  }

  wsService.on('svn_owner_ready', onOwnerReady)
  wsService.on('svn_relay_error', onRelayError)

  socket.on('data', (buf) => {
    if (!ownerReady) {
      dataBuffer.push(buf)
    } else {
      wsService.send({ type: 'svn_data', session_id: sessionId, data: buf.toString('base64') })
    }
  })

  socket.on('close', () => {
    cleanup()
    if (!ownerReady) {
      log.warn(`[SvnProxy] 소유자 준비 전 연결 종료: session=${sessionId}`)
    }
    if (_recipientSessions.has(sessionId)) {
      _recipientSessions.delete(sessionId)
      wsService.send({ type: 'svn_close', session_id: sessionId })
    }
  })

  socket.on('error', (err) => {
    cleanup()
    log.warn(`[SvnProxy] 클라이언트 소켓 오류 session=${sessionId}:`, err.message)
    _recipientSessions.delete(sessionId)
    wsService.send({ type: 'svn_close', session_id: sessionId })
  })
}

// ── 데이터/종료 라우팅 ──

function _handleData(sessionId: string, data: string): void {
  const ownerSocket = _ownerSessions.get(sessionId)
  if (ownerSocket) {
    ownerSocket.write(Buffer.from(data, 'base64'))
    return
  }
  const recipientSocket = _recipientSessions.get(sessionId)
  if (recipientSocket) {
    recipientSocket.write(Buffer.from(data, 'base64'))
  }
}

function _handleClose(sessionId: string): void {
  const ownerSocket = _ownerSessions.get(sessionId)
  if (ownerSocket) {
    ownerSocket.destroy()
    _ownerSessions.delete(sessionId)
    return
  }
  const recipientSocket = _recipientSessions.get(sessionId)
  if (recipientSocket) {
    log.info(`[SvnProxy] svn_close 수신 → 수신자 소켓 종료: session=${sessionId}`)
    recipientSocket.destroy()
    _recipientSessions.delete(sessionId)
  }
}

// ── 유틸 ──

/**
 * SVN WC의 저장소 URL을 네트워크 없이 직접 갱신.
 * svn relocate는 UUID 검증을 위해 릴레이 연결이 필요해 WS 연결 직후 race condition이
 * 발생할 수 있으므로, .svn/wc.db의 REPOSITORY.root를 직접 업데이트한다.
 */
function _updateWcRepoUrl(wcPath: string, newUrl: string): void {
  const Database = require('better-sqlite3') as typeof import('better-sqlite3').default
  const wcDbPath = join(wcPath, '.svn', 'wc.db')
  if (!existsSync(wcDbPath)) {
    log.warn(`[SvnProxy] wc.db 없음: ${wcDbPath}`)
    return
  }
  const db = new Database(wcDbPath)
  try {
    const updated = db.prepare('UPDATE REPOSITORY SET root = ?').run(newUrl)
    log.info(`[SvnProxy] wc.db REPOSITORY.root 갱신 완료 (${updated.changes}행): ${newUrl}`)
  } finally {
    db.close()
  }
}
