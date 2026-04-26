import { getDatabase } from './DatabaseService'
import type { AppSettings, RepoSettings } from '@shared/types/ipc'

/**
 * SettingsService — 설정 3계층 관리 (REQ-036)
 *
 * 역할:
 * - 앱 전역 설정 (app_settings 테이블)
 * - 저장소별 설정 (repo_settings 테이블)
 * - 파일별 설정은 file_locks 등 기존 테이블로 대체
 *
 * 3계층 우선순위: 파일 > 저장소 > 앱 전역
 */

// 앱 설정 기본값
const APP_DEFAULTS: AppSettings = {
  dataDir: '',
  svnBinaryPath: '',
  libreOfficePath: '',
  theme: 'system',
  language: 'ko',
  autoCommit: false,
  autoCommitDelay: 5,
  sidebarWidth: 200,
  defaultView: 'list',
  shareServerPort: 9090,
  shareExpiryMinutes: 60,
  savedServerUrl: '',
  savedUsername: '',
  autoLoginDays: 0,
  trayMinimize: false,
}

/** 앱 전역 설정 조회 */
export function getAppSettings(): AppSettings {
  const db = getDatabase()
  const rows = db.prepare('SELECT key, value FROM app_settings').all() as Array<{ key: string; value: string }>

  const settings = { ...APP_DEFAULTS }
  for (const row of rows) {
    const key = row.key as keyof AppSettings
    if (key in settings) {
      const val = row.value
      // 타입에 맞게 변환
      if (typeof APP_DEFAULTS[key] === 'boolean') {
        (settings as any)[key] = val === '1' || val === 'true'
      } else if (typeof APP_DEFAULTS[key] === 'number') {
        (settings as any)[key] = Number(val)
      } else {
        (settings as any)[key] = val
      }
    }
  }
  return settings
}

/** 앱 전역 설정 업데이트 */
export function updateAppSettings(partial: Partial<AppSettings>): AppSettings {
  const db = getDatabase()
  const upsert = db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `)

  const update = db.transaction(() => {
    for (const [key, value] of Object.entries(partial)) {
      if (value !== undefined) {
        upsert.run(key, String(value))
      }
    }
  })
  update()

  return getAppSettings()
}

/** 저장소별 설정 조회 */
export function getRepoSettings(repoId: number): RepoSettings {
  const db = getDatabase()
  const row = db.prepare(`
    SELECT repo_id as repoId,
           trash_retention_days as trashRetentionDays,
           auto_commit as autoCommit,
           auto_commit_delay as autoCommitDelay,
           default_commit_msg as defaultCommitMsg,
           folder_template as folderTemplate
    FROM repo_settings WHERE repo_id = ?
  `).get(repoId) as RepoSettings | undefined

  if (row) {
    return {
      ...row,
      autoCommit: !!row.autoCommit
    }
  }

  // 기본값 반환
  return {
    repoId,
    trashRetentionDays: 30,
    autoCommit: false,
    autoCommitDelay: 5,
    defaultCommitMsg: '',
    folderTemplate: ''
  }
}

/** 저장소별 설정 업데이트 */
export function updateRepoSettings(repoId: number, partial: Partial<RepoSettings>): RepoSettings {
  const db = getDatabase()

  // 기존 행이 있는지 확인
  const existing = db.prepare('SELECT repo_id FROM repo_settings WHERE repo_id = ?').get(repoId)

  if (existing) {
    const sets: string[] = []
    const values: unknown[] = []

    if (partial.trashRetentionDays !== undefined) { sets.push('trash_retention_days = ?'); values.push(partial.trashRetentionDays) }
    if (partial.autoCommit !== undefined) { sets.push('auto_commit = ?'); values.push(partial.autoCommit ? 1 : 0) }
    if (partial.autoCommitDelay !== undefined) { sets.push('auto_commit_delay = ?'); values.push(partial.autoCommitDelay) }
    if (partial.defaultCommitMsg !== undefined) { sets.push('default_commit_msg = ?'); values.push(partial.defaultCommitMsg) }
    if (partial.folderTemplate !== undefined) { sets.push('folder_template = ?'); values.push(partial.folderTemplate) }

    if (sets.length > 0) {
      values.push(repoId)
      db.prepare(`UPDATE repo_settings SET ${sets.join(', ')} WHERE repo_id = ?`).run(...values)
    }
  } else {
    db.prepare(`
      INSERT INTO repo_settings (repo_id, trash_retention_days, auto_commit, auto_commit_delay, default_commit_msg, folder_template)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      repoId,
      partial.trashRetentionDays ?? 30,
      partial.autoCommit ? 1 : 0,
      partial.autoCommitDelay ?? 5,
      partial.defaultCommitMsg ?? '',
      partial.folderTemplate ?? ''
    )
  }

  return getRepoSettings(repoId)
}

/** 디스크 사용량 조회 */
export function getDiskUsage(): { used: number; total: number } {
  const db = getDatabase()
  const repos = db.prepare("SELECT svn_path, wc_path FROM repositories WHERE status = 'active'").all() as Array<{ svn_path: string; wc_path: string }>

  let used = 0
  const { statSync, readdirSync } = require('fs')
  const { join } = require('path')

  function dirSize(dir: string): number {
    let size = 0
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = join(dir, entry.name)
        if (entry.isDirectory()) {
          size += dirSize(fullPath)
        } else {
          try { size += statSync(fullPath).size } catch { /* 접근 불가 파일 무시 */ }
        }
      }
    } catch { /* 디렉토리 접근 실패 무시 */ }
    return size
  }

  for (const repo of repos) {
    used += dirSize(repo.svn_path)
    used += dirSize(repo.wc_path)
  }

  // DB 파일 크기
  try {
    const dbPath = (db.pragma('database_list') as Array<{ file: string }>)[0]?.file
    if (dbPath) used += statSync(dbPath).size
  } catch { /* 무시 */ }

  // total: 해당 드라이브의 전체 용량 (간이 조회)
  let total = 0
  try {
    const { execSync } = require('child_process')
    if (process.platform === 'win32') {
      const out = execSync('wmic logicaldisk get size,freespace,caption', { encoding: 'utf-8' })
      const lines = out.trim().split('\n').slice(1)
      for (const line of lines) {
        const parts = line.trim().split(/\s+/)
        if (parts.length >= 3) {
          total = parseInt(parts[2], 10) || 0
          break
        }
      }
    }
  } catch { /* 무시 */ }

  return { used, total }
}
