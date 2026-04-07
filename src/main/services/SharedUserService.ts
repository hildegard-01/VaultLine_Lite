import { getDatabase } from './DatabaseService'
import { regenerateAuthFiles } from './SvnServeService'
import type { SharedUser } from '@shared/types/ipc'

/**
 * SharedUserService — 공유 사용자 관리 (REQ-028, REQ-029)
 *
 * 역할:
 * - 사용자 CRUD (shared_users 테이블)
 * - 변경 시 passwd/authz 파일 자동 재생성
 */

/** 사용자 목록 */
export function listUsers(repoId: number): SharedUser[] {
  const db = getDatabase()
  return db.prepare(`
    SELECT id, repo_id as repoId, username, display_name as displayName,
           password_plain as passwordPlain, permission,
           is_active as isActive, created_at as createdAt
    FROM shared_users WHERE repo_id = ? ORDER BY created_at
  `).all(repoId) as SharedUser[]
}

/** 사용자 추가 */
export function createUser(
  repoId: number,
  username: string,
  displayName: string,
  password: string,
  permission: 'r' | 'rw' = 'rw'
): SharedUser {
  const db = getDatabase()

  // 중복 확인
  const existing = db.prepare(
    'SELECT id FROM shared_users WHERE repo_id = ? AND username = ?'
  ).get(repoId, username)
  if (existing) throw new Error(`이미 존재하는 사용자입니다: ${username}`)

  const result = db.prepare(`
    INSERT INTO shared_users (repo_id, username, display_name, password_plain, permission)
    VALUES (?, ?, ?, ?, ?)
  `).run(repoId, username, displayName, password, permission)

  // passwd/authz 재생성
  regenerateAuthFiles(repoId)

  // 활동 로그
  db.prepare(`
    INSERT INTO activity_log (repo_id, action, detail, created_at)
    VALUES (?, 'share.user-add', ?, CURRENT_TIMESTAMP)
  `).run(repoId, `사용자 추가: ${displayName} (${username}, ${permission})`)

  return {
    id: result.lastInsertRowid as number,
    repoId,
    username,
    displayName,
    passwordPlain: password,
    permission,
    isActive: true,
    createdAt: new Date().toISOString()
  }
}

/** 사용자 수정 */
export function updateUser(
  id: number,
  updates: { displayName?: string; password?: string; permission?: 'r' | 'rw'; isActive?: boolean }
): SharedUser {
  const db = getDatabase()

  const user = db.prepare('SELECT repo_id FROM shared_users WHERE id = ?').get(id) as { repo_id: number } | undefined
  if (!user) throw new Error('사용자를 찾을 수 없습니다.')

  const sets: string[] = []
  const values: unknown[] = []

  if (updates.displayName !== undefined) { sets.push('display_name = ?'); values.push(updates.displayName) }
  if (updates.password !== undefined) { sets.push('password_plain = ?'); values.push(updates.password) }
  if (updates.permission !== undefined) { sets.push('permission = ?'); values.push(updates.permission) }
  if (updates.isActive !== undefined) { sets.push('is_active = ?'); values.push(updates.isActive ? 1 : 0) }

  if (sets.length > 0) {
    values.push(id)
    db.prepare(`UPDATE shared_users SET ${sets.join(', ')} WHERE id = ?`).run(...values)
  }

  // passwd/authz 재생성
  regenerateAuthFiles(user.repo_id)

  // 업데이트된 결과 반환
  return db.prepare(`
    SELECT id, repo_id as repoId, username, display_name as displayName,
           password_plain as passwordPlain, permission,
           is_active as isActive, created_at as createdAt
    FROM shared_users WHERE id = ?
  `).get(id) as SharedUser
}

/** 사용자 삭제 */
export function deleteUser(id: number): void {
  const db = getDatabase()

  const user = db.prepare(
    'SELECT repo_id, username, display_name FROM shared_users WHERE id = ?'
  ).get(id) as { repo_id: number; username: string; display_name: string } | undefined
  if (!user) throw new Error('사용자를 찾을 수 없습니다.')

  db.prepare('DELETE FROM shared_users WHERE id = ?').run(id)

  // passwd/authz 재생성
  regenerateAuthFiles(user.repo_id)

  db.prepare(`
    INSERT INTO activity_log (repo_id, action, detail, created_at)
    VALUES (?, 'share.user-remove', ?, CURRENT_TIMESTAMP)
  `).run(user.repo_id, `사용자 삭제: ${user.display_name} (${user.username})`)
}
