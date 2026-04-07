import { randomBytes } from 'crypto'
import { getDatabase } from './DatabaseService'
import { getLocalIpAddress, getStatus as getSvnServeStatus } from './SvnServeService'
import type { Invitation, Repository } from '@shared/types/ipc'

/**
 * InvitationService — 초대 링크 생성/검증 (REQ-030)
 *
 * 역할:
 * - docvault://join?data={Base64_JSON} 형식 초대 링크 생성
 * - 토큰 기반 1회용/만료 시간 제한
 * - 초대 검증
 */

/** 초대 링크 생성 */
export function createInvitation(
  repoId: number,
  sharedUserId: number,
  expiryMinutes: number = 1440, // 기본 24시간
  oneTime: boolean = false
): { invitation: Invitation; link: string } {
  const db = getDatabase()

  // 저장소 확인
  const repo = db.prepare(`
    SELECT id, name, svn_path as svnPath FROM repositories WHERE id = ? AND status = 'active'
  `).get(repoId) as Repository | undefined
  if (!repo) throw new Error('저장소를 찾을 수 없습니다.')

  // 사용자 확인
  const user = db.prepare(
    'SELECT id, username, password_plain, display_name FROM shared_users WHERE id = ? AND repo_id = ?'
  ).get(sharedUserId, repoId) as { id: number; username: string; password_plain: string; display_name: string } | undefined
  if (!user) throw new Error('공유 사용자를 찾을 수 없습니다.')

  // svnserve 상태 확인
  const serveStatus = getSvnServeStatus(repoId)
  if (!serveStatus.running) {
    throw new Error('svnserve가 실행 중이어야 초대 링크를 생성할 수 있습니다.')
  }

  // 토큰 생성
  const token = randomBytes(16).toString('hex')
  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString()

  // DB 저장
  const result = db.prepare(`
    INSERT INTO invitations (repo_id, shared_user_id, token, expires_at, one_time)
    VALUES (?, ?, ?, ?, ?)
  `).run(repoId, sharedUserId, token, expiresAt, oneTime ? 1 : 0)

  // 초대 링크 구성
  const host = getLocalIpAddress()
  const linkData = Buffer.from(JSON.stringify({
    host,
    port: serveStatus.port,
    repo: repo.name,
    username: user.username,
    password: user.password_plain,
    displayName: user.display_name,
    token
  })).toString('base64')

  const link = `docvault://join?data=${linkData}`

  const invitation: Invitation = {
    id: result.lastInsertRowid as number,
    repoId,
    sharedUserId,
    token,
    expiresAt,
    oneTime,
    isUsed: false,
    createdAt: new Date().toISOString()
  }

  db.prepare(`
    INSERT INTO activity_log (repo_id, action, detail, created_at)
    VALUES (?, 'share.invite', ?, CURRENT_TIMESTAMP)
  `).run(repoId, `초대 링크 생성: ${user.display_name}`)

  return { invitation, link }
}

/** 초대 목록 */
export function listInvitations(repoId: number): Invitation[] {
  const db = getDatabase()
  return db.prepare(`
    SELECT id, repo_id as repoId, shared_user_id as sharedUserId, token,
           expires_at as expiresAt, one_time as oneTime, is_used as isUsed,
           created_at as createdAt
    FROM invitations WHERE repo_id = ? ORDER BY created_at DESC
  `).all(repoId) as Invitation[]
}

/** 초대 토큰 검증 */
export function validateInvitation(token: string): { valid: boolean; repoName?: string; host?: string } {
  const db = getDatabase()
  const inv = db.prepare(`
    SELECT i.id, i.expires_at, i.one_time, i.is_used, r.name as repoName
    FROM invitations i JOIN repositories r ON i.repo_id = r.id
    WHERE i.token = ?
  `).get(token) as { id: number; expires_at: string; one_time: number; is_used: number; repoName: string } | undefined

  if (!inv) return { valid: false }
  if (inv.is_used && inv.one_time) return { valid: false }
  if (new Date() > new Date(inv.expires_at)) return { valid: false }

  return {
    valid: true,
    repoName: inv.repoName,
    host: getLocalIpAddress()
  }
}

/** 초대 사용 완료 표시 */
export function markInvitationUsed(token: string): void {
  const db = getDatabase()
  db.prepare(
    'UPDATE invitations SET is_used = 1, used_at = CURRENT_TIMESTAMP WHERE token = ?'
  ).run(token)
}
