import { getDatabase } from './DatabaseService'
import type { LockEntry, LockRule } from '@shared/types/ipc'
import * as ModeManager from './server/ModeManager'
import { syncActivity } from './server/MetadataSyncService'

/**
 * LockService — 보호 잠금 관리 (REQ-023, REQ-024)
 *
 * 역할:
 * - DB 플래그 기반 보호 잠금/해제 (SVN lock과 별개)
 * - 잠금 상태에서 덮어쓰기/삭제/이동/이름변경 차단
 * - 자동 잠금 규칙 관리 (확장자/경로/이름 패턴)
 */

/** 특정 파일의 잠금 상태 조회 */
export function getLockStatus(
  repoId: number,
  filePath: string
): { locked: boolean; reason: string; lockedAt: string } | null {
  const db = getDatabase()
  const row = db.prepare(`
    SELECT reason, locked_at as lockedAt
    FROM file_locks WHERE repo_id = ? AND file_path = ?
  `).get(repoId, filePath) as { reason: string; lockedAt: string } | undefined

  if (!row) return null
  return { locked: true, reason: row.reason, lockedAt: row.lockedAt }
}

/** 잠금/해제 토글 — 파일시스템 읽기 전용도 동기화 */
export function toggleLock(
  repoId: number,
  filePath: string,
  reason: string = '수동 보호'
): { locked: boolean } {
  const db = getDatabase()
  const existing = db.prepare(
    'SELECT id FROM file_locks WHERE repo_id = ? AND file_path = ?'
  ).get(repoId, filePath)

  // WC 파일 경로 조회
  const repo = db.prepare(
    "SELECT wc_path FROM repositories WHERE id = ? AND status = 'active'"
  ).get(repoId) as { wc_path: string } | undefined

  if (existing) {
    // 해제
    db.prepare('DELETE FROM file_locks WHERE repo_id = ? AND file_path = ?')
      .run(repoId, filePath)
    db.prepare(`
      INSERT INTO activity_log (repo_id, action, file_path, detail, created_at)
      VALUES (?, 'file.unlock', ?, '보호 잠금 해제', CURRENT_TIMESTAMP)
    `).run(repoId, filePath)

    // 파일시스템 쓰기 권한 복원
    if (repo) {
      try {
        const { join } = require('path')
        const { chmodSync, statSync } = require('fs')
        const fullPath = join(repo.wc_path, filePath)
        const stat = statSync(fullPath)
        chmodSync(fullPath, stat.mode | 0o666)
      } catch { /* 무시 */ }
    }

    // 서버 동기화 훅 (Phase C)
    if (ModeManager.isConnected()) syncActivity(repoId, 'file.unlock', filePath).catch(() => {})

    return { locked: false }
  } else {
    // 잠금
    db.prepare(`
      INSERT INTO file_locks (repo_id, file_path, reason)
      VALUES (?, ?, ?)
    `).run(repoId, filePath, reason)
    db.prepare(`
      INSERT INTO activity_log (repo_id, action, file_path, detail, created_at)
      VALUES (?, 'file.lock', ?, ?, CURRENT_TIMESTAMP)
    `).run(repoId, filePath, `보호 잠금 설정: ${reason}`)

    // 파일시스템 읽기 전용 설정
    if (repo) {
      try {
        const { join } = require('path')
        const { chmodSync, statSync } = require('fs')
        const fullPath = join(repo.wc_path, filePath)
        const stat = statSync(fullPath)
        chmodSync(fullPath, stat.mode & ~0o222)
      } catch { /* 무시 */ }
    }

    // 서버 동기화 훅 (Phase C)
    if (ModeManager.isConnected()) syncActivity(repoId, 'file.lock', `${filePath}: ${reason}`).catch(() => {})

    return { locked: true }
  }
}

/** 저장소의 전체 잠금 목록 */
export function listLocks(repoId: number): LockEntry[] {
  const db = getDatabase()
  return db.prepare(`
    SELECT id, repo_id as repoId, file_path as filePath, reason,
           auto_rule_id as autoRuleId, locked_at as lockedAt
    FROM file_locks WHERE repo_id = ?
    ORDER BY locked_at DESC
  `).all(repoId) as LockEntry[]
}

/** 자동 잠금 규칙 목록 */
export function listLockRules(): LockRule[] {
  const db = getDatabase()
  return db.prepare(`
    SELECT id, pattern_type as patternType, pattern, reason,
           is_active as isActive, created_at as createdAt
    FROM lock_rules ORDER BY id
  `).all() as LockRule[]
}

/** 자동 잠금 규칙 추가 */
export function createLockRule(
  patternType: string,
  pattern: string,
  reason: string = '자동 보호'
): LockRule {
  const db = getDatabase()
  const result = db.prepare(`
    INSERT INTO lock_rules (pattern_type, pattern, reason)
    VALUES (?, ?, ?)
  `).run(patternType, pattern, reason)
  return {
    id: result.lastInsertRowid as number,
    patternType: patternType as LockRule['patternType'],
    pattern,
    reason,
    isActive: true,
    createdAt: new Date().toISOString()
  }
}

/** 자동 잠금 규칙 삭제 */
export function deleteLockRule(id: number): void {
  const db = getDatabase()
  db.prepare('DELETE FROM lock_rules WHERE id = ?').run(id)
}

/** 파일 추가/커밋 후 자동 잠금 규칙 적용 */
export function applyAutoLockRules(repoId: number, filePath: string): void {
  const db = getDatabase()
  const rules = db.prepare(
    'SELECT id, pattern_type, pattern, reason FROM lock_rules WHERE is_active = 1'
  ).all() as Array<{ id: number; pattern_type: string; pattern: string; reason: string }>

  for (const rule of rules) {
    if (matchesLockRule(filePath, rule.pattern_type, rule.pattern)) {
      // 이미 잠겨 있으면 스킵
      const already = db.prepare(
        'SELECT id FROM file_locks WHERE repo_id = ? AND file_path = ?'
      ).get(repoId, filePath)
      if (already) continue

      db.prepare(`
        INSERT INTO file_locks (repo_id, file_path, reason, auto_rule_id)
        VALUES (?, ?, ?, ?)
      `).run(repoId, filePath, rule.reason, rule.id)
    }
  }
}

/** 규칙 패턴 매칭 */
function matchesLockRule(filePath: string, patternType: string, pattern: string): boolean {
  switch (patternType) {
    case 'extension': {
      const ext = pattern.startsWith('.') ? pattern : `.${pattern}`
      return filePath.toLowerCase().endsWith(ext.toLowerCase())
    }
    case 'path':
      return filePath.startsWith(pattern)
    case 'name':
      return filePath.toLowerCase().includes(pattern.toLowerCase())
    default:
      return false
  }
}
