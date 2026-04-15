import { getDatabase } from './DatabaseService'
import type { Tag } from '@shared/types/ipc'
import { modeManager } from './server/ModeManager'
import { MetadataSyncService } from './server/MetadataSyncService'

/**
 * TagService — 태그 CRUD + 자동 규칙
 */

/** 태그 목록 */
export function listTags(): Tag[] {
  const db = getDatabase()
  return db.prepare('SELECT id, name, color, created_at as createdAt FROM tags ORDER BY name').all() as Tag[]
}

/** 태그 생성 */
export function createTag(name: string, color: string = '#1565C0'): Tag {
  const db = getDatabase()
  const result = db.prepare('INSERT INTO tags (name, color) VALUES (?, ?)').run(name, color)
  return { id: result.lastInsertRowid as number, name, color, createdAt: new Date().toISOString() }
}

/** 태그 수정 */
export function updateTag(id: number, name?: string, color?: string): void {
  const db = getDatabase()
  if (name !== undefined) db.prepare('UPDATE tags SET name = ? WHERE id = ?').run(name, id)
  if (color !== undefined) db.prepare('UPDATE tags SET color = ? WHERE id = ?').run(color, id)
}

/** 태그 삭제 (CASCADE로 file_tags, tag_rules도 삭제) */
export function deleteTag(id: number): void {
  const db = getDatabase()
  db.prepare('DELETE FROM tags WHERE id = ?').run(id)
}

/** 파일에 태그 부착 */
export function attachTag(repoId: number, filePath: string, tagId: number): void {
  const db = getDatabase()
  db.prepare(`
    INSERT OR IGNORE INTO file_tags (repo_id, file_path, tag_id)
    VALUES (?, ?, ?)
  `).run(repoId, filePath, tagId)
  // 서버 동기화 훅 (Phase C)
  if (modeManager.isConnected()) MetadataSyncService.pushTagAttach(repoId, filePath, tagId).catch(() => {})
}

/** 파일에서 태그 제거 */
export function detachTag(repoId: number, filePath: string, tagId: number): void {
  const db = getDatabase()
  db.prepare('DELETE FROM file_tags WHERE repo_id = ? AND file_path = ? AND tag_id = ?')
    .run(repoId, filePath, tagId)
  // 서버 동기화 훅 (Phase C)
  if (modeManager.isConnected()) MetadataSyncService.pushTagDetach(repoId, filePath, tagId).catch(() => {})
}

/** 파일의 태그 목록 */
export function getFileTags(repoId: number, filePath: string): Tag[] {
  const db = getDatabase()
  return db.prepare(`
    SELECT t.id, t.name, t.color, t.created_at as createdAt
    FROM tags t
    JOIN file_tags ft ON ft.tag_id = t.id
    WHERE ft.repo_id = ? AND ft.file_path = ?
    ORDER BY t.name
  `).all(repoId, filePath) as Tag[]
}

/** 태그별 파일 목록 (전체 저장소) — 파일 크기/날짜 포함 */
export function getFilesByTag(tagId: number): Array<{ repoId: number; repoName: string; filePath: string; fileSize: number; modifiedAt: string }> {
  const db = getDatabase()
  const rows = db.prepare(`
    SELECT ft.repo_id as repoId, r.name as repoName, r.wc_path as wcPath, ft.file_path as filePath
    FROM file_tags ft
    JOIN repositories r ON r.id = ft.repo_id
    WHERE ft.tag_id = ? AND r.status = 'active'
    ORDER BY r.name, ft.file_path
  `).all(tagId) as Array<{ repoId: number; repoName: string; wcPath: string; filePath: string }>

  const { join } = require('path')
  const { statSync, existsSync } = require('fs')

  return rows.map(row => {
    let fileSize = 0
    let modifiedAt = ''
    try {
      const fullPath = join(row.wcPath, row.filePath)
      if (existsSync(fullPath)) {
        const stat = statSync(fullPath)
        fileSize = stat.size
        modifiedAt = stat.mtime.toISOString()
      }
    } catch { /* 무시 */ }
    return { repoId: row.repoId, repoName: row.repoName, filePath: row.filePath, fileSize, modifiedAt }
  })
}

/** 자동 태그 규칙 목록 */
export function listTagRules(): Array<{ id: number; tagId: number; tagName: string; patternType: string; pattern: string; isActive: boolean }> {
  const db = getDatabase()
  return db.prepare(`
    SELECT tr.id, tr.tag_id as tagId, t.name as tagName, tr.pattern_type as patternType,
           tr.pattern, tr.is_active as isActive
    FROM tag_rules tr
    JOIN tags t ON t.id = tr.tag_id
    ORDER BY tr.id
  `).all() as Array<{ id: number; tagId: number; tagName: string; patternType: string; pattern: string; isActive: boolean }>
}

/** 자동 태그 규칙 추가 */
export function createTagRule(tagId: number, patternType: string, pattern: string): number {
  const db = getDatabase()
  const result = db.prepare(
    'INSERT INTO tag_rules (tag_id, pattern_type, pattern) VALUES (?, ?, ?)'
  ).run(tagId, patternType, pattern)
  return result.lastInsertRowid as number
}

/** 자동 태그 규칙 삭제 */
export function deleteTagRule(id: number): void {
  const db = getDatabase()
  db.prepare('DELETE FROM tag_rules WHERE id = ?').run(id)
}

/** 커밋 후 자동 태그 적용 */
export function applyAutoTags(repoId: number, filePath: string): void {
  const db = getDatabase()
  const rules = db.prepare('SELECT tag_id, pattern_type, pattern FROM tag_rules WHERE is_active = 1').all() as Array<{
    tag_id: number; pattern_type: string; pattern: string
  }>

  for (const rule of rules) {
    if (matchesRule(filePath, rule.pattern_type, rule.pattern)) {
      attachTag(repoId, filePath, rule.tag_id)
    }
  }
}

/** 규칙 매칭 */
function matchesRule(filePath: string, patternType: string, pattern: string): boolean {
  switch (patternType) {
    case 'extension': {
      const ext = pattern.startsWith('.') ? pattern : `.${pattern}`
      return filePath.toLowerCase().endsWith(ext.toLowerCase())
    }
    case 'path':
      return filePath.startsWith(pattern.replace(/\*/g, ''))
    case 'name':
      return filePath.toLowerCase().includes(pattern.toLowerCase())
    default:
      return false
  }
}
