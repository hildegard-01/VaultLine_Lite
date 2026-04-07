/**
 * IPC 채널 타입 정의
 * Main ↔ Renderer 간 타입 안전 통신을 위한 공유 타입
 */

// IPC 응답 공통 패턴
export interface IpcResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

// === 저장소 ===
export interface Repository {
  id: number
  name: string
  svnPath: string
  wcPath: string
  description: string
  icon: string
  displayOrder: number
  createdAt: string
  lastAccessed: string | null
  status: 'active' | 'archived'
}

export interface CreateRepoRequest {
  name: string
  description?: string
  folderTemplate?: 'empty' | 'business' | 'project' | 'custom'
  customFolders?: string[]
}

export interface ImportRepoRequest {
  name: string
  sourcePath: string
  description?: string
}

// === 파일 ===
export interface FileEntry {
  name: string
  path: string
  type: 'file' | 'dir'
  size: number
  revision: number
  author: string
  date: string
  locked: boolean
  lockOwner?: string
}

export interface FileListRequest {
  repoId: number
  path: string
}

export interface FileUploadRequest {
  repoId: number
  targetPath: string
  filePaths: string[]
  commitMessage: string
}

// === 커밋 ===
export interface CommitLogEntry {
  revision: number
  author: string
  date: string
  message: string
}

export interface CommitLogRequest {
  repoId: number
  path: string
  limit?: number
}

export interface DiffRequest {
  repoId: number
  path: string
  rev1: number
  rev2: number
}

// === 검색 ===
export interface SearchRequest {
  repoId?: number
  query: string
  type: 'filename' | 'commit' | 'content'
}

export interface SearchResult {
  repoId: number
  repoName: string
  filePath: string
  matchType: 'filename' | 'commit' | 'content'
  snippet: string
  revision: number
}

// === 태그 ===
export interface Tag {
  id: number
  name: string
  color: string
  createdAt: string
}

// === 보호 잠금 ===
export interface LockEntry {
  id: number
  repoId: number
  filePath: string
  reason: string
  autoRuleId: number | null
  lockedAt: string
}

export interface LockRule {
  id: number
  patternType: 'extension' | 'path' | 'name'
  pattern: string
  reason: string
  isActive: boolean
  createdAt: string
}

// === 로컬 공유 ===
export interface ShareServerStatus {
  running: boolean
  url?: string
  token?: string
  expiresAt?: string
  repoId?: number
  filePath?: string
  hasPassword?: boolean
  maxDownloads?: number
  accessCount?: number
}

// === 파일 감시 (Phase 9) ===
export interface PendingChange {
  repoId: number
  filePath: string
  fileName: string
  changeType: 'modified' | 'added' | 'deleted'
  detectedAt: string
}

// === 활동 로그 ===
export interface ActivityLogEntry {
  id: number
  repoId: number | null
  action: string
  filePath: string | null
  revision: number | null
  username: string | null
  detail: string | null
  createdAt: string
}

// === 백업 (Phase 10) ===
export interface BackupEntry {
  id: string
  fileName: string
  filePath: string
  createdAt: string
  sizeBytes: number
  repoCount: number
}

// === P2P 공유 (Phase 11) ===
export interface SharedUser {
  id: number
  repoId: number
  username: string
  displayName: string
  passwordPlain: string
  permission: 'r' | 'rw'
  isActive: boolean
  createdAt: string
}

export interface Invitation {
  id: number
  repoId: number
  sharedUserId: number
  token: string
  expiresAt: string
  oneTime: boolean
  isUsed: boolean
  createdAt: string
}

export interface RemoteRepo {
  id: number
  displayName: string
  svnUrl: string
  wcPath: string
  username: string
  passwordPlain: string
  ownerName: string | null
  permission: 'r' | 'rw'
  connectionStatus: 'connected' | 'unreachable' | 'unknown'
  lastSynced: string | null
  createdAt: string
}

export interface SvnServeStatus {
  running: boolean
  repoId?: number
  port?: number
  pid?: number
  userCount?: number
}

export interface SvnLockEntry {
  id: number
  repoId: number
  repoType: 'local' | 'remote'
  filePath: string
  lockedBy: string
  lockToken: string | null
  lockComment: string
  lockedAt: string
}

export interface ConflictEntry {
  filePath: string
  mineContent?: string
  theirsContent?: string
}

// === SVN 변경 상태 (Phase 10) ===
export interface SvnStatusEntry {
  path: string
  status: 'modified' | 'added' | 'deleted' | 'unversioned' | 'missing' | 'conflicted'
}

// === 설정 ===
export interface AppSettings {
  dataDir: string
  svnBinaryPath: string
  libreOfficePath: string
  theme: 'system' | 'light' | 'dark'
  language: 'ko' | 'en'
  autoCommit: boolean
  autoCommitDelay: number
  sidebarWidth: number
  defaultView: 'list' | 'grid'
  shareServerPort: number
  shareExpiryMinutes: number
}

// === 저장소별 설정 (Phase 10) ===
export interface RepoSettings {
  repoId: number
  trashRetentionDays: number
  autoCommit: boolean
  autoCommitDelay: number
  defaultCommitMsg: string
  folderTemplate: string
}

// === IPC 채널 맵 ===
export interface IpcChannelMap {
  // 저장소
  'repo:list': { req: void; res: Repository[] }
  'repo:create': { req: CreateRepoRequest; res: Repository }
  'repo:import': { req: ImportRepoRequest; res: Repository }
  'repo:update': { req: { id: number } & Partial<Repository>; res: Repository }
  'repo:delete': { req: { id: number }; res: void }
  'repo:stats': { req: { id: number }; res: { fileCount: number; totalSize: number; revisions: number } }

  // 파일
  'file:list': { req: FileListRequest; res: FileEntry[] }
  'file:info': { req: { repoId: number; path: string }; res: FileEntry }
  'file:upload': { req: FileUploadRequest; res: { revision: number } }
  'file:mkdir': { req: { repoId: number; path: string; commitMessage: string }; res: void }
  'file:rename': { req: { repoId: number; oldPath: string; newName: string; commitMessage: string }; res: void }
  'file:move': { req: { repoId: number; srcPath: string; destPath: string; commitMessage: string }; res: void }
  'file:delete': { req: { repoId: number; path: string; commitMessage: string }; res: void }
  'file:open-external': { req: { repoId: number; path: string }; res: void }
  'file:restore-version': { req: { repoId: number; path: string; targetRevision: number; commitMessage: string }; res: { revision: number } }
  'file:restore-deleted': { req: { repoId: number; trashItemId: number; commitMessage: string }; res: { revision: number } }
  'file:upload-version': { req: { repoId: number; filePath: string; srcPath: string; commitMessage: string }; res: { revision: number } }

  // 커밋
  'commit:log': { req: CommitLogRequest; res: CommitLogEntry[] }
  'commit:diff': { req: DiffRequest; res: string }
  'commit:discard': { req: { repoId: number; path: string }; res: void }

  // 미리보기
  'preview:generate': { req: { repoId: number; path: string; revision?: number }; res: { cachePath: string; type: string } }
  'preview:read-file': { req: { filePath: string }; res: { data: string } }
  'tag:file-tags': { req: { repoId: number; filePath: string }; res: Tag[] }

  // 검색
  'search:query': { req: SearchRequest; res: SearchResult[] }
  'search:global': { req: { query: string }; res: SearchResult[] }

  // 태그
  'tag:list': { req: void; res: Tag[] }
  'tag:create': { req: { name: string; color?: string }; res: Tag }
  'tag:update': { req: { id: number; name?: string; color?: string }; res: void }
  'tag:delete': { req: { id: number }; res: void }
  'tag:files': { req: { tagId: number }; res: Array<{ repoId: number; repoName: string; filePath: string; fileSize: number; modifiedAt: string }> }
  'tag:attach': { req: { repoId: number; filePath: string; tagId: number }; res: void }
  'tag:detach': { req: { repoId: number; filePath: string; tagId: number }; res: void }

  // 즐겨찾기
  'bookmark:list': { req: void; res: Array<{ id: number; repoId: number; filePath: string; alias: string | null; displayOrder: number; createdAt: string }> }
  'bookmark:toggle': { req: { repoId: number; filePath: string }; res: { added: boolean } }
  'bookmark:check': { req: { repoId: number; filePath: string }; res: boolean }

  // 휴지통
  'trash:list': { req: { repoId?: number }; res: Array<{ id: number; repoId: number; repoName: string; filePath: string; deletedRevision: number; originalSize: number; deletedAt: string; expiresAt: string | null }> }
  'trash:purge': { req: { id: number }; res: void }
  'trash:empty': { req: { repoId?: number }; res: void }

  // 보호 잠금
  'lock:status': { req: { repoId: number; path: string }; res: { locked: boolean; reason: string; lockedAt: string } | null }
  'lock:toggle': { req: { repoId: number; path: string; reason?: string }; res: { locked: boolean } }
  'lock:list': { req: { repoId: number }; res: LockEntry[] }
  'lock:rules-list': { req: void; res: LockRule[] }
  'lock:rules-create': { req: { patternType: string; pattern: string; reason?: string }; res: LockRule }
  'lock:rules-delete': { req: { id: number }; res: void }

  // 로컬 공유
  'share:export': { req: { repoId: number; path: string }; res: { exportPath: string } }
  'share:start-server': { req: { repoId: number; path: string; expiryMinutes?: number; password?: string; maxDownloads?: number; port?: number }; res: ShareServerStatus }
  'share:stop-server': { req: void; res: void }
  'share:server-status': { req: void; res: ShareServerStatus }
  'share:copy-clipboard': { req: { repoId: number; path: string }; res: { url: string } }

  // 파일 감시 (Phase 9)
  'watcher:pending': { req: void; res: PendingChange[] }
  'watcher:commit-selected': { req: { repoId: number; filePaths: string[]; commitMessage: string }; res: { revision: number } }
  'watcher:discard': { req: { repoId: number; filePaths: string[] }; res: void }
  'watcher:has-pending': { req: void; res: boolean }

  // 드래그 내보내기 (Phase 9)
  'file:drag-export': { req: { repoId: number; path: string }; res: { tempPath: string } }

  // 설정 (Phase 10)
  'settings:get': { req: void; res: AppSettings }
  'settings:update': { req: Partial<AppSettings>; res: AppSettings }
  'settings:repo-get': { req: { repoId: number }; res: RepoSettings }
  'settings:repo-update': { req: { repoId: number } & Partial<RepoSettings>; res: RepoSettings }
  'settings:disk-usage': { req: void; res: { used: number; total: number } }
  'settings:app-info': { req: void; res: { version: string; electron: string; node: string } }

  // 백업 (Phase 10)
  'backup:create': { req: void; res: BackupEntry }
  'backup:restore': { req: { id: string }; res: void }
  'backup:list': { req: void; res: BackupEntry[] }
  'backup:delete': { req: { id: string }; res: void }

  // 일괄 변경 감지 (Phase 10)
  'commit:status': { req: { repoId: number }; res: SvnStatusEntry[] }
  'commit:batch': { req: { repoId: number; filePaths: string[]; commitMessage: string }; res: { revision: number } }
  'commit:batch-revert': { req: { repoId: number; filePaths: string[] }; res: void }

  // svnserve 관리 (Phase 11)
  'svnserve:start': { req: { repoId: number; port?: number }; res: SvnServeStatus }
  'svnserve:stop': { req: { repoId: number }; res: void }
  'svnserve:status': { req: { repoId: number }; res: SvnServeStatus }
  'svnserve:ip-address': { req: void; res: { ip: string } }

  // 공유 사용자 (Phase 11)
  'shared-user:list': { req: { repoId: number }; res: SharedUser[] }
  'shared-user:create': { req: { repoId: number; username: string; displayName: string; password: string; permission: 'r' | 'rw' }; res: SharedUser }
  'shared-user:update': { req: { id: number; displayName?: string; password?: string; permission?: 'r' | 'rw'; isActive?: boolean }; res: SharedUser }
  'shared-user:delete': { req: { id: number }; res: void }

  // 초대 (Phase 11)
  'invitation:create': { req: { repoId: number; sharedUserId: number; expiryMinutes?: number; oneTime?: boolean }; res: { invitation: Invitation; link: string } }
  'invitation:list': { req: { repoId: number }; res: Invitation[] }
  'invitation:validate': { req: { token: string }; res: { valid: boolean; repoName?: string; host?: string } }

  // 원격 저장소 — 게스트 측 (Phase 11)
  'remote-repo:accept': { req: { linkData: string }; res: RemoteRepo }
  'remote-repo:list': { req: void; res: RemoteRepo[] }
  'remote-repo:disconnect': { req: { id: number }; res: void }
  'remote-repo:status': { req: { id: number }; res: RemoteRepo }

  // 동기화 (Phase 11)
  'sync:update': { req: { remoteRepoId: number }; res: { updated: boolean; conflicts: ConflictEntry[] } }
  'sync:resolve-conflict': { req: { remoteRepoId: number; filePath: string; resolution: 'mine' | 'theirs' }; res: void }

  // SVN 잠금 — P2P (Phase 11)
  'svn-lock:lock': { req: { repoId: number; repoType: 'local' | 'remote'; path: string; comment?: string }; res: void }
  'svn-lock:unlock': { req: { repoId: number; repoType: 'local' | 'remote'; path: string }; res: void }
  'svn-lock:list': { req: { repoId: number; repoType: 'local' | 'remote' }; res: SvnLockEntry[] }
}
