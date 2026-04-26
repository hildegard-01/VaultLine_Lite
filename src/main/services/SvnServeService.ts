import { spawn } from 'child_process'
import type { ChildProcess } from 'child_process'
import { writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { createServer, createConnection } from 'net'
import log from 'electron-log'
import { getSvnPath, getSvnEnv } from './SvnPathHelper'
import { getDatabase } from './DatabaseService'
import { SVN_DEFAULT_PORT } from '@shared/constants'
import type { SvnServeStatus, Repository } from '@shared/types/ipc'

/**
 * SvnServeService — svnserve 프로세스 관리 (REQ-027)
 *
 * 역할:
 * - svnserve 시작/중지/상태 관리
 * - conf/svnserve.conf, passwd, authz 자동 생성
 * - 포트 충돌 자동 감지
 * - 저장소당 1개 인스턴스
 */

// 실행 중인 svnserve 프로세스 (repoId → process)
const _processes = new Map<number, { proc: ChildProcess; port: number }>()

/** 저장소 조회 */
function getRepoById(repoId: number): Repository {
  const db = getDatabase()
  const repo = db.prepare(`
    SELECT id, name, svn_path as svnPath, wc_path as wcPath
    FROM repositories WHERE id = ? AND status = 'active'
  `).get(repoId) as Repository | undefined
  if (!repo) throw new Error('저장소를 찾을 수 없습니다.')
  return repo
}

/** svnserve가 실제로 포트를 열 때까지 대기 (race condition 방지) */
function waitUntilListening(port: number, pid: number | undefined, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs

    function attempt() {
      // 프로세스가 종료됐으면 즉시 실패
      if (pid !== undefined) {
        try { process.kill(pid, 0) } catch {
          reject(new Error('svnserve 프로세스가 시작 직후 종료됐습니다.'))
          return
        }
      }
      const socket = createConnection({ port, host: '127.0.0.1' })
      socket.setTimeout(200)
      socket.on('connect', () => { socket.destroy(); resolve() })
      socket.on('timeout', () => { socket.destroy(); retry() })
      socket.on('error', () => { socket.destroy(); retry() })
    }

    function retry() {
      if (Date.now() >= deadline) {
        reject(new Error(`svnserve 포트 ${port} 대기 타임아웃 (${timeoutMs / 1000}초)`))
      } else {
        setTimeout(attempt, 100)
      }
    }

    setTimeout(attempt, 100) // 첫 시도는 100ms 후
  })
}

/** 포트 사용 가능 여부 확인 */
function checkPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close(() => resolve(true))
    })
    server.listen(port, '0.0.0.0')
  })
}

/** svnserve.conf 생성 */
function writeConf(confDir: string): void {
  if (!existsSync(confDir)) mkdirSync(confDir, { recursive: true })

  const conf = `[general]
anon-access = none
auth-access = write
password-db = passwd
authz-db = authz
realm = VaultLine Local
`
  writeFileSync(join(confDir, 'svnserve.conf'), conf, 'utf-8')
}

/** passwd 파일 생성 (shared_users DB 기준) */
export function regeneratePasswd(repoId: number, confDir: string): void {
  const db = getDatabase()
  const users = db.prepare(
    'SELECT username, password_plain FROM shared_users WHERE repo_id = ? AND is_active = 1'
  ).all(repoId) as Array<{ username: string; password_plain: string }>

  let content = '[users]\n'
  for (const u of users) {
    content += `${u.username} = ${u.password_plain}\n`
  }
  writeFileSync(join(confDir, 'passwd'), content, 'utf-8')
}

/** authz 파일 생성 (shared_users DB 기준) */
export function regenerateAuthz(repoId: number, confDir: string): void {
  const db = getDatabase()
  const users = db.prepare(
    'SELECT username, permission FROM shared_users WHERE repo_id = ? AND is_active = 1'
  ).all(repoId) as Array<{ username: string; permission: string }>

  // 모든 사용자에게 루트 권한 부여 (파일 필터링은 체크아웃 URL로 처리)
  let content = '[/]\n'
  for (const u of users) {
    content += `${u.username} = ${u.permission}\n`
  }
  writeFileSync(join(confDir, 'authz'), content, 'utf-8')
}

/** 인증 파일 전체 재생성 */
export function regenerateAuthFiles(repoId: number): void {
  const repo = getRepoById(repoId)
  const confDir = join(repo.svnPath, 'conf')
  writeConf(confDir)
  regeneratePasswd(repoId, confDir)
  regenerateAuthz(repoId, confDir)
}

/** svnserve 시작 */
export async function start(repoId: number, port?: number): Promise<SvnServeStatus> {
  // 이미 실행 중이면 인증 파일만 갱신 후 상태 반환
  if (_processes.has(repoId)) {
    try { regenerateAuthFiles(repoId) } catch { /* 무시 */ }
    const status = getStatus(repoId)
    log.info(`[SvnServe] 이미 실행 중 — repoId=${repoId} port=${status.port} pid=${status.pid}`)
    return status
  }

  const repo = getRepoById(repoId)
  const targetPort = port || SVN_DEFAULT_PORT

  // 포트 사용 가능 확인
  const available = await checkPort(targetPort)
  if (!available) {
    throw new Error(`포트 ${targetPort}이(가) 이미 사용 중입니다.`)
  }

  // 인증 파일 생성
  regenerateAuthFiles(repoId)

  // svnserve 프로세스 시작
  const svnservePath = getSvnPath('svnserve')
  log.info(`[SvnServe] spawn 시작 — repoId=${repoId} port=${targetPort} path=${repo.svnPath}`)
  const proc = spawn(svnservePath, [
    '-d',
    '--foreground',
    '--listen-port', String(targetPort),
    '-r', repo.svnPath
  ], {
    env: getSvnEnv(),
    stdio: 'ignore',
    detached: false,
    windowsHide: true
  })
  log.info(`[SvnServe] spawn 완료 — pid=${proc.pid}`)

  proc.on('error', (err) => {
    log.error(`[SvnServe] 프로세스 오류 — repoId=${repoId} port=${targetPort}:`, err.message)
    _processes.delete(repoId)
  })

  proc.on('exit', (code, signal) => {
    log.warn(`[SvnServe] 프로세스 종료 — repoId=${repoId} port=${targetPort} code=${code} signal=${signal}`)
    _processes.delete(repoId)
  })

  _processes.set(repoId, { proc, port: targetPort })

  // svnserve가 실제로 포트를 바인딩할 때까지 대기
  try {
    await waitUntilListening(targetPort, proc.pid)
    log.info(`[SvnServe] 포트 바인딩 확인 완료 — repoId=${repoId} port=${targetPort} pid=${proc.pid}`)
  } catch (err) {
    log.error(`[SvnServe] 포트 대기 실패 — repoId=${repoId} port=${targetPort}:`, (err as Error).message)
    try { proc.kill() } catch { /* 무시 */ }
    _processes.delete(repoId)
    throw err
  }

  // 활동 로그
  const db = getDatabase()
  db.prepare(`
    INSERT INTO activity_log (repo_id, action, detail, created_at)
    VALUES (?, 'svnserve.start', ?, CURRENT_TIMESTAMP)
  `).run(repoId, `svnserve 시작: 포트 ${targetPort}`)

  return {
    running: true,
    repoId,
    port: targetPort,
    pid: proc.pid,
    userCount: getUserCount(repoId)
  }
}

/** svnserve 중지 */
export function stop(repoId: number): void {
  const entry = _processes.get(repoId)
  if (!entry) return

  entry.proc.kill()
  _processes.delete(repoId)

  const db = getDatabase()
  db.prepare(`
    INSERT INTO activity_log (repo_id, action, detail, created_at)
    VALUES (?, 'svnserve.stop', 'svnserve 중지', CURRENT_TIMESTAMP)
  `).run(repoId)
}

/** svnserve 상태 조회 */
export function getStatus(repoId: number): SvnServeStatus {
  const entry = _processes.get(repoId)
  if (!entry) return { running: false, repoId }

  return {
    running: true,
    repoId,
    port: entry.port,
    pid: entry.proc.pid,
    userCount: getUserCount(repoId)
  }
}

/** 활성 사용자 수 */
function getUserCount(repoId: number): number {
  const db = getDatabase()
  const row = db.prepare(
    'SELECT COUNT(*) as cnt FROM shared_users WHERE repo_id = ? AND is_active = 1'
  ).get(repoId) as { cnt: number }
  return row.cnt
}

/** 로컬 IP 주소 반환 */
export function getLocalIpAddress(): string {
  const { networkInterfaces } = require('os')
  const nets = networkInterfaces()
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address
      }
    }
  }
  return '127.0.0.1'
}

/** 모든 svnserve 프로세스 종료 (앱 종료 시) */
export function stopAll(): void {
  for (const [, entry] of _processes) {
    try { entry.proc.kill() } catch { /* 무시 */ }
  }
  _processes.clear()
}
