import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { app } from 'electron'
import { getDatabase } from './DatabaseService'
import * as SvnService from './SvnService'
import { markInvitationUsed } from './InvitationService'
import { DEFAULT_WORKCOPIES_DIR } from '@shared/constants'
import type { RemoteRepo } from '@shared/types/ipc'

/**
 * RemoteRepoService — 원격 저장소 관리, 게스트 측 (REQ-031)
 *
 * 역할:
 * - 초대 링크 수락 → svn checkout → DB 등록
 * - 원격 저장소 목록/상태/연결 해제
 */

/** 초대 수락: 링크 데이터 파싱 → svn checkout → DB 등록 */
export async function acceptInvitation(linkData: string): Promise<RemoteRepo> {
  // Base64 디코딩
  let parsed: {
    host: string
    port: number
    repo: string
    username: string
    password: string
    displayName: string
    token: string
  }

  try {
    parsed = JSON.parse(Buffer.from(linkData, 'base64').toString('utf-8'))
  } catch {
    throw new Error('유효하지 않은 초대 링크입니다.')
  }

  const { host, port, repo, username, password, displayName, token } = parsed

  // SVN URL 구성
  const svnUrl = `svn://${host}:${port}`

  // 로컬 작업 복사본 경로
  const wcBase = join(app.getPath('userData'), DEFAULT_WORKCOPIES_DIR, 'remote')
  if (!existsSync(wcBase)) mkdirSync(wcBase, { recursive: true })
  const wcPath = join(wcBase, `${repo}-${username}-${Date.now()}`)

  // svn checkout (인증 정보 포함)
  try {
    await SvnService.checkoutWithAuth(svnUrl, wcPath, username, password)
  } catch (err) {
    throw new Error(`원격 저장소 연결 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`)
  }

  // DB 등록
  const db = getDatabase()
  const result = db.prepare(`
    INSERT INTO remote_repos (display_name, svn_url, wc_path, username, password_plain, owner_name, connection_status, last_synced)
    VALUES (?, ?, ?, ?, ?, ?, 'connected', CURRENT_TIMESTAMP)
  `).run(repo, svnUrl, wcPath, username, password, displayName)

  // 초대 토큰 사용 완료 표시
  if (token) {
    try { markInvitationUsed(token) } catch { /* 게스트 측에선 호스트 DB 접근 불가, 무시 */ }
  }

  db.prepare(`
    INSERT INTO activity_log (action, detail, created_at)
    VALUES ('sync.join', ?, CURRENT_TIMESTAMP)
  `).run(`원격 저장소 연결: ${repo} (${host}:${port})`)

  return {
    id: result.lastInsertRowid as number,
    displayName: repo,
    svnUrl,
    wcPath,
    username,
    passwordPlain: password,
    ownerName: displayName,
    permission: 'rw',
    connectionStatus: 'connected',
    lastSynced: new Date().toISOString(),
    createdAt: new Date().toISOString()
  }
}

/** 원격 저장소 목록 */
export function listRemoteRepos(): RemoteRepo[] {
  const db = getDatabase()
  return db.prepare(`
    SELECT id, display_name as displayName, svn_url as svnUrl, wc_path as wcPath,
           username, password_plain as passwordPlain, owner_name as ownerName,
           permission, connection_status as connectionStatus,
           last_synced as lastSynced, created_at as createdAt
    FROM remote_repos ORDER BY created_at
  `).all() as RemoteRepo[]
}

/** 원격 저장소 상태 확인 */
export async function checkStatus(id: number): Promise<RemoteRepo> {
  const db = getDatabase()
  const repo = db.prepare(`
    SELECT id, display_name as displayName, svn_url as svnUrl, wc_path as wcPath,
           username, password_plain as passwordPlain, owner_name as ownerName,
           permission, connection_status as connectionStatus,
           last_synced as lastSynced, created_at as createdAt
    FROM remote_repos WHERE id = ?
  `).get(id) as RemoteRepo | undefined
  if (!repo) throw new Error('원격 저장소를 찾을 수 없습니다.')

  // svn info로 연결 가능한지 확인
  let status: 'connected' | 'unreachable' = 'unreachable'
  try {
    await SvnService.infoWithAuth(repo.svnUrl, repo.username, repo.passwordPlain)
    status = 'connected'
  } catch {
    status = 'unreachable'
  }

  db.prepare('UPDATE remote_repos SET connection_status = ? WHERE id = ?').run(status, id)
  return { ...repo, connectionStatus: status }
}

/** 원격 저장소 연결 해제 */
export function disconnect(id: number): void {
  const db = getDatabase()
  const repo = db.prepare('SELECT display_name, wc_path FROM remote_repos WHERE id = ?')
    .get(id) as { display_name: string; wc_path: string } | undefined
  if (!repo) throw new Error('원격 저장소를 찾을 수 없습니다.')

  db.prepare('DELETE FROM remote_repos WHERE id = ?').run(id)

  // 작업 복사본 삭제
  try {
    const { rmSync } = require('fs')
    if (existsSync(repo.wc_path)) {
      rmSync(repo.wc_path, { recursive: true, force: true })
    }
  } catch { /* 무시 */ }

  db.prepare(`
    INSERT INTO activity_log (action, detail, created_at)
    VALUES ('sync.disconnect', ?, CURRENT_TIMESTAMP)
  `).run(`원격 저장소 연결 해제: ${repo.display_name}`)
}
