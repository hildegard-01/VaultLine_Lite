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
  remoteRepoId?: number   // 공유받은 파일인 경우
  ownerName?: string
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
  url?: string          // 서버 베이스 URL (http://ip:port)
  port?: number
  activeLinkCount?: number
  // 새 링크 추가 시 응답에 포함 (ShareModal 호환)
  newLink?: ShareLinkEntry
}

export interface ShareLinkEntry {
  id: number
  repoId: number
  filePath: string
  repoName: string | null
  token: string
  expiresAt: string
  hasPassword: boolean
  maxDownloads: number | null
  accessCount: number
  createdAt: string
  downloadUrl: string   // 전체 다운로드 URL
}

// === 서버 공유 ===
export interface ShareRecipientItem {
  userId: number
  username: string
  displayName: string
  status: 'pending' | 'accepted' | 'rejected'
  accessedAt: string | null
}

export interface ServerShareItem {
  id: number
  repoId: number
  repoName: string | null
  filePath: string | null          // null = 저장소 전체
  permission: 'r' | 'rw'
  shareType: 'user' | 'group' | 'link'
  expiresAt: string | null         // null = 영구
  isActive: boolean
  accessCount: number
  createdAt: string
  ownerUserId: number
  ownerUsername: string
  ownerDisplayName: string
  recipients?: ShareRecipientItem[]
  shareUrl?: string
}

export interface ServerReceivedShareItem {
  id: number
  repoId: number
  filePath: string | null
  permission: 'r' | 'rw'
  expiresAt: string | null
  isActive: boolean
  createdAt: string
  ownerUserId: number
  ownerDisplayName: string | null
  myStatus: 'pending' | 'accepted' | 'rejected'
  respondedAt: string | null
}

export interface ServerUser {
  id: number
  username: string
  displayName: string
  isOnline?: boolean
}

// === 승인 워크플로우 ===
export interface ApprovalReviewerItem {
  userId: number
  username: string | null
  status: 'pending' | 'approved' | 'rejected'
  comment: string | null
  reviewedAt: string | null
}

export interface ApprovalItem {
  id: number
  repoId: number
  filePath: string | null
  revision: number | null
  requesterId: number
  requesterName: string | null
  message: string | null
  status: 'pending' | 'approved' | 'rejected'
  reviewers: ApprovalReviewerItem[]
  resolvedAt: string | null
  createdAt: string
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
  // Phase U — 관리자 UI 지원
  status?: 'active' | 'locked' | 'inactive'
  lastLoginAt?: string | null
  failedLoginCount?: number
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
  serverShareId?: number | null
  filePath?: string | null
}

export interface RemoteFileEntry {
  name: string
  path: string
  type: 'file' | 'dir'
  size: number
  modifiedAt?: string
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
  savedServerUrl: string
  savedUsername: string
  autoLoginDays: number
  trayMinimize: boolean
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
  'repo:admin-list': { req: void; res: Array<{ id: number; name: string; description: string; quotaBytes: number | null; usedBytes: number; fileCount: number; revisions: number; status: string; pendingDeletionAt: string | null; createdAt: string; lastAccessed: string | null }> }
  'repo:set-quota': { req: { id: number; quotaBytes: number | null }; res: void }
  'repo:mark-deletion': { req: { id: number }; res: { pendingDeletionAt: string } }
  'repo:cancel-deletion': { req: { id: number }; res: void }

  // 시스템 (Phase U)
  'system:health-check': { req: void; res: { svn: { ok: boolean; version?: string }; libreoffice: { ok: boolean; path?: string }; svnserve: { ok: boolean; running: boolean }; watcher: { ok: boolean } } }
  'system:info-full': { req: void; res: { version: string; electron: string; node: string; chrome: string; platform: string; arch: string; osRelease: string; uptime: number; dbSizeBytes: number; dataDir: string } }
  'system:startup-get': { req: void; res: { openAtLogin: boolean; openAsHidden: boolean } }
  'system:startup-set': { req: { openAtLogin: boolean; openAsHidden?: boolean }; res: void }
  'session:info': { req: void; res: { expiresAt: string | null } }
  'session:clear': { req: void; res: void }

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
  'file:bulk-move': { req: { repoId: number; srcPaths: string[]; destFolder: string; commitMessage: string }; res: { moved: number } }
  'file:cross-repo-move': { req: { srcRepoId: number; destRepoId: number; srcPaths: string[]; destFolder: string; commitMessage: string }; res: { moved: number } }

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

  // 활동 로그
  'activity:list': { req: { repoId?: number; action?: string; limit?: number; offset?: number }; res: Array<{ id: number; repoId: number | null; repoName: string | null; action: string; filePath: string | null; revision: number | null; username: string | null; detail: string | null; createdAt: string }> }
  'activity:stats': { req: { days?: number }; res: { totalCount: number; topAction: string | null; topUser: string | null; actionTypes: number } }
  'activity:export-csv': { req: { repoId?: number; action?: string; startDate?: string; endDate?: string }; res: { csv: string } }

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
  'share:restart-server': { req: void; res: ShareServerStatus }
  'share:stop-server': { req: void; res: void }
  'share:server-status': { req: void; res: ShareServerStatus }
  'share:copy-clipboard': { req: { repoId: number; path: string }; res: { url: string } }
  'share:link-list': { req: void; res: ShareLinkEntry[] }
  'share:list': { req: void; res: ShareLinkEntry[] }
  'share:revoke': { req: { id: number }; res: { id: number } }
  'share:link-update': { req: { id: number; expiresAt?: string; password?: string; clearPassword?: boolean }; res: ShareLinkEntry }

  // 서버 공유 (커넥티드 모드)
  'server:share-create': { req: { repoId: number; filePath: string; recipientIds: number[]; permission: 'r' | 'rw'; expiresAt?: string }; res: ServerShareItem }
  'server:share-list': { req: void; res: { sent: ServerShareItem[]; received: ServerShareItem[] } }
  'server:share-received': { req: { status?: 'pending' | 'accepted' | 'rejected' }; res: ServerReceivedShareItem[] }
  'server:share-accept': { req: { id: number }; res: { status: string } }
  'server:share-reject': { req: { id: number }; res: { status: string } }
  'server:share-revoke': { req: { id: number }; res: void }
  'server:share-leave': { req: { id: number }; res: void }
  'server:user-list': { req: void; res: ServerUser[] }

  // 승인 워크플로우 (커넥티드 모드)
  'approval:list': { req: { statusFilter?: string }; res: { items: ApprovalItem[]; total: number } }
  'approval:create': { req: { repoId: number; filePath: string; revision: number; message: string; reviewerIds: number[] }; res: ApprovalItem }
  'approval:approve': { req: { id: number; comment?: string }; res: ApprovalItem }
  'approval:reject': { req: { id: number; comment?: string }; res: ApprovalItem }

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
  'settings:reset-category': { req: { category: 'general' | 'security' | 'file' | 'trash' | 'notification' }; res: AppSettings }

  // 백업 (Phase 10)
  'backup:create': { req: { includeDB?: boolean; includeSVN?: boolean } | void; res: BackupEntry }
  'backup:restore': { req: { id: string; includeDB?: boolean; includeSVN?: boolean }; res: void }
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
  'shared-user:update': { req: { id: number; displayName?: string; password?: string; permission?: 'r' | 'rw'; isActive?: boolean; status?: 'active' | 'locked' | 'inactive' }; res: SharedUser }
  'shared-user:delete': { req: { id: number }; res: void }
  'shared-user:reset-password': { req: { id: number; newPassword: string }; res: void }

  // 초대 (Phase 11)
  'invitation:create': { req: { repoId: number; sharedUserId: number; expiryMinutes?: number; oneTime?: boolean }; res: { invitation: Invitation; link: string } }
  'invitation:list': { req: { repoId: number }; res: Invitation[] }
  'invitation:validate': { req: { token: string }; res: { valid: boolean; repoName?: string; host?: string } }

  // 원격 저장소 — 게스트 측 (Phase 11)
  'remote-repo:accept': { req: { linkData: string }; res: RemoteRepo }
  'remote-repo:list': { req: void; res: RemoteRepo[] }
  'remote-repo:disconnect': { req: { id: number }; res: void }
  'remote-repo:status': { req: { id: number }; res: RemoteRepo }
  'remote-repo:file-list': { req: { id: number; subPath?: string }; res: RemoteFileEntry[] }
  'remote-repo:sync': { req: { id: number }; res: { updated: boolean } }

  // 동기화 (Phase 11)
  'sync:update': { req: { remoteRepoId: number }; res: { updated: boolean; conflicts: ConflictEntry[] } }
  'sync:resolve-conflict': { req: { remoteRepoId: number; filePath: string; resolution: 'mine' | 'theirs' }; res: void }

  // SVN 잠금 — P2P (Phase 11)
  'svn-lock:lock': { req: { repoId: number; repoType: 'local' | 'remote'; path: string; comment?: string }; res: void }
  'svn-lock:unlock': { req: { repoId: number; repoType: 'local' | 'remote'; path: string }; res: void }
  'svn-lock:list': { req: { repoId: number; repoType: 'local' | 'remote' }; res: SvnLockEntry[] }

  // 서버 연동 (Phase C)
  'server:connect': { req: { url: string; username: string; password: string }; res: { connected: boolean; mode: string; user: { userId: number; username: string; role: string } | null } }
  'server:disconnect': { req: void; res: { mode: string } }
  'server:status': { req: void; res: { mode: string; connected: boolean; serverUrl: string; user: { userId: number; username: string; role: string } | null } }
  'server:isConnected': { req: void; res: boolean }

  // 내 계정
  'user:my-profile': { req: void; res: { id: number; username: string; displayName: string | null; email: string | null; role: string } }
  'user:update-profile': { req: { displayName?: string; email?: string }; res: void }
  'user:change-password': { req: { currentPassword: string; newPassword: string }; res: void }

  // 태그 확장 (Phase 6 확장)
  'tag:search': { req: { tagIds: number[]; mode: 'and' | 'or' }; res: Array<{ repoId: number; repoName: string; filePath: string; fileSize: number; modifiedAt: string }> }
  'tag:counts': { req: void; res: Record<number, number> }
  'tag:rule:list': { req: void; res: Array<{ id: number; tagId: number; tagName: string; patternType: string; pattern: string; isActive: boolean }> }
  'tag:rule:create': { req: { tagId: number; patternType: string; pattern: string }; res: number }
  'tag:rule:delete': { req: { id: number }; res: void }
  'tag:rule:toggle': { req: { id: number; isActive: boolean }; res: void }
  'tag:rule:apply-retroactive': { req: void; res: { applied: number } }
}
