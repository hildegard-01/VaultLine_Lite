import { getDatabase } from './DatabaseService'
import * as SvnService from './SvnService'
import type { FileEntry, FileListRequest } from '@shared/types/ipc'
import type { Repository } from '@shared/types/ipc'

/**
 * FileService — 파일 탐색 서비스
 *
 * 역할:
 * - 디렉토리 내 파일/폴더 목록 조회
 * - 파일 상세 정보 조회
 * - 보호잠금 상태 병합 (Phase 8에서 활성화)
 */

/** 저장소 ID로 저장소 정보 조회 */
function getRepoById(repoId: number): Repository {
  const db = getDatabase()
  const repo = db.prepare(`
    SELECT id, name, svn_path as svnPath, wc_path as wcPath, description,
           icon, display_order as displayOrder, created_at as createdAt,
           last_accessed as lastAccessed, status
    FROM repositories WHERE id = ? AND status = 'active'
  `).get(repoId) as Repository | undefined

  if (!repo) throw new Error('저장소를 찾을 수 없습니다.')

  // last_accessed 갱신
  db.prepare('UPDATE repositories SET last_accessed = CURRENT_TIMESTAMP WHERE id = ?').run(repoId)

  return repo
}

/** 파일/폴더 목록 조회 */
export async function listFiles(req: FileListRequest): Promise<FileEntry[]> {
  const repo = getRepoById(req.repoId)
  const svnEntries = await SvnService.list(repo.wcPath, req.path, repo.svnPath)

  // 보호잠금 상태 조회 (현재 경로의 파일들)
  const db = getDatabase()
  const locks = db.prepare(`
    SELECT file_path FROM file_locks WHERE repo_id = ?
  `).all(req.repoId) as { file_path: string }[]
  const lockedPaths = new Set(locks.map((l) => l.file_path))

  return svnEntries.map((entry) => {
    const filePath = req.path ? `${req.path}/${entry.name}` : entry.name
    return {
      name: entry.name,
      path: filePath,
      type: entry.kind,
      size: entry.size,
      revision: entry.revision,
      author: entry.author,
      date: entry.date,
      locked: lockedPaths.has(filePath),
      lockOwner: undefined // Phase 8에서 구현
    }
  })
}

/** 파일 상세 정보 */
export async function getFileInfo(repoId: number, path: string): Promise<FileEntry> {
  const repo = getRepoById(repoId)
  const svnInfo = await SvnService.info(repo.wcPath, path)

  // 보호잠금 상태
  const db = getDatabase()
  const lock = db.prepare(
    'SELECT file_path FROM file_locks WHERE repo_id = ? AND file_path = ?'
  ).get(repoId, path)

  return {
    name: path.split('/').pop() || path,
    path,
    type: svnInfo.kind,
    size: svnInfo.size,
    revision: svnInfo.revision,
    author: svnInfo.author,
    date: svnInfo.date,
    locked: !!lock,
    lockOwner: undefined
  }
}

/** 라인별 작성자 (blame) */
export async function getBlame(repoId: number, path: string) {
  const repo = getRepoById(repoId)
  return await SvnService.blame(repo.wcPath, path)
}
