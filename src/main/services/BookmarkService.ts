import { getDatabase } from './DatabaseService'

/**
 * BookmarkService — 즐겨찾기 CRUD
 */

export interface Bookmark {
  id: number
  repoId: number
  filePath: string
  alias: string | null
  displayOrder: number
  createdAt: string
}

/** 즐겨찾기 목록 */
export function listBookmarks(): Bookmark[] {
  const db = getDatabase()
  return db.prepare(`
    SELECT id, repo_id as repoId, file_path as filePath, alias,
           display_order as displayOrder, created_at as createdAt
    FROM bookmarks ORDER BY display_order, created_at
  `).all() as Bookmark[]
}

/** 즐겨찾기 토글 (있으면 삭제, 없으면 추가) */
export function toggleBookmark(repoId: number, filePath: string): { added: boolean } {
  const db = getDatabase()
  const existing = db.prepare(
    'SELECT id FROM bookmarks WHERE repo_id = ? AND file_path = ?'
  ).get(repoId, filePath)

  if (existing) {
    db.prepare('DELETE FROM bookmarks WHERE repo_id = ? AND file_path = ?').run(repoId, filePath)
    return { added: false }
  } else {
    db.prepare('INSERT INTO bookmarks (repo_id, file_path) VALUES (?, ?)').run(repoId, filePath)
    return { added: true }
  }
}

/** 즐겨찾기 여부 확인 */
export function isBookmarked(repoId: number, filePath: string): boolean {
  const db = getDatabase()
  return !!db.prepare('SELECT 1 FROM bookmarks WHERE repo_id = ? AND file_path = ?').get(repoId, filePath)
}
