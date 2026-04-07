import { getDatabase } from './DatabaseService'
import * as SvnService from './SvnService'
import type { RemoteRepo, ConflictEntry } from '@shared/types/ipc'

/**
 * SyncService — 원격 저장소 동기화 (REQ-032, REQ-034)
 *
 * 역할:
 * - svn update로 원격 변경 동기화
 * - 충돌 감지 → ConflictEntry 목록 반환
 * - svn resolve로 충돌 해결 (mine/theirs)
 */

/** 원격 저장소 조회 */
function getRemoteRepo(id: number): RemoteRepo {
  const db = getDatabase()
  const repo = db.prepare(`
    SELECT id, display_name as displayName, svn_url as svnUrl, wc_path as wcPath,
           username, password_plain as passwordPlain
    FROM remote_repos WHERE id = ?
  `).get(id) as RemoteRepo | undefined
  if (!repo) throw new Error('원격 저장소를 찾을 수 없습니다.')
  return repo
}

/** svn update 실행 + 충돌 감지 */
export async function update(remoteRepoId: number): Promise<{ updated: boolean; conflicts: ConflictEntry[] }> {
  const repo = getRemoteRepo(remoteRepoId)

  // svn update (인증 포함)
  const result = await SvnService.updateWithAuth(repo.wcPath, repo.username, repo.passwordPlain)

  // 충돌 파일 감지 (svn status에서 'C' 상태)
  const statusEntries = await SvnService.status(repo.wcPath)
  const conflicts: ConflictEntry[] = statusEntries
    .filter(e => e.status === 'conflicted')
    .map(e => ({ filePath: e.path }))

  // DB 갱신
  const db = getDatabase()
  const connStatus = conflicts.length > 0 ? 'connected' : 'connected'
  db.prepare(
    'UPDATE remote_repos SET connection_status = ?, last_synced = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(connStatus, remoteRepoId)

  if (conflicts.length > 0) {
    db.prepare(`
      INSERT INTO activity_log (action, detail, created_at)
      VALUES ('sync.conflict', ?, CURRENT_TIMESTAMP)
    `).run(`동기화 충돌 ${conflicts.length}개: ${repo.displayName}`)
  }

  return { updated: result.updated, conflicts }
}

/** 충돌 해결 */
export async function resolveConflict(
  remoteRepoId: number,
  filePath: string,
  resolution: 'mine' | 'theirs'
): Promise<void> {
  const repo = getRemoteRepo(remoteRepoId)

  const acceptOption = resolution === 'mine' ? 'mine-full' : 'theirs-full'
  await SvnService.resolve(repo.wcPath, filePath, acceptOption)

  const db = getDatabase()
  db.prepare(`
    INSERT INTO activity_log (action, file_path, detail, created_at)
    VALUES ('sync.resolve', ?, ?, CURRENT_TIMESTAMP)
  `).run(filePath, `충돌 해결: ${resolution === 'mine' ? '내 것 유지' : '상대 것 수락'}`)
}
