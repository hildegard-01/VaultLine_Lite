/**
 * DB 스키마 정의
 * 설계명세서 v1.3 §8.2 기반 — 19개 테이블 + FTS5
 */

// 현재 스키마 버전 (마이그레이션 제어용)
export const SCHEMA_VERSION = 1

// 테이블 생성 SQL (실행 순서 = 외래 키 의존 순서)
export const CREATE_TABLES_SQL = `
-- ═══ 저장소 ═══
CREATE TABLE IF NOT EXISTS repositories (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL UNIQUE,
    svn_path        TEXT NOT NULL UNIQUE,
    wc_path         TEXT NOT NULL UNIQUE,
    description     TEXT DEFAULT '',
    icon            TEXT DEFAULT 'folder',
    display_order   INTEGER DEFAULT 0,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_accessed   DATETIME,
    status          TEXT DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS repo_settings (
    repo_id             INTEGER PRIMARY KEY REFERENCES repositories(id) ON DELETE CASCADE,
    trash_retention_days INTEGER DEFAULT 30,
    auto_commit         BOOLEAN DEFAULT 0,
    auto_commit_delay   INTEGER DEFAULT 5,
    default_commit_msg  TEXT DEFAULT '',
    folder_template     TEXT DEFAULT ''
);

-- ═══ 태그 ═══
CREATE TABLE IF NOT EXISTS tags (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    color       TEXT DEFAULT '#1565C0',
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS file_tags (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_id     INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    file_path   TEXT NOT NULL,
    tag_id      INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(repo_id, file_path, tag_id)
);

CREATE TABLE IF NOT EXISTS tag_rules (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    tag_id          INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    pattern_type    TEXT NOT NULL,
    pattern         TEXT NOT NULL,
    is_active       BOOLEAN DEFAULT 1,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ═══ 즐겨찾기 ═══
CREATE TABLE IF NOT EXISTS bookmarks (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_id       INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    file_path     TEXT NOT NULL,
    alias         TEXT,
    display_order INTEGER DEFAULT 0,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(repo_id, file_path)
);

-- ═══ 휴지통 ═══
CREATE TABLE IF NOT EXISTS trash_items (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_id          INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    file_path        TEXT NOT NULL,
    deleted_revision INTEGER NOT NULL,
    original_size    INTEGER DEFAULT 0,
    deleted_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at       DATETIME,
    is_visible       BOOLEAN DEFAULT 1
);

-- ═══ 보호 잠금 (v1.1) ═══
CREATE TABLE IF NOT EXISTS file_locks (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_id      INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    file_path    TEXT NOT NULL,
    reason       TEXT DEFAULT '',
    auto_rule_id INTEGER REFERENCES lock_rules(id) ON DELETE SET NULL,
    locked_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(repo_id, file_path)
);

CREATE TABLE IF NOT EXISTS lock_rules (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern_type TEXT NOT NULL,
    pattern      TEXT NOT NULL,
    reason       TEXT DEFAULT '자동 보호',
    is_active    BOOLEAN DEFAULT 1,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ═══ 로컬 공유 (v1.1) ═══
CREATE TABLE IF NOT EXISTS shares (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_id       INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    file_path     TEXT NOT NULL,
    revision      INTEGER,
    share_type    TEXT NOT NULL,
    token         TEXT UNIQUE,
    password_hash TEXT,
    expires_at    DATETIME,
    is_active     BOOLEAN DEFAULT 1,
    access_count  INTEGER DEFAULT 0,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ═══ 활동 로그 ═══
CREATE TABLE IF NOT EXISTS activity_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_id    INTEGER REFERENCES repositories(id) ON DELETE SET NULL,
    action     TEXT NOT NULL,
    file_path  TEXT,
    revision   INTEGER,
    username   TEXT,
    detail     TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ═══ P2P 공유: 사용자 관리 (v1.3) ═══
CREATE TABLE IF NOT EXISTS shared_users (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_id        INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    username       TEXT NOT NULL,
    display_name   TEXT NOT NULL,
    password_plain TEXT NOT NULL,
    permission     TEXT DEFAULT 'rw',
    is_active      BOOLEAN DEFAULT 1,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(repo_id, username)
);

-- ═══ P2P 공유: 초대 링크 (v1.3) ═══
CREATE TABLE IF NOT EXISTS invitations (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_id        INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    shared_user_id INTEGER NOT NULL REFERENCES shared_users(id) ON DELETE CASCADE,
    token          TEXT NOT NULL UNIQUE,
    expires_at     DATETIME NOT NULL,
    one_time       BOOLEAN DEFAULT 0,
    is_used        BOOLEAN DEFAULT 0,
    used_at        DATETIME,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ═══ P2P 공유: 외부 저장소 — 게스트 측 (v1.3) ═══
CREATE TABLE IF NOT EXISTS remote_repos (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    display_name      TEXT NOT NULL,
    svn_url           TEXT NOT NULL,
    wc_path           TEXT NOT NULL,
    username          TEXT NOT NULL,
    password_plain    TEXT NOT NULL,
    owner_name        TEXT,
    permission        TEXT DEFAULT 'rw',
    connection_status TEXT DEFAULT 'unknown',
    last_synced       DATETIME,
    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ═══ P2P 공유: SVN 잠금 캐시 (v1.3) ═══
CREATE TABLE IF NOT EXISTS svn_locks (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_id      INTEGER NOT NULL,
    repo_type    TEXT NOT NULL DEFAULT 'local',
    file_path    TEXT NOT NULL,
    locked_by    TEXT NOT NULL,
    lock_token   TEXT,
    lock_comment TEXT DEFAULT '',
    locked_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(repo_id, repo_type, file_path)
);

-- ═══ 검색 ═══
CREATE TABLE IF NOT EXISTS search_metadata (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_id    INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    file_path  TEXT NOT NULL,
    revision   INTEGER NOT NULL,
    indexed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(repo_id, file_path)
);

-- ═══ 설정 ═══
CREATE TABLE IF NOT EXISTS app_settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ═══ 미리보기 캐시 ═══
CREATE TABLE IF NOT EXISTS preview_cache (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_id    INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    file_path  TEXT NOT NULL,
    revision   INTEGER NOT NULL,
    cache_path TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    file_size  INTEGER DEFAULT 0,
    UNIQUE(repo_id, file_path, revision)
);
`

// FTS5 가상 테이블은 별도 (IF NOT EXISTS 미지원이므로 try-catch 필요)
export const CREATE_FTS5_SQL = `
CREATE VIRTUAL TABLE search_index USING fts5(
    repo_id UNINDEXED,
    file_path UNINDEXED,
    revision UNINDEXED,
    file_name,
    commit_message,
    content_text,
    tokenize='unicode61'
);
`

// 성능 인덱스
export const CREATE_INDEXES_SQL = `
CREATE INDEX IF NOT EXISTS idx_file_tags_repo_path ON file_tags(repo_id, file_path);
CREATE INDEX IF NOT EXISTS idx_bookmarks_repo ON bookmarks(repo_id);
CREATE INDEX IF NOT EXISTS idx_trash_repo ON trash_items(repo_id);
CREATE INDEX IF NOT EXISTS idx_trash_expires ON trash_items(expires_at);
CREATE INDEX IF NOT EXISTS idx_file_locks_repo_path ON file_locks(repo_id, file_path);
CREATE INDEX IF NOT EXISTS idx_shares_token ON shares(token);
CREATE INDEX IF NOT EXISTS idx_shares_repo ON shares(repo_id);
CREATE INDEX IF NOT EXISTS idx_activity_repo ON activity_log(repo_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_action ON activity_log(action);
CREATE INDEX IF NOT EXISTS idx_shared_users_repo ON shared_users(repo_id);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
CREATE INDEX IF NOT EXISTS idx_svn_locks_repo ON svn_locks(repo_id, repo_type);
CREATE INDEX IF NOT EXISTS idx_search_meta_repo ON search_metadata(repo_id);
CREATE INDEX IF NOT EXISTS idx_preview_cache_repo ON preview_cache(repo_id);

-- ═══ 서버 동기화 큐 (Phase C) ═══
CREATE TABLE IF NOT EXISTS server_sync_queue (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_id    INTEGER NOT NULL,
    revision   INTEGER NOT NULL,
    payload    TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(repo_id, revision)
);
`
