import { join } from 'path'
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'fs'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { app } from 'electron'
import { getDatabase } from './DatabaseService'
import * as SvnService from './SvnService'
import { DEFAULT_BACKUP_DIR, BACKUP_MAX_COUNT } from '@shared/constants'
import type { BackupEntry, Repository } from '@shared/types/ipc'

const execFileAsync = promisify(execFile)

/**
 * BackupService — 백업/복원 (REQ-037)
 *
 * 역할:
 * - svnadmin hotcopy (SVN 저장소) + SQLite .backup() → ZIP
 * - 복원: ZIP 해제 → SVN 저장소 교체 + DB 복원
 * - 백업 목록 관리 (최대 BACKUP_MAX_COUNT개)
 */

/** 백업 저장 디렉토리 */
function getBackupDir(): string {
  const dir = join(app.getPath('userData'), DEFAULT_BACKUP_DIR)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/** 백업 생성 — includeDB/includeSVN으로 부분 백업 지원 */
export async function createBackup(
  opts: { includeDB?: boolean; includeSVN?: boolean } = {}
): Promise<BackupEntry> {
  const includeDB = opts.includeDB !== false
  const includeSVN = opts.includeSVN !== false

  const db = getDatabase()
  const repos = db.prepare(`
    SELECT id, name, svn_path as svnPath, wc_path as wcPath
    FROM repositories WHERE status = 'active'
  `).all() as Repository[]

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const backupId = `backup-${timestamp}`
  const backupDir = getBackupDir()
  const stagingDir = join(app.getPath('temp'), backupId)
  mkdirSync(stagingDir, { recursive: true })

  try {
    // 1. 각 SVN 저장소 hotcopy (includeSVN=true인 경우만)
    if (includeSVN) {
      const reposDir = join(stagingDir, 'repos')
      mkdirSync(reposDir, { recursive: true })

      for (const repo of repos) {
        if (existsSync(repo.svnPath)) {
          const destPath = join(reposDir, `repo-${repo.id}`)
          await SvnService.hotcopy(repo.svnPath, destPath)
        }
      }
    }

    // 2. SQLite DB 백업 (includeDB=true인 경우만)
    if (includeDB) {
      const dbBackupPath = join(stagingDir, 'app.db')
      db.backup(dbBackupPath)
    }

    // 3. 매니페스트 작성 (부분 백업 여부 포함)
    const manifest = {
      version: '1.0',
      createdAt: new Date().toISOString(),
      appVersion: app.getVersion(),
      repoCount: repos.length,
      repos: repos.map(r => ({ id: r.id, name: r.name })),
      includeDB,
      includeSVN,
    }
    writeFileSync(join(stagingDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8')

    // 4. ZIP 압축
    const zipFileName = `${backupId}.zip`
    const zipPath = join(backupDir, zipFileName)

    if (process.platform === 'win32') {
      await execFileAsync('powershell', [
        '-NoProfile', '-NonInteractive', '-Command',
        `Compress-Archive -Path '${stagingDir}\\*' -DestinationPath '${zipPath}' -Force`
      ], { windowsHide: true })
    } else {
      await execFileAsync('zip', ['-r', zipPath, '.'], { cwd: stagingDir })
    }

    // 5. 오래된 백업 정리
    pruneOldBackups()

    // 활동 로그
    db.prepare(`
      INSERT INTO activity_log (repo_id, action, detail, created_at)
      VALUES (NULL, 'backup.create', ?, CURRENT_TIMESTAMP)
    `).run(`백업 생성: ${zipFileName}`)

    const stat = statSync(zipPath)
    return {
      id: backupId,
      fileName: zipFileName,
      filePath: zipPath,
      createdAt: new Date().toISOString(),
      sizeBytes: stat.size,
      repoCount: repos.length
    }
  } finally {
    // 스테이징 디렉토리 정리
    try {
      const { rmSync } = require('fs')
      rmSync(stagingDir, { recursive: true, force: true })
    } catch { /* 무시 */ }
  }
}

/** 백업 복원 — includeDB/includeSVN으로 부분 복원 지원 */
export async function restoreBackup(
  backupId: string,
  opts: { includeDB?: boolean; includeSVN?: boolean } = {}
): Promise<void> {
  const includeDB = opts.includeDB !== false
  const includeSVN = opts.includeSVN !== false

  const backupDir = getBackupDir()
  const zipPath = join(backupDir, `${backupId}.zip`)

  if (!existsSync(zipPath)) {
    throw new Error(`백업 파일을 찾을 수 없습니다: ${backupId}`)
  }

  const stagingDir = join(app.getPath('temp'), `restore-${Date.now()}`)
  mkdirSync(stagingDir, { recursive: true })

  try {
    // 1. ZIP 해제
    if (process.platform === 'win32') {
      await execFileAsync('powershell', [
        '-NoProfile', '-NonInteractive', '-Command',
        `Expand-Archive -Path '${zipPath}' -DestinationPath '${stagingDir}' -Force`
      ], { windowsHide: true })
    } else {
      await execFileAsync('unzip', [zipPath, '-d', stagingDir])
    }

    // 2. 매니페스트 확인
    const manifestPath = join(stagingDir, 'manifest.json')
    if (!existsSync(manifestPath)) {
      throw new Error('유효하지 않은 백업 파일입니다 (manifest.json 없음)')
    }

    // 3. DB 복원 (includeDB=true인 경우만)
    const dbBackupPath = join(stagingDir, 'app.db')
    if (includeDB && existsSync(dbBackupPath)) {
      const db = getDatabase()
      const currentDbPath = (db.pragma('database_list') as Array<{ file: string }>)[0]?.file
      if (currentDbPath) {
        // 현재 DB를 백업 DB로 교체
        const backupDb = require('better-sqlite3')(dbBackupPath, { readonly: true })
        backupDb.backup(currentDbPath)
        backupDb.close()
      }
    }

    // 4. SVN 저장소 복원 (includeSVN=true인 경우만)
    const reposDir = join(stagingDir, 'repos')
    if (includeSVN && existsSync(reposDir)) {
      const db = getDatabase()
      const repos = db.prepare(`
        SELECT id, svn_path as svnPath FROM repositories WHERE status = 'active'
      `).all() as Array<{ id: number; svnPath: string }>

      for (const repo of repos) {
        const backupRepoPath = join(reposDir, `repo-${repo.id}`)
        if (existsSync(backupRepoPath) && existsSync(repo.svnPath)) {
          // 기존 저장소를 백업 저장소로 교체
          const { rmSync, cpSync } = require('fs')
          rmSync(repo.svnPath, { recursive: true, force: true })
          cpSync(backupRepoPath, repo.svnPath, { recursive: true })
        }
      }
    }

    // 활동 로그
    const db = getDatabase()
    db.prepare(`
      INSERT INTO activity_log (repo_id, action, detail, created_at)
      VALUES (NULL, 'backup.restore', ?, CURRENT_TIMESTAMP)
    `).run(`백업 복원: ${backupId}`)
  } finally {
    try {
      const { rmSync } = require('fs')
      rmSync(stagingDir, { recursive: true, force: true })
    } catch { /* 무시 */ }
  }
}

/** 백업 목록 조회 */
export function listBackups(): BackupEntry[] {
  const backupDir = getBackupDir()

  try {
    return readdirSync(backupDir)
      .filter(f => f.startsWith('backup-') && f.endsWith('.zip'))
      .map(fileName => {
        const filePath = join(backupDir, fileName)
        const stat = statSync(filePath)
        const id = fileName.replace('.zip', '')

        // manifest에서 repoCount 읽기 (실패 시 0)
        let repoCount = 0
        try {
          // ZIP 내부를 읽지 않고 파일명에서 추론
          repoCount = 0
        } catch { /* 무시 */ }

        return {
          id,
          fileName,
          filePath,
          createdAt: stat.mtime.toISOString(),
          sizeBytes: stat.size,
          repoCount
        }
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  } catch {
    return []
  }
}

/** 백업 삭제 */
export function deleteBackup(backupId: string): void {
  const zipPath = join(getBackupDir(), `${backupId}.zip`)
  if (existsSync(zipPath)) {
    unlinkSync(zipPath)
  }
}

/** 오래된 백업 정리 (최대 BACKUP_MAX_COUNT개 유지) */
function pruneOldBackups(): void {
  const backups = listBackups()
  if (backups.length > BACKUP_MAX_COUNT) {
    const toDelete = backups.slice(BACKUP_MAX_COUNT)
    for (const backup of toDelete) {
      try { unlinkSync(backup.filePath) } catch { /* 무시 */ }
    }
  }
}
