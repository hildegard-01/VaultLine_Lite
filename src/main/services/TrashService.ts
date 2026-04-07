import { getDatabase } from './DatabaseService'

/**
 * TrashService — 휴지통 관리
 */

export interface TrashItem {
  id: number
  repoId: number
  repoName: string
  filePath: string
  deletedRevision: number
  originalSize: number
  deletedAt: string
  expiresAt: string | null
}

/** 휴지통 목록 (저장소별 또는 전체) */
export function listTrash(repoId?: number): TrashItem[] {
  const db = getDatabase()
  if (repoId) {
    return db.prepare(`
      SELECT t.id, t.repo_id as repoId, r.name as repoName, t.file_path as filePath,
             t.deleted_revision as deletedRevision, t.original_size as originalSize,
             t.deleted_at as deletedAt, t.expires_at as expiresAt
      FROM trash_items t
      JOIN repositories r ON r.id = t.repo_id
      WHERE t.repo_id = ? AND t.is_visible = 1
      ORDER BY t.deleted_at DESC
    `).all(repoId) as TrashItem[]
  }
  return db.prepare(`
    SELECT t.id, t.repo_id as repoId, r.name as repoName, t.file_path as filePath,
           t.deleted_revision as deletedRevision, t.original_size as originalSize,
           t.deleted_at as deletedAt, t.expires_at as expiresAt
    FROM trash_items t
    JOIN repositories r ON r.id = t.repo_id
    WHERE t.is_visible = 1
    ORDER BY t.deleted_at DESC
  `).all() as TrashItem[]
}

/** 영구 삭제 (단일) */
export function purgeTrashItem(id: number): void {
  const db = getDatabase()
  db.prepare('DELETE FROM trash_items WHERE id = ?').run(id)
}

/** 휴지통 비우기 (저장소별 또는 전체) */
export function emptyTrash(repoId?: number): { deleted: number } {
  const db = getDatabase()
  if (repoId) {
    const result = db.prepare('DELETE FROM trash_items WHERE repo_id = ?').run(repoId)
    return { deleted: result.changes }
  }
  const result = db.prepare('DELETE FROM trash_items').run()
  return { deleted: result.changes }
}

/** 만료된 휴지통 항목 정리 (앱 시작 시 또는 주기적) */
export function cleanupExpiredTrash(): { deleted: number } {
  const db = getDatabase()
  const result = db.prepare(
    "DELETE FROM trash_items WHERE expires_at IS NOT NULL AND expires_at < datetime('now')"
  ).run()
  return { deleted: result.changes }
}
