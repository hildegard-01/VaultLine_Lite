import { handleIpc } from './index'
import * as SettingsService from '../services/SettingsService'
import * as BackupService from '../services/BackupService'
import * as SvnService from '../services/SvnService'
import * as CommitService from '../services/CommitService'
import { getLockStatus } from '../services/LockService'
import { getDatabase } from '../services/DatabaseService'
import type { Repository, SvnStatusEntry as IpcStatusEntry } from '@shared/types/ipc'

/**
 * 설정 + 백업 + 일괄 커밋 IPC 핸들러 (Phase 10)
 *
 * 채널:
 * - settings:get/update          — 앱 전역 설정
 * - settings:repo-get/repo-update — 저장소별 설정
 * - settings:disk-usage          — 디스크 사용량
 * - backup:create/restore/list/delete — 백업 관리
 * - commit:status/batch/batch-revert — 일괄 변경 관리
 */

export function registerSettingsHandlers(): void {
  // ─── 앱 설정 ───

  handleIpc('settings:get', () => {
    return SettingsService.getAppSettings()
  })

  handleIpc('settings:update', (args) => {
    const partial = args as Record<string, unknown>
    return SettingsService.updateAppSettings(partial)
  })

  handleIpc('settings:repo-get', (args) => {
    const { repoId } = args as { repoId: number }
    return SettingsService.getRepoSettings(repoId)
  })

  handleIpc('settings:repo-update', (args) => {
    const { repoId, ...partial } = args as { repoId: number } & Record<string, unknown>
    return SettingsService.updateRepoSettings(repoId, partial)
  })

  handleIpc('settings:disk-usage', () => {
    return SettingsService.getDiskUsage()
  })

  // ─── 백업 ───

  handleIpc('backup:create', async () => {
    return BackupService.createBackup()
  })

  handleIpc('backup:restore', async (args) => {
    const { id } = args as { id: string }
    await BackupService.restoreBackup(id)
  })

  handleIpc('backup:list', () => {
    return BackupService.listBackups()
  })

  handleIpc('backup:delete', (args) => {
    const { id } = args as { id: string }
    BackupService.deleteBackup(id)
  })

  // ─── 일괄 변경 감지/커밋/폐기 (REQ-038) ───

  handleIpc('commit:status', async (args) => {
    const { repoId } = args as { repoId: number }
    const db = getDatabase()
    const repo = db.prepare(`
      SELECT wc_path as wcPath FROM repositories WHERE id = ? AND status = 'active'
    `).get(repoId) as { wcPath: string } | undefined
    if (!repo) throw new Error('저장소를 찾을 수 없습니다.')

    const { relative, normalize } = require('path')
    const wcNorm = normalize(repo.wcPath)
    const entries = await SvnService.status(repo.wcPath)
    return entries.map(e => {
      const pathNorm = normalize(e.path)
      let relPath: string
      if (pathNorm.startsWith(wcNorm)) {
        relPath = relative(wcNorm, pathNorm).replace(/\\/g, '/')
      } else {
        // 이미 상대 경로이거나 다른 형식이면 슬래시로만 정규화
        relPath = e.path.replace(/\\/g, '/')
      }
      return { path: relPath, status: e.status }
    }) as IpcStatusEntry[]
  })

  handleIpc('commit:batch', async (args) => {
    const { repoId, filePaths, commitMessage } = args as {
      repoId: number; filePaths: string[]; commitMessage: string
    }
    const db = getDatabase()
    const repo = db.prepare(`
      SELECT id, name, svn_path as svnPath, wc_path as wcPath
      FROM repositories WHERE id = ? AND status = 'active'
    `).get(repoId) as Repository | undefined
    if (!repo) throw new Error('저장소를 찾을 수 없습니다.')

    // 보호잠금 파일 필터링
    const blocked: string[] = []
    const allowed: string[] = []
    for (const fp of filePaths) {
      const lock = getLockStatus(repoId, fp)
      if (lock?.locked) {
        blocked.push(fp)
      } else {
        allowed.push(fp)
      }
    }
    if (blocked.length > 0 && allowed.length === 0) {
      throw new Error(`보호 잠금 파일만 선택되었습니다: ${blocked.join(', ')}`)
    }

    const { join } = require('path')
    const wcPaths = allowed.map(fp => join(repo.wcPath, fp))
    const revision = await SvnService.commit(repo.wcPath, commitMessage, wcPaths)

    // 활동 로그
    db.prepare(`
      INSERT INTO activity_log (repo_id, action, detail, revision, created_at)
      VALUES (?, 'file.commit', ?, ?, CURRENT_TIMESTAMP)
    `).run(repoId, `일괄 커밋: ${allowed.length}개 파일`, revision)

    return { revision }
  })

  handleIpc('commit:batch-revert', async (args) => {
    const { repoId, filePaths } = args as { repoId: number; filePaths: string[] }
    for (const fp of filePaths) {
      await CommitService.discardChanges(repoId, fp)
    }
  })
}
