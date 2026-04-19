import { getDatabase } from './DatabaseService'
import type { SearchRequest, SearchResult } from '@shared/types/ipc'
import { SEARCH_MAX_RESULTS } from '@shared/constants'

/**
 * SearchService — FTS5 검색 서비스
 *
 * 역할:
 * - 파일명 검색 (FTS5 file_name 컬럼)
 * - 커밋 메시지 검색 (FTS5 commit_message 컬럼)
 * - 저장소별 / 전체 통합 검색
 * - 검색 인덱스 재구축
 */

/** 저장소별 검색 */
export function search(req: SearchRequest): SearchResult[] {
  const db = getDatabase()
  const limit = SEARCH_MAX_RESULTS

  // FTS5 검색 쿼리 — 특수문자 이스케이프
  const safeQuery = escapeFts5Query(req.query)
  if (!safeQuery) return []

  let sql: string
  const params: unknown[] = []

  if (req.repoId) {
    // 특정 저장소 검색
    sql = `
      SELECT si.repo_id, r.name as repo_name, si.file_path, si.revision,
             snippet(search_index, 3, '<mark>', '</mark>', '...', 32) as snippet
      FROM search_index si
      JOIN repositories r ON r.id = CAST(si.repo_id AS INTEGER)
      WHERE search_index MATCH ? AND CAST(si.repo_id AS INTEGER) = ?
      ORDER BY rank
      LIMIT ?
    `
    params.push(buildMatchQuery(safeQuery, req.type), req.repoId, limit)
  } else {
    // 전체 저장소 검색
    sql = `
      SELECT si.repo_id, r.name as repo_name, si.file_path, si.revision,
             snippet(search_index, 3, '<mark>', '</mark>', '...', 32) as snippet
      FROM search_index si
      JOIN repositories r ON r.id = CAST(si.repo_id AS INTEGER)
      WHERE search_index MATCH ?
      ORDER BY rank
      LIMIT ?
    `
    params.push(buildMatchQuery(safeQuery, req.type), limit)
  }

  try {
    console.log('[Search] 쿼리 실행:', buildMatchQuery(safeQuery, req.type), 'repoId:', req.repoId)
    const rows = db.prepare(sql).all(...params) as Array<{
      repo_id: number
      repo_name: string
      file_path: string
      revision: number
      snippet: string
    }>
    console.log('[Search] 결과 수:', rows.length)

    return rows.map((row) => ({
      repoId: row.repo_id,
      repoName: row.repo_name,
      filePath: row.file_path,
      matchType: req.type || 'filename',
      snippet: row.snippet || '',
      revision: row.revision
    }))
  } catch (e) {
    console.error('[Search] FTS5 쿼리 오류:', e)
    return []
  }
}

/** 전체 저장소 통합 검색 (FTS5 → LIKE 폴백) */
export function globalSearch(query: string): SearchResult[] {
  const db = getDatabase()
  const count = (db.prepare('SELECT COUNT(*) as cnt FROM search_index').get() as { cnt: number }).cnt
  console.log('[Search] search_index 총 행 수:', count)

  // FTS5 전체 컬럼 검색 시도
  const ftsResults = search({ query, type: undefined as any })
  if (ftsResults.length > 0) return ftsResults

  // FTS5에서 결과 없으면 search_metadata 일반 테이블에서 LIKE 폴백 (부분 문자열 검색)
  const pattern = `%${query}%`
  try {
    const rows = db.prepare(`
      SELECT sm.repo_id, r.name as repo_name, sm.file_path, sm.revision,
             sm.file_name, sm.commit_message
      FROM search_metadata sm
      JOIN repositories r ON r.id = sm.repo_id
      WHERE sm.file_path LIKE ? OR sm.file_name LIKE ? OR sm.commit_message LIKE ?
      LIMIT ?
    `).all(pattern, pattern, pattern, SEARCH_MAX_RESULTS) as Array<{
      repo_id: number; repo_name: string; file_path: string; revision: number; file_name: string; commit_message: string
    }>
    console.log('[Search] LIKE 폴백 결과 수:', rows.length)

    return rows.map(row => {
      const q = query.toLowerCase()
      const nameMatch = row.file_name && row.file_name.toLowerCase().includes(q)
      const commitMatch = row.commit_message && row.commit_message.toLowerCase().includes(q)
      return {
        repoId: row.repo_id,
        repoName: row.repo_name,
        filePath: row.file_path,
        matchType: (nameMatch ? 'filename' : commitMatch ? 'commit' : 'filename') as 'filename' | 'commit' | 'content',
        snippet: nameMatch ? row.file_name : row.commit_message || '',
        revision: row.revision
      }
    })
  } catch (e) {
    console.error('[Search] LIKE 폴백 실패:', e)
    return []
  }
}

/** 검색 인덱스 재구축 (특정 저장소) */
export function reindexRepo(repoId: number): { indexed: number } {
  const db = getDatabase()

  // 기존 인덱스 삭제
  db.prepare('DELETE FROM search_index WHERE repo_id = ?').run(repoId)
  db.prepare('DELETE FROM search_metadata WHERE repo_id = ?').run(repoId)

  // search_metadata에서 재구축할 데이터가 없으므로,
  // 실제 재인덱싱은 커밋 시 자동으로 이루어짐
  // 여기서는 기존 데이터만 정리
  return { indexed: 0 }
}

/** FTS5 매치 쿼리 구성 */
function buildMatchQuery(query: string, type?: string): string {
  switch (type) {
    case 'filename':
      return `file_name:${query}`
    case 'commit':
      return `commit_message:${query}`
    case 'content':
      return `content_text:${query}`
    default:
      // 전체 컬럼 검색
      return query
  }
}

/** FTS5 특수문자 이스케이프 */
function escapeFts5Query(query: string): string {
  // 빈 쿼리 방지
  const trimmed = query.trim()
  if (!trimmed) return ''

  // FTS5 특수 문자 이스케이프: " → ""
  // 전체를 큰따옴표로 감싸서 구문 검색
  if (trimmed.includes('"') || trimmed.includes("'")) {
    return '"' + trimmed.replace(/"/g, '""') + '"'
  }

  // 공백 포함 시 각 단어를 prefix 검색으로 AND 연결
  if (trimmed.includes(' ')) {
    return trimmed
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => `"${w}"*`)
      .join(' ')
  }

  // 단일 단어: prefix 검색 (* 접미사)
  return `"${trimmed}"*`
}
