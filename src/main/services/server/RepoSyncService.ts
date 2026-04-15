import { getDatabase } from '../DatabaseService'
import { getAxiosInstance } from './ServerConnectionService'
import * as ModeManager from './ModeManager'
import * as SvnService from '../SvnService'

/**
 * RepoSyncService — 커밋 메타데이터 서버 push
 *
 * 역할:
 * - 커밋 성공 후 메타데이터를 서버 POST /sync/commit 으로 전송
 * - 전송 실패(오프라인/타임아웃) 시 server_sync_queue에 저장
 * - 서버 재연결 시 큐 일괄 전송 (flushQueue)
 *
 * 구성:
 * - pushCommitMeta(): 커밋 후 즉시 push 또는 큐잉
 * - buildFileTreeSnapshot(): SVN list로 현재 파일 트리 구성
 * - flushQueue(): 미전송 큐 일괄 전송
 * - enqueue(): DB 큐에 저장
 */

interface ChangedFile {
  action: string  // A / M / D
  path: string
  size: number
}

interface FileTreeEntry {
  path: string
  is_directory: boolean
  size: number
  rev: number | null
  author: string | null
  modified: string | null
}

interface CommitPushPayload {
  repo_id: number
  revision: number
  author: string
  message: string | null
  date: string
  changed_files: ChangedFile[]
  file_tree_snapshot: FileTreeEntry[]
}

/**
 * 커밋 후 메타데이터 push
 * CommitService.ts의 uploadAndCommit / uploadNewVersion 완료 후 호출
 */
export async function pushCommitMeta(
  repoId: number,
  revision: number,
  changedFiles: ChangedFile[],
  wcPath: string,
  svnPath: string
): Promise<void> {
  // 서버에 등록된 repo_id 조회 (로컬 DB)
  const serverRepoId = getServerRepoId(repoId)
  if (serverRepoId === null) return // 서버 미등록 저장소 → 무시

  const config = ModeManager.getServerConfig()
  if (!config?.sync?.pushCommitMeta) return // 설정 off

  const user = ModeManager.getCurrentUser()
  const author = user?.username ?? 'unknown'

  // 파일 트리 스냅샷 빌드
  let fileTreeSnapshot: FileTreeEntry[] = []
  try {
    fileTreeSnapshot = await buildFileTreeSnapshot(wcPath, svnPath)
  } catch {
    // 스냅샷 실패해도 커밋 메타는 전송
  }

  const payload: CommitPushPayload = {
    repo_id: serverRepoId,
    revision,
    author,
    message: null, // CommitService에서 추가로 전달
    date: new Date().toISOString(),
    changed_files: changedFiles,
    file_tree_snapshot: fileTreeSnapshot
  }

  await _sendOrEnqueue(repoId, 'commit_meta', payload)
}

/**
 * 커밋 메시지 포함 버전 (CommitService에서 직접 호출)
 */
export async function pushCommitMetaFull(
  repoId: number,
  revision: number,
  commitMessage: string,
  changedFiles: ChangedFile[],
  wcPath: string,
  svnPath: string
): Promise<void> {
  const serverRepoId = getServerRepoId(repoId)
  if (serverRepoId === null) return

  const config = ModeManager.getServerConfig()
  if (!config?.sync?.pushCommitMeta) return

  const user = ModeManager.getCurrentUser()
  const author = user?.username ?? 'unknown'

  let fileTreeSnapshot: FileTreeEntry[] = []
  try {
    fileTreeSnapshot = await buildFileTreeSnapshot(wcPath, svnPath)
  } catch {
    // 스냅샷 실패 무시
  }

  const payload: CommitPushPayload = {
    repo_id: serverRepoId,
    revision,
    author,
    message: commitMessage,
    date: new Date().toISOString(),
    changed_files: changedFiles,
    file_tree_snapshot: fileTreeSnapshot
  }

  await _sendOrEnqueue(repoId, 'commit_meta', payload)
}

/**
 * SVN list로 현재 파일 트리 스냅샷 생성
 * 재귀적으로 모든 파일/디렉토리를 수집
 */
async function buildFileTreeSnapshot(wcPath: string, svnPath: string): Promise<FileTreeEntry[]> {
  const entries = await SvnService.list(wcPath, '', svnPath)

  return entries.map((e) => ({
    path: e.name,
    is_directory: e.kind === 'dir',
    size: e.size ?? 0,
    rev: e.revision ?? null,
    author: e.author ?? null,
    modified: e.date ?? null
  }))
}

/**
 * 서버로 즉시 전송 또는 큐에 저장
 */
async function _sendOrEnqueue(repoId: number, action: string, payload: CommitPushPayload): Promise<void> {
  if (!ModeManager.isConnected()) {
    enqueue(repoId, action, payload)
    return
  }

  try {
    const instance = getAxiosInstance()
    await instance.post('/sync/commit', payload)
  } catch {
    // 전송 실패 → 큐에 저장
    enqueue(repoId, action, payload)
    // 오프라인 전환
    ModeManager.setOffline()
  }
}

/**
 * 미전송 큐 일괄 전송 (서버 재연결 시 호출)
 */
export async function flushQueue(): Promise<void> {
  if (!ModeManager.isConnected()) return

  const db = getDatabase()
  const rows = db.prepare(`
    SELECT id, repo_id, action, payload
    FROM server_sync_queue
    WHERE synced_at IS NULL
    ORDER BY id ASC
    LIMIT 100
  `).all() as { id: number; repo_id: number; action: string; payload: string }[]

  if (rows.length === 0) return

  const instance = getAxiosInstance()

  for (const row of rows) {
    try {
      const payload = JSON.parse(row.payload)

      if (row.action === 'commit_meta') {
        await instance.post('/sync/commit', payload)
      }
      // 다른 action 타입은 MetadataSyncService에서 처리

      db.prepare(`
        UPDATE server_sync_queue SET synced_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(row.id)
    } catch {
      // 하나 실패해도 다음 항목 계속 시도
      break // 서버 오류 시 중단 (오프라인 가능성)
    }
  }
}

/** 로컬 저장소 ID → 서버 저장소 ID 조회 */
function getServerRepoId(localRepoId: number): number | null {
  const db = getDatabase()
  const row = db.prepare(`
    SELECT value FROM app_settings WHERE key = ?
  `).get(`server_repo_id_${localRepoId}`) as { value: string } | undefined
  return row ? parseInt(row.value, 10) : null
}

/** 로컬-서버 저장소 ID 매핑 저장 */
export function saveServerRepoId(localRepoId: number, serverRepoId: number): void {
  const db = getDatabase()
  db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `).run(`server_repo_id_${localRepoId}`, String(serverRepoId))
}

/** DB 큐에 저장 */
function enqueue(repoId: number, action: string, payload: object): void {
  try {
    const db = getDatabase()
    db.prepare(`
      INSERT INTO server_sync_queue (repo_id, action, payload, created_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `).run(repoId, action, JSON.stringify(payload))
  } catch {
    // DB 오류 무시 (로컬 기능 우선)
  }
}
