import WebSocket from 'ws'
import { readFileSync, existsSync, statSync } from 'fs'
import { join } from 'path'
import { getDatabase } from '../DatabaseService'
import { getAccessToken } from './ServerConnectionService'
import * as ModeManager from './ModeManager'
import { dispatchToRenderer } from './ServerNotificationService'
import { SERVER_WS_TIMEOUT_MS } from '@shared/constants'

/**
 * FileProxyService — 서버 WebSocket 파일 프록시 응답
 *
 * 역할:
 * - 커넥티드 모드에서 서버 WebSocket에 연결 유지
 * - 서버로부터 file_request 수신 시 로컬 파일을 찾아 응답
 * - config.sync.allowFileProxy=false 시 거부 응답
 * - 연결 끊김 시 자동 재연결 (ModeManager가 연결 상태인 동안)
 *
 * 구성:
 * - connect(): WebSocket 연결 시작
 * - disconnect(): WebSocket 연결 종료
 * - _handleMessage(): file_request 처리
 * - _sendFileResponse(): 파일 내용 응답
 * - _sendErrorResponse(): 오류/거부 응답
 */

let _ws: WebSocket | null = null
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null
const RECONNECT_DELAY_MS = 5_000

/** WebSocket 연결 시작 — 커넥티드 모드 전환 시 호출 */
export function connect(): void {
  disconnect()

  const config = ModeManager.getServerConfig()
  if (!config?.sync?.allowFileProxy) return // 파일 프록시 비활성 설정

  const status = ModeManager.getStatus()
  if (!status.serverUrl) return

  const token = getAccessToken()
  if (!token) return

  // HTTP → WS URL 변환
  const wsUrl = status.serverUrl.replace(/^http/, 'ws') + `/ws?token=${encodeURIComponent(token)}`

  _ws = new WebSocket(wsUrl)

  _ws.on('open', () => {
    _cancelReconnect()
  })

  _ws.on('message', (data: WebSocket.RawData) => {
    try {
      const msg = JSON.parse(data.toString()) as Record<string, unknown>
      _handleMessage(msg)
    } catch {
      // JSON 파싱 오류 무시
    }
  })

  _ws.on('close', () => {
    _ws = null
    // 커넥티드 모드이면 재연결 시도
    if (ModeManager.isConnected()) {
      _scheduleReconnect()
    }
  })

  _ws.on('error', () => {
    _ws?.terminate()
    _ws = null
    if (ModeManager.isConnected()) {
      _scheduleReconnect()
    }
  })
}

/** WebSocket 연결 종료 — 오프라인 전환 / 앱 종료 시 호출 */
export function disconnect(): void {
  _cancelReconnect()
  if (_ws) {
    _ws.terminate()
    _ws = null
  }
}

/** 연결 여부 */
export function isConnected(): boolean {
  return _ws !== null && _ws.readyState === WebSocket.OPEN
}

/** 수신 메시지 처리 */
function _handleMessage(msg: Record<string, unknown>): void {
  // 알림 이벤트 → Renderer로 전달
  if (msg.type === 'notification') {
    dispatchToRenderer(msg)
    return
  }

  if (msg.type !== 'file_request') return

  const reqId = msg.req_id as string | undefined
  const repoId = msg.repo_id as number | undefined
  const filePath = msg.path as string | undefined

  if (!reqId || repoId === undefined || !filePath) {
    return
  }

  const config = ModeManager.getServerConfig()
  if (!config?.sync?.allowFileProxy) {
    _sendErrorResponse(reqId, '파일 프록시가 비활성화되어 있습니다.')
    return
  }

  // 로컬 저장소에서 파일 경로 조회
  const localPath = _resolveLocalPath(repoId, filePath)
  if (!localPath) {
    _sendErrorResponse(reqId, '파일을 찾을 수 없습니다.')
    return
  }

  // 파일 크기 제한 확인 (MB 단위)
  const maxSizeMB = config.sync.previewPushMaxSizeMB ?? 50
  try {
    const stat = statSync(localPath)
    if (stat.size > maxSizeMB * 1024 * 1024) {
      _sendErrorResponse(reqId, `파일 크기 초과 (최대 ${maxSizeMB}MB)`)
      return
    }
  } catch {
    _sendErrorResponse(reqId, '파일 정보를 읽을 수 없습니다.')
    return
  }

  // 파일 전송 (비동기, 타임아웃 적용)
  _sendFileResponse(reqId, localPath).catch(() => {
    _sendErrorResponse(reqId, '파일 전송 중 오류가 발생했습니다.')
  })
}

/** 파일 내용 응답 전송 */
async function _sendFileResponse(reqId: string, localPath: string): Promise<void> {
  if (!isConnected()) return

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('파일 전송 타임아웃')), SERVER_WS_TIMEOUT_MS)

    try {
      if (!existsSync(localPath)) {
        clearTimeout(timer)
        reject(new Error('파일이 존재하지 않습니다.'))
        return
      }

      const fileData = readFileSync(localPath)
      const base64Data = fileData.toString('base64')
      const ext = localPath.split('.').pop()?.toLowerCase() ?? ''

      const response = JSON.stringify({
        type: 'file_response',
        req_id: reqId,
        data: base64Data,
        mime_type: _getMimeType(ext),
        file_name: localPath.split(/[\\/]/).pop() ?? ''
      })

      _ws!.send(response, (err) => {
        clearTimeout(timer)
        if (err) reject(err)
        else resolve()
      })
    } catch (err) {
      clearTimeout(timer)
      reject(err)
    }
  })
}

/** 오류 응답 전송 */
function _sendErrorResponse(reqId: string, reason: string): void {
  if (!isConnected()) return

  try {
    _ws!.send(JSON.stringify({
      type: 'file_response',
      req_id: reqId,
      error: reason
    }))
  } catch {
    // 전송 오류 무시
  }
}

/** 서버 저장소 ID → 로컬 WC 경로 조회 후 파일 경로 결합 */
function _resolveLocalPath(serverRepoId: number, filePath: string): string | null {
  try {
    const db = getDatabase()

    // server_repo_id_{localId} = serverRepoId 매핑으로 로컬 저장소 찾기
    const settings = db.prepare(`
      SELECT key, value FROM app_settings WHERE key LIKE 'server_repo_id_%'
    `).all() as { key: string; value: string }[]

    for (const s of settings) {
      if (parseInt(s.value, 10) === serverRepoId) {
        const localRepoId = parseInt(s.key.replace('server_repo_id_', ''), 10)
        const repo = db.prepare(`
          SELECT wc_path FROM repositories WHERE id = ? AND status = 'active'
        `).get(localRepoId) as { wc_path: string } | undefined

        if (repo) {
          // 경로 트래버설 방지
          const safePath = filePath.replace(/\.\./g, '').replace(/^[/\\]+/, '')
          const fullPath = join(repo.wc_path, safePath)

          // WC 경로 하위에 있는지 확인
          if (fullPath.startsWith(repo.wc_path)) {
            return fullPath
          }
        }
      }
    }
  } catch {
    // DB 오류 무시
  }
  return null
}

/** 재연결 예약 */
function _scheduleReconnect(): void {
  _cancelReconnect()
  _reconnectTimer = setTimeout(() => {
    if (ModeManager.isConnected()) {
      connect()
    }
  }, RECONNECT_DELAY_MS)
}

/** 재연결 취소 */
function _cancelReconnect(): void {
  if (_reconnectTimer !== null) {
    clearTimeout(_reconnectTimer)
    _reconnectTimer = null
  }
}

/** 확장자 → MIME 타입 */
function _getMimeType(ext: string): string {
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    txt: 'text/plain',
    md: 'text/markdown'
  }
  return map[ext] ?? 'application/octet-stream'
}
