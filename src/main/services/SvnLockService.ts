import { getDatabase } from './DatabaseService'
import * as SvnService from './SvnService'
import type { SvnLockEntry } from '@shared/types/ipc'

/**
 * SvnLockService — P2P SVN 잠금 관리 (REQ-033)
 *
 * 역할:
 * - svn lock/unlock 실행 (보호잠금과 별도)
 * - 잠금 캐시 (svn_locks 테이블)
 * - 잠금 소유자 표시
 */

/** 저장소 정보 조회 (로컬 또는 원격) */
function getRepoInfo(repoId: number, repoType: 'local' | 'remote'): { wcPath: string; username?: string; password?: string } {
  const db = getDatabase()

  if (repoType === 'local') {
    const repo = db.prepare(
      "SELECT wc_path as wcPath FROM repositories WHERE id = ? AND status = 'active'"
    ).get(repoId) as { wcPath: string } | undefined
    if (!repo) throw new Error('저장소를 찾을 수 없습니다.')
    return { wcPath: repo.wcPath }
  } else {
    const repo = db.prepare(
      'SELECT wc_path as wcPath, username, password_plain as password FROM remote_repos WHERE id = ?'
    ).get(repoId) as { wcPath: string; username: string; password: string } | undefined
    if (!repo) throw new Error('원격 저장소를 찾을 수 없습니다.')
    return repo
  }
}

/** SVN 잠금 */
export async function lock(
  repoId: number,
  repoType: 'local' | 'remote',
  filePath: string,
  comment: string = ''
): Promise<void> {
  const info = getRepoInfo(repoId, repoType)

  await SvnService.svnLock(info.wcPath, filePath, comment, info.username, info.password)

  // 캐시에 저장
  const db = getDatabase()
  db.prepare(`
    INSERT OR REPLACE INTO svn_locks (repo_id, repo_type, file_path, locked_by, lock_comment, locked_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(repoId, repoType, filePath, info.username || 'local', comment)
}

/** SVN 잠금 해제 */
export async function unlock(
  repoId: number,
  repoType: 'local' | 'remote',
  filePath: string
): Promise<void> {
  const info = getRepoInfo(repoId, repoType)

  await SvnService.svnUnlock(info.wcPath, filePath, info.username, info.password)

  // 캐시에서 제거
  const db = getDatabase()
  db.prepare(
    'DELETE FROM svn_locks WHERE repo_id = ? AND repo_type = ? AND file_path = ?'
  ).run(repoId, repoType, filePath)
}

/** SVN 잠금 목록 */
export function listLocks(repoId: number, repoType: 'local' | 'remote'): SvnLockEntry[] {
  const db = getDatabase()
  return db.prepare(`
    SELECT id, repo_id as repoId, repo_type as repoType, file_path as filePath,
           locked_by as lockedBy, lock_token as lockToken, lock_comment as lockComment,
           locked_at as lockedAt
    FROM svn_locks WHERE repo_id = ? AND repo_type = ?
    ORDER BY locked_at DESC
  `).all(repoId, repoType) as SvnLockEntry[]
}
