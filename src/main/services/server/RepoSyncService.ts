/**
 * RepoSyncService — 커밋 메타데이터 서버 push
 *
 * 역할: 로컬 커밋 후 메타데이터를 서버에 push합니다.
 *       오프라인 시 server_sync_queue에 큐잉, 재연결 시 일괄 push.
 */

import log from 'electron-log'
import { getDatabase } from '../DatabaseService'
import { ServerConnectionService } from './ServerConnectionService'
import { modeManager } from './ModeManager'

interface CommitMeta {
  repoId: number
  revision: number
  author: string
  message: string
  date: string
  changedFiles: Array<{ action: string; path: string; size: number }>
  fileTreeSnapshot: Array<{ path: string; isDirectory: boolean; size: number; rev: number }>
}

export const RepoSyncService = {
  /** 커밋 메타 push (커넥티드 → 즉시, 오프라인 → 큐잉) */
  async pushCommit(meta: CommitMeta): Promise<void> {
    if (modeManager.isConnected()) {
      try {
        const client = ServerConnectionService.getClient()
        await client.post('/sync/commit', {
          repo_id: meta.repoId,
          revision: meta.revision,
          author: meta.author,
          message: meta.message,
          date: meta.date,
          changed_files: meta.changedFiles.map(f => ({
            action: f.action, path: f.path, size: f.size,
          })),
          file_tree_snapshot: meta.fileTreeSnapshot.map(f => ({
            path: f.path, is_directory: f.isDirectory, size: f.size, rev: f.rev,
          })),
        })
        log.info(`[RepoSync] r.${meta.revision} push 완료`)
        return
      } catch (err) {
        log.warn('[RepoSync] push 실패, 큐에 저장:', (err as Error).message)
      }
    }

    // 오프라인 또는 push 실패 → 큐잉
    this.enqueue(meta)
  },

  /** 큐에 저장 */
  enqueue(meta: CommitMeta): void {
    const db = getDatabase()
    db.prepare(`
      INSERT OR IGNORE INTO server_sync_queue (repo_id, revision, payload, created_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `).run(meta.repoId, meta.revision, JSON.stringify(meta))
  },

  /** 큐 일괄 push (재연결 시 호출) */
  async flushQueue(): Promise<number> {
    if (!modeManager.isConnected()) return 0

    const db = getDatabase()
    const rows = db.prepare('SELECT id, payload FROM server_sync_queue ORDER BY created_at').all() as Array<{
      id: number; payload: string
    }>

    let pushed = 0
    for (const row of rows) {
      try {
        const meta: CommitMeta = JSON.parse(row.payload)
        const client = ServerConnectionService.getClient()
        await client.post('/sync/commit', {
          repo_id: meta.repoId,
          revision: meta.revision,
          author: meta.author,
          message: meta.message,
          date: meta.date,
          changed_files: meta.changedFiles,
          file_tree_snapshot: meta.fileTreeSnapshot,
        })
        db.prepare('DELETE FROM server_sync_queue WHERE id = ?').run(row.id)
        pushed++
      } catch {
        break // 실패 시 나머지 중단
      }
    }

    if (pushed > 0) {
      log.info(`[RepoSync] 큐 ${pushed}건 push 완료`)
    }
    return pushed
  },
}
