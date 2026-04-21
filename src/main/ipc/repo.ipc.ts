import { handleIpc } from './index'
import * as RepoService from '../services/RepoService'
import { getDatabase } from '../services/DatabaseService'
import type { CreateRepoRequest, ImportRepoRequest, Repository } from '@shared/types/ipc'

/**
 * 저장소 IPC 핸들러
 *
 * 기본(Phase 2): repo:list, repo:create, repo:import, repo:update, repo:delete, repo:stats
 * 관리자(Phase U): repo:admin-list, repo:set-quota, repo:mark-deletion, repo:cancel-deletion
 */

export function registerRepoHandlers(): void {
  // 저장소 목록
  handleIpc('repo:list', () => {
    return RepoService.listRepos()
  })

  // 저장소 생성
  handleIpc('repo:create', async (args: unknown) => {
    const req = args as CreateRepoRequest
    return await RepoService.createRepo(req)
  })

  // 기존 폴더 가져오기
  handleIpc('repo:import', async (args: unknown) => {
    const req = args as ImportRepoRequest
    return await RepoService.importRepo(req)
  })

  // 저장소 설정 수정
  handleIpc('repo:update', (args: unknown) => {
    const { id, ...updates } = args as { id: number } & Partial<Repository>
    return RepoService.updateRepo(id, updates)
  })

  // 저장소 삭제
  handleIpc('repo:delete', (args: unknown) => {
    const { id } = args as { id: number }
    RepoService.deleteRepo(id)
  })

  // 저장소 통계
  handleIpc('repo:stats', async (args: unknown) => {
    const { id } = args as { id: number }
    return await RepoService.getRepoStats(id)
  })

  // ─── 관리자 확장 ───

  // 관리자용 목록: 쿼터·사용량·상태·예약삭제 포함
  handleIpc('repo:admin-list', async () => {
    const db = getDatabase()
    const rows = db.prepare(`
      SELECT id, name, description, quota_bytes, status,
             pending_deletion_at, created_at, last_accessed
      FROM repositories
      ORDER BY display_order, id
    `).all() as Array<{
      id: number; name: string; description: string;
      quota_bytes: number | null; status: string;
      pending_deletion_at: string | null;
      created_at: string; last_accessed: string | null;
    }>

    const result: Array<{
      id: number; name: string; description: string;
      quotaBytes: number | null; usedBytes: number;
      fileCount: number; revisions: number;
      status: string; pendingDeletionAt: string | null;
      createdAt: string; lastAccessed: string | null;
    }> = []

    for (const row of rows) {
      let stats = { fileCount: 0, totalSize: 0, revisions: 0 }
      try {
        stats = await RepoService.getRepoStats(row.id)
      } catch { /* 오프라인/손상된 저장소 — 0 유지 */ }

      result.push({
        id: row.id,
        name: row.name,
        description: row.description,
        quotaBytes: row.quota_bytes,
        usedBytes: stats.totalSize,
        fileCount: stats.fileCount,
        revisions: stats.revisions,
        status: row.status,
        pendingDeletionAt: row.pending_deletion_at,
        createdAt: row.created_at,
        lastAccessed: row.last_accessed,
      })
    }
    return result
  })

  // 저장소 쿼터 설정 (null = 무제한)
  handleIpc('repo:set-quota', (args: unknown) => {
    const { id, quotaBytes } = args as { id: number; quotaBytes: number | null }
    const db = getDatabase()
    db.prepare(`UPDATE repositories SET quota_bytes = ? WHERE id = ?`).run(quotaBytes, id)
    db.prepare(`
      INSERT INTO activity_log (repo_id, action, detail)
      VALUES (?, 'repo.set-quota', ?)
    `).run(id, quotaBytes === null ? '쿼터 무제한' : `쿼터 ${quotaBytes} bytes`)
  })

  // 예약 삭제 (30일 후 실제 삭제 대상)
  handleIpc('repo:mark-deletion', (args: unknown) => {
    const { id } = args as { id: number }
    const db = getDatabase()
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
    db.prepare(`
      UPDATE repositories SET pending_deletion_at = ?, status = 'pending_deletion'
      WHERE id = ?
    `).run(now, id)
    db.prepare(`
      INSERT INTO activity_log (repo_id, action, detail)
      VALUES (?, 'repo.mark-deletion', '예약 삭제 (30일 후 제거)')
    `).run(id)
    return { pendingDeletionAt: now }
  })

  // 예약 삭제 취소
  handleIpc('repo:cancel-deletion', (args: unknown) => {
    const { id } = args as { id: number }
    const db = getDatabase()
    db.prepare(`
      UPDATE repositories SET pending_deletion_at = NULL, status = 'active'
      WHERE id = ?
    `).run(id)
    db.prepare(`
      INSERT INTO activity_log (repo_id, action, detail)
      VALUES (?, 'repo.cancel-deletion', '예약 삭제 취소')
    `).run(id)
  })
}
