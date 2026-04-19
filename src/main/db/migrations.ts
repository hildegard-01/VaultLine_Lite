import type Database from 'better-sqlite3'
import { SCHEMA_VERSION, CREATE_SERVER_SYNC_QUEUE_SQL } from './schema'

/**
 * DB 마이그레이션 관리
 * app_settings 테이블의 schema_version 키로 현재 버전 추적
 */

// 마이그레이션 함수 타입
type MigrationFn = (db: Database.Database) => void

// 버전별 마이그레이션 정의 (버전 1→2, 2→3, ...)
// 현재는 초기 버전이므로 비어 있음. 스키마 변경 시 여기에 추가.
const migrations: Record<number, MigrationFn> = {
  // 버전 1 → 2: 서버 동기화 큐 테이블 추가 (Phase C)
  2: (db) => {
    db.exec(CREATE_SERVER_SYNC_QUEUE_SQL)
  },
  // 버전 2 → 3: search_metadata에 file_name, commit_message 컬럼 추가 (LIKE 검색 폴백용)
  3: (db) => {
    try { db.exec(`ALTER TABLE search_metadata ADD COLUMN file_name TEXT DEFAULT ''`) } catch { /* 이미 존재 */ }
    try { db.exec(`ALTER TABLE search_metadata ADD COLUMN commit_message TEXT DEFAULT ''`) } catch { /* 이미 존재 */ }
    // search_index(FTS5)에서 기존 데이터를 search_metadata로 백필
    try {
      db.exec(`
        UPDATE search_metadata SET
          file_name = (SELECT file_name FROM search_index WHERE search_index.repo_id = CAST(search_metadata.repo_id AS TEXT) AND search_index.file_path = search_metadata.file_path LIMIT 1),
          commit_message = (SELECT commit_message FROM search_index WHERE search_index.repo_id = CAST(search_metadata.repo_id AS TEXT) AND search_index.file_path = search_metadata.file_path LIMIT 1)
        WHERE file_name = '' OR file_name IS NULL
      `)
    } catch { /* 폴백 무시 */ }
  }
}

/** 현재 DB의 스키마 버전을 조회 */
export function getSchemaVersion(db: Database.Database): number {
  try {
    const row = db.prepare("SELECT value FROM app_settings WHERE key = 'schema_version'").get() as
      | { value: string }
      | undefined
    return row ? parseInt(row.value, 10) : 0
  } catch {
    // app_settings 테이블이 없는 경우 (최초 생성 전)
    return 0
  }
}

/** 스키마 버전을 기록 */
export function setSchemaVersion(db: Database.Database, version: number): void {
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES ('schema_version', ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
  ).run(String(version))
}

/** 필요한 마이그레이션을 순서대로 실행 */
export function runMigrations(db: Database.Database): void {
  const currentVersion = getSchemaVersion(db)

  if (currentVersion >= SCHEMA_VERSION) {
    return // 최신 버전, 마이그레이션 불필요
  }

  // 마이그레이션을 트랜잭션으로 실행
  const migrate = db.transaction(() => {
    for (let v = currentVersion + 1; v <= SCHEMA_VERSION; v++) {
      const migrationFn = migrations[v]
      if (migrationFn) {
        migrationFn(db)
      }
    }
    setSchemaVersion(db, SCHEMA_VERSION)
  })

  migrate()
}
