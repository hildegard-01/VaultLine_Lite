/**
 * 공유 상수 정의
 * Main/Renderer 양쪽에서 사용
 */

// 앱 기본 설정
export const APP_NAME = 'VaultLine Local'
export const APP_ID = 'com.vaultline.local'

// 기본 데이터 경로 (실행 시 app.getPath로 실제 경로 결정)
export const DEFAULT_DATA_DIR_NAME = 'DocVaultLocal'
export const DEFAULT_REPOS_DIR = 'repos'
export const DEFAULT_WORKCOPIES_DIR = 'workcopies'
export const DEFAULT_CACHE_DIR = 'cache'
export const DEFAULT_BACKUP_DIR = 'backups'
export const DEFAULT_LOG_DIR = 'logs'

// DB
export const DB_FILENAME = 'app.db'

// SVN
export const SVN_DEFAULT_PORT = 3690

// 임시 공유 서버
export const SHARE_SERVER_PORT = 9090
export const SHARE_DEFAULT_EXPIRY_MINUTES = 60

// 파일 제한
export const MAX_UPLOAD_SIZE_BYTES = 500 * 1024 * 1024 // 500MB
export const BLOCKED_EXTENSIONS = ['.exe', '.bat', '.cmd', '.com', '.scr', '.pif', '.vbs', '.js']

// 미리보기
export const PREVIEW_TIMEOUT_MS = 60_000
export const PREVIEW_SUPPORTED_EXTENSIONS = [
  '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt',
  '.hwp', '.hwpx', '.pdf',
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.webp',
  '.txt', '.md', '.csv', '.json', '.xml', '.html', '.css'
]

// 자동 커밋
export const AUTO_COMMIT_DELAY_MS = 5_000

// 파일 감시 (chokidar)
export const FILE_WATCH_DEBOUNCE_MS = 2_000

// 휴지통
export const TRASH_DEFAULT_RETENTION_DAYS = 30

// 백업
export const BACKUP_MAX_COUNT = 7

// 검색
export const SEARCH_MAX_RESULTS = 100

// 서버 연동 (Phase C)
export const SERVER_CONNECT_TIMEOUT_MS = 3_000   // 연결 시도 타임아웃
export const SERVER_REQUEST_TIMEOUT_MS = 5_000   // 일반 API 요청 타임아웃
export const SERVER_HEARTBEAT_INTERVAL_MS = 60_000 // heartbeat 주기 (60초)
export const SERVER_RETRY_INTERVAL_MS = 30_000   // 재연결 시도 주기
export const SERVER_WS_TIMEOUT_MS = 30_000       // 파일 프록시 WebSocket 응답 타임아웃
export const SERVER_PREVIEW_CACHE_MAX_GB = 5     // 서버 미리보기 캐시 최대 크기

// UI 컬러
export const COLORS = {
  navy: '#1B2A4A',
  accent: '#4ECDC4',
  status: {
    synced: '#2E7D32',
    modified: '#E65100',
    new: '#1565C0',
    locked: '#6A1B9A'
  }
} as const

// 활동 로그 액션 타입
export const ACTIVITY_ACTIONS = [
  'file.upload', 'file.commit', 'file.delete', 'file.move',
  'file.rename', 'file.restore', 'file.undelete',
  'file.lock', 'file.unlock', 'file.export',
  'share.create',
  'repo.create', 'repo.delete', 'repo.import',
  'backup.create', 'backup.restore',
  'svnserve.start', 'svnserve.stop',
  'sync.conflict'
] as const

export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number]
