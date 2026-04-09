import { handleIpc } from './index'
import { getDatabase } from '../services/DatabaseService'

/**
 * 활동 로그 IPC 핸들러
 * activity:list — 활동 로그 목록 조회
 */

export function registerActivityHandlers(): void {
  handleIpc('activity:list', (args: unknown) => {
    const { repoId, action, limit = 100, offset = 0 } = (args || {}) as {
      repoId?: number
      action?: string
      limit?: number
      offset?: number
    }

    const db = getDatabase()
    const conditions: string[] = []
    const params: unknown[] = []

    if (repoId) {
      conditions.push('a.repo_id = ?')
      params.push(repoId)
    }
    if (action) {
      conditions.push('a.action LIKE ?')
      params.push(`${action}%`)
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const rows = db.prepare(`
      SELECT a.id, a.repo_id, r.name as repo_name, a.action, a.file_path,
             a.revision, a.username, a.detail, a.created_at
      FROM activity_log a
      LEFT JOIN repositories r ON r.id = a.repo_id
      ${where}
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as Array<{
      id: number
      repo_id: number | null
      repo_name: string | null
      action: string
      file_path: string | null
      revision: number | null
      username: string | null
      detail: string | null
      created_at: string
    }>

    return rows.map(row => ({
      id: row.id,
      repoId: row.repo_id,
      repoName: row.repo_name,
      action: row.action,
      filePath: row.file_path,
      revision: row.revision,
      username: row.username,
      detail: row.detail,
      createdAt: row.created_at,
    }))
  })
}
