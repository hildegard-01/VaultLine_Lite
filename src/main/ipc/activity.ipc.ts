import { handleIpc } from './index'
import { getDatabase } from '../services/DatabaseService'

/**
 * 활동 로그 IPC 핸들러
 *
 * 채널:
 * - activity:list        — 활동 로그 목록 조회 (필터/페이지네이션)
 * - activity:stats       — 통계 집계 (전체 건수, 최다 액션, 최활발 사용자, 액션 종류 수)
 * - activity:export-csv  — 필터링된 활동 로그 CSV 문자열 반환
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

  // ─── 통계 집계 ───
  handleIpc('activity:stats', (args: unknown) => {
    const { days } = (args || {}) as { days?: number }
    const db = getDatabase()

    const timeClause = days && days > 0
      ? `WHERE created_at >= datetime('now', ?)`
      : ''
    const timeParam = days && days > 0 ? [`-${days} days`] : []

    const totalRow = db.prepare(
      `SELECT COUNT(*) as c FROM activity_log ${timeClause}`
    ).get(...timeParam) as { c: number }

    const topActionRow = db.prepare(
      `SELECT action, COUNT(*) as c FROM activity_log
       ${timeClause}
       GROUP BY action ORDER BY c DESC LIMIT 1`
    ).get(...timeParam) as { action: string; c: number } | undefined

    const topUserRow = db.prepare(
      `SELECT username, COUNT(*) as c FROM activity_log
       ${timeClause ? `${timeClause} AND` : 'WHERE'} username IS NOT NULL
       GROUP BY username ORDER BY c DESC LIMIT 1`
    ).get(...timeParam) as { username: string; c: number } | undefined

    const typesRow = db.prepare(
      `SELECT COUNT(DISTINCT action) as c FROM activity_log ${timeClause}`
    ).get(...timeParam) as { c: number }

    return {
      totalCount: totalRow.c,
      topAction: topActionRow?.action ?? null,
      topUser: topUserRow?.username ?? null,
      actionTypes: typesRow.c,
    }
  })

  // ─── CSV 내보내기 ───
  handleIpc('activity:export-csv', (args: unknown) => {
    const { repoId, action, startDate, endDate } = (args || {}) as {
      repoId?: number
      action?: string
      startDate?: string
      endDate?: string
    }
    const db = getDatabase()

    const conditions: string[] = []
    const params: unknown[] = []
    if (repoId) { conditions.push('a.repo_id = ?'); params.push(repoId) }
    if (action) { conditions.push('a.action LIKE ?'); params.push(`${action}%`) }
    if (startDate) { conditions.push('a.created_at >= ?'); params.push(startDate) }
    if (endDate) { conditions.push('a.created_at <= ?'); params.push(endDate) }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const rows = db.prepare(`
      SELECT a.id, r.name as repo_name, a.action, a.file_path,
             a.revision, a.username, a.detail, a.created_at
      FROM activity_log a
      LEFT JOIN repositories r ON r.id = a.repo_id
      ${where}
      ORDER BY a.created_at DESC
    `).all(...params) as Array<{
      id: number
      repo_name: string | null
      action: string
      file_path: string | null
      revision: number | null
      username: string | null
      detail: string | null
      created_at: string
    }>

    const header = 'ID,저장소,액션,파일경로,리비전,사용자,상세,일시\n'
    const body = rows.map(r => [
      r.id,
      escapeCsv(r.repo_name ?? ''),
      escapeCsv(r.action),
      escapeCsv(r.file_path ?? ''),
      r.revision ?? '',
      escapeCsv(r.username ?? ''),
      escapeCsv(r.detail ?? ''),
      escapeCsv(r.created_at),
    ].join(',')).join('\n')

    // UTF-8 BOM 추가해서 Excel 한글 깨짐 방지
    return { csv: '﻿' + header + body }
  })
}

function escapeCsv(v: string): string {
  if (v == null) return ''
  if (/[",\n\r]/.test(v)) {
    return '"' + v.replace(/"/g, '""') + '"'
  }
  return v
}
