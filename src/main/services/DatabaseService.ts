import Database from 'better-sqlite3'
import { app } from 'electron'
import { join, dirname } from 'path'
import { mkdirSync, existsSync } from 'fs'
import { CREATE_TABLES_SQL, CREATE_FTS5_SQL, CREATE_INDEXES_SQL, SCHEMA_VERSION } from '../db/schema'
import { getSchemaVersion, setSchemaVersion, runMigrations } from '../db/migrations'
import { DB_FILENAME } from '@shared/constants'

/**
 * DatabaseService — SQLite 연결 관리 (싱글턴)
 *
 * 역할:
 * - better-sqlite3 연결 생성 및 WAL 모드 설정
 * - 스키마 초기화 (19개 테이블 + FTS5 + 인덱스)
 * - 마이그레이션 실행
 * - DB 인스턴스 제공
 */

let _db: Database.Database | null = null

/** 데이터 디렉토리 경로 결정 */
function getDataDir(): string {
  // 항상 app.getPath('userData') 사용 — Electron이 보장하는 경로
  // Windows: %APPDATA%/vaultline-local/
  // macOS: ~/Library/Application Support/vaultline-local/
  // Linux: ~/.config/vaultline-local/
  return app.getPath('userData')
}

/** DB 파일 경로 */
export function getDbPath(): string {
  const dataDir = getDataDir()
  return join(dataDir, DB_FILENAME)
}

/** DB 초기화 — 앱 시작 시 1회 호출 */
export function initDatabase(): Database.Database {
  if (_db) return _db

  const dbPath = getDbPath()
  // 경로 로깅 (개발 시 확인용)
  if (!app.isPackaged) {
    console.log('[DB] 경로:', dbPath)
  }

  // 디렉토리 생성 (없는 경우)
  const dbDir = dirname(dbPath)
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true })
  }

  // DB 연결
  _db = new Database(dbPath)

  // WAL 모드 — 읽기/쓰기 동시성 향상
  _db.pragma('journal_mode = WAL')

  // 외래 키 제약 활성화
  _db.pragma('foreign_keys = ON')

  // 성능 최적화
  _db.pragma('synchronous = NORMAL')
  _db.pragma('cache_size = -8000') // 8MB 캐시
  _db.pragma('temp_store = MEMORY')

  // 스키마 초기화 또는 마이그레이션
  const currentVersion = getSchemaVersion(_db)

  if (currentVersion === 0) {
    // 최초 생성: 전체 스키마 적용
    _db.exec(CREATE_TABLES_SQL)

    // FTS5 — IF NOT EXISTS 미지원이므로 try-catch
    try {
      _db.exec(CREATE_FTS5_SQL)
    } catch {
      // 이미 존재하면 무시
    }

    _db.exec(CREATE_INDEXES_SQL)
    setSchemaVersion(_db, SCHEMA_VERSION)
  } else {
    // 기존 DB: 마이그레이션 실행
    runMigrations(_db)
  }

  return _db
}

/** DB 인스턴스 가져오기 (초기화 후 사용) */
export function getDatabase(): Database.Database {
  if (!_db) {
    throw new Error('DB가 초기화되지 않았습니다. initDatabase()를 먼저 호출하세요.')
  }
  return _db
}

/** DB 연결 종료 — 앱 종료 시 호출 */
export function closeDatabase(): void {
  if (_db) {
    _db.close()
    _db = null
  }
}

/** 데이터 디렉토리 경로 반환 (외부에서 repos/workcopies 경로 생성 시 사용) */
export function getAppDataDir(): string {
  return getDataDir()
}
