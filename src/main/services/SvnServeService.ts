import { spawn } from 'child_process'
import type { ChildProcess } from 'child_process'
import { writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { createServer } from 'net'
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
  // 이미 실행 중이면 상태 반환
  if (_processes.has(repoId)) {
    return getStatus(repoId)
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

  proc.on('error', (err) => {
    console.error(`svnserve 오류 (repo ${repoId}):`, err.message)
    _processes.delete(repoId)
  })

  proc.on('exit', () => {
    _processes.delete(repoId)
  })

  _processes.set(repoId, { proc, port: targetPort })

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
