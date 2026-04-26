# CHANGELOG

VaultLine Lite 변경 이력입니다. [Keep a Changelog](https://keepachangelog.com/ko/) 형식을 따릅니다.

---

## [Unreleased]

### 추가 (Phase F — 기능 보완 + 보안 강화)

**태그 기능 전면 개선**
- `TagsPage` 완전 재작성: 좌측 태그 목록(인라인 생성·수정·삭제) + 우측 탭(파일 검색 / 자동 규칙)
- 복수 태그 AND/OR 검색 — 태그 칩 선택기 + 검색 모드 토글
- 자동 태그 규칙 관리 — 확장자·경로·파일명 패턴, 활성/비활성 토글, 소급 적용(전체 WC 파일 대상)
- 태그별 파일 수 배지 (`tag:counts` 실시간 반영)
- `TagService` 확장: `getFilesByTags()`, `getTagCounts()`, `toggleTagRule()`, `applyAutoTagsRetroactive()`
- 자동 태그를 커밋 흐름에 연결: `CommitService.uploadAndCommit/uploadNewVersion`, `FileWatcherService.commitPendingFiles` 에 `applyAutoTags()` 호출 추가 (기존 규칙 정의만 있고 실제 호출이 없던 버그 수정)
- 사이드바 태그 섹션 제거 (TagsPage로 일원화)
- 신규 IPC 7개: `tag:search`, `tag:counts`, `tag:rule:list/create/delete/toggle/apply-retroactive`

**검색 확장 — 공유받은 문서 포함**
- `SearchService.globalSearch()` — 공유받은 저장소(`remote_repos`) WC 파일도 결과에 포함
- `SearchModal` — 공유 문서에 청록색 "공유" 배지 표시, 공유자(`ownerName`) 표시

**사이드바 메뉴 수정**
- 승인관리 메뉴 제거 → 공유관리(`/shares`) 복원

**자동 로그인 + OS 세션 암호화**
- `SessionService.ts` 신규: `safeStorage` (Windows DPAPI / macOS Keychain) 로 refresh token 암호화 저장
- 앱 재시작 시 저장된 세션 자동 복원 (`ModeManager.initialize()` 에서 세션 확인 → `/auth/refresh` → 커넥티드 모드 자동 전환)
- `ServerConnectionService.loginWithRefreshToken()` 신규 — 저장된 refresh token으로 재인증
- 서버 연결 성공 시 세션 자동 저장, 연결 해제 시 세션 삭제
- 신규 IPC: `session:info`, `session:clear`

**시스템 통합**
- Tray(시스템 트레이) 지원: `trayMinimize` 설정 시 창 닫기 → 숨김, 트레이 더블클릭 → 복원, "종료" 메뉴로만 앱 종료
- 시작 시 자동 실행: `app.setLoginItemSettings()` 기반, `system:startup-get/set` IPC
- `AppSettings`에 `autoLoginDays` (0=비활성, 1/7/30/90일), `trayMinimize` 필드 추가

**설정 모달 — 시스템 탭 신규**
- 자동 로그인 활성화 토글 + 유지 기간 선택(1/7/30/90일) + 세션 만료일 표시 + 세션 삭제
- 시작 시 자동 실행 토글
- 트레이 최소화 토글

**관리자 — 사용자 수정 기능**
- `AdminUsers` 사용자 행에 「수정」버튼 추가
- `EditUserModal` 신규: 표시 이름 / 이메일 / 역할 변경 (사용자명은 읽기전용 표시)

**내 정보 / 비밀번호 변경 (일반 사용자)**
- 설정 모달 서버 연결 탭 — 커넥티드 상태일 때 하단에 「내 정보」·「비밀번호 변경」섹션 노출
- 표시 이름·이메일 수정 → `user:update-profile` (`PATCH /users/me`)
- 현재 비밀번호 + 새 비밀번호 변경 → `user:change-password` (`POST /auth/change-password`), 8자 이상 검증
- `ServerConnectionService` 신규: `getMyProfile()`, `updateMyProfile()`, `changePassword()`
- 신규 IPC: `user:my-profile`, `user:update-profile`, `user:change-password`

### 수정
- `TagsPage` 스타일 객체 타입 오류 수정 (`Record<string, CSSProperties>` → `satisfies` 패턴으로 함수형 스타일 허용)
- `IpcChannelMap`에 누락된 태그 확장 채널 전체 등록 (타입 안전성 확보)

---

### 추가 (Phase U — 관리자 UI + FilesPage V2 재구축)

**FilesPage V2 재작성**
- `FileToolbarV2` — V2 인라인 스타일, 벌크 액션바 분리 (업로드/새폴더/잠금규칙 + 이동/잠금/공유/삭제)
- `FileTableV2` — 7컬럼 (체크박스/★/이름+칩/크기/리비전/수정일/⋮), 폴더 드롭·앱 외부 드래그 유지
- `FileRightPanelV2` — 와이어프레임 섹션 3의 5섹션 (선택파일/메타+태그/버전이력/공유/작업)
- FilesPage.tsx 내부 로직·IPC·모달 12개는 무변경 (import 교체만)

**관리자 페이지 (서버 없이 오프라인 동작)**
- `AdminSidebarV2` — ShellV2가 `/admin/*` 경로에서 사이드바만 관리자 버전으로 교체 (← 파일로 돌아가기 + 관리/설정/모니터링 3섹션)
- AdminDashboard — 메트릭 4카드 (저장소/총 사용량/디스크/경고) + 최근 활동 5건
- AdminUsers — 저장소별 P2P 공유 사용자 관리 (상태/실패 카운터/비밀번호 변경)
- AdminRepos — 쿼터 설정 + 30일 예약 삭제/복구
- AdminSettings — 일반/파일 카테고리별 설정 + 카테고리 초기화
- AdminSystemInfo — 버전·플랫폼·업타임 + 서비스 헬스체크 + 디스크 사용량 (30초 자동 갱신)
- AdminBackup — 즉시 백업 (DB/SVN 선택) + 부분 복원
- AdminActivityLog — 통계 4카드 + 필터(저장소/액션) + 페이지네이션 + CSV 내보내기

**신규 IPC 10개**
- `activity:stats`, `activity:export-csv`
- `repo:admin-list`, `repo:set-quota`, `repo:mark-deletion`, `repo:cancel-deletion`
- `system:health-check`, `system:info-full` (신규 `system.ipc.ts`)
- `settings:reset-category`
- `shared-user:reset-password` (+ update 핸들러에 `status` 지원 추가)

**DB 마이그레이션 v2 → v3**
- `repositories` 테이블에 `quota_bytes`, `pending_deletion_at` 컬럼 추가
- `shared_users` 테이블에 `status`, `last_login_at`, `failed_login_count` 컬럼 추가
- `addColumnIfMissing` 멱등 ALTER (기존 DB에 안전 적용)

**기존 IPC 인자 확장**
- `backup:create` — `{ includeDB?, includeSVN? }` 인자 추가 (부분 백업)
- `backup:restore` — `{ id, includeDB?, includeSVN? }` (부분 복원)
- `shared-user:update` — `status` 필드 추가

**Placeholder**
- `/admin/groups`, `/admin/approval-rules` — 오프라인 placeholder (서버 연동 시 활성화 예정)

### 추가 (Phase A-2 — V2 UI 선행 복원)
- V2 디자인 시스템 (theme.ts 컬러/레이아웃 토큰, Icons.tsx 33개 SVG 아이콘)
- Pretendard 웹폰트 적용
- ModeProvider + useMode 훅 (오프라인/커넥티드 모드 전환 기반)
- V2 레이아웃 (ShellV2, HeaderV2 52px 네이비, SidebarV2 220px)
- FileDetailPage — 5탭 상세보기 (미리보기, 커밋 이력, Diff, 결재 placeholder, 태그) + 우측 MetadataPanel
- ActivityPage — 활동 로그 타임라인 (필터: 전체/파일/공유/저장소/백업/동기화)
- BookmarksPage — 즐겨찾기 목록 (저장소별 그룹화)
- TagsPage — 태그 관리 (좌측 태그 목록 + 우측 파일 목록)
- OfflinePlaceholder — 서버 전용 기능 비활성 안내 (공유, 결재, 알림, 관리자)
- `activity:list` IPC 채널 (활동 로그 DB 조회)
- FileRightPanel "상세보기" 버튼 → FileDetailPage 진입
- CSP 업데이트 (data:/blob: 허용, Pretendard CDN 허용)

### 추가 (일괄 파일 이동)
- 일괄 폴더 이동 (`file:bulk-move`) — 체크된 파일을 같은 저장소 내 폴더로 이동
- 저장소 간 이동 (`file:cross-repo-move`) — 다른 저장소로 파일 복사 + 원본 삭제
- MoveModal — 대상 폴더/저장소 선택 UI (폴더 브라우징, 브레드크럼)
- FileToolbar "이동" 버튼 추가

### 추가 (서버 공유 기능 구현)

**ShareModal 개선**
- "클립보드 복사" 옵션 제거
- "🌐 서버 공유" 옵션 추가 (커넥티드 모드 전용): 팀원 다중 선택, 권한(읽기/읽기+쓰기), 만료일 설정
- 로컬 링크 옵션 섹션 구조 개선 (서버 실행 중엔 옵션 숨김)

**SharesPageV2 업데이트**
- "공유받은" 탭 — 실제 서버 데이터 표시 (공유자/권한/만료일/공유 해제 버튼)
- "내가 공유" 탭 — 실제 서버 데이터 표시 (권한/만료일/수신자/공유 취소 버튼)
- 탭 배지 — 건수 실시간 반영 (10초 폴링)

**신규 IPC 5개 (server.ipc.ts)**
- `server:share-create` — 파일 공유 생성 (대상 사용자, 권한, 만료일)
- `server:share-list` — 내가 보낸/받은 공유 목록
- `server:share-revoke` — 공유 취소 (공유 생성자)
- `server:share-leave` — 공유 해제 (수신자)
- `server:user-list` — 서버 사용자 목록 조회

**ServerShareService 업데이트**
- `createShare()` — `expiresAt?` 파라미터 추가
- `listShares()` — 보낸/받은 분리 반환
- `revokeShare()` / `leaveShare()` / `getUserList()` 신규 메서드

**공유 타입 추가 (ipc.ts)**
- `ServerShareItem` 인터페이스 (id, repoId, filePath, permission, expiresAt, ownerUserId, recipients 등)
- `ServerUser` 인터페이스 (id, username, displayName, isOnline)

### 추가 (Phase C — 서버 연동 계층)
- ModeManager — 오프라인/커넥티드 전환 핵심 (자동 재시도, Renderer 알림)
- ServerConnectionService — JWT 로그인/갱신/로그아웃 (토큰 메모리 전용, axios 인터셉터)
- PresenceService — 60초 heartbeat
- RepoSyncService — 커밋 메타 push + 오프라인 큐잉 (server_sync_queue 테이블)
- MetadataSyncService — 태그 변경 서버 push
- FileProxyService — 서버 file_request에 로컬 파일로 응답
- 서버 프록시 6개 (Share, Invite, Notification, Approval, Admin)
- server.ipc.ts — 서버 IPC 4개 채널 (connect/disconnect/status/isConnected)
- useMode 훅 — server:mode-changed 이벤트 자동 수신
- SettingsModal 서버 연결 탭 — URL/ID/PW 입력 → 실제 연결/해제 기능 활성화
- CommitService에 sync hook 추가

### 수정
- 검색 `search:query` — FTS5 실패 시 LIKE 폴백 추가 (커밋 탭 검색 개선)
- Tailwind config — V2 색상 토큰(v2.*), 사이즈, 폰트 extend 추가
- 커밋 모달 파일 목록 — max-h + 스크롤 추가 (overflow 방지)
- CSP — Pretendard CDN 폰트 허용

---

## [0.1.0] — 2026-04-08 (Phase A — 로컬 버전 초기 출시)

### 추가
- SVN 기반 로컬 문서 버전관리 (커밋, 이력, Diff, 되돌리기)
- 파일 탐색기 — 트리뷰, 리스트뷰, 파일 상태 표시 (synced/modified/new/locked)
- 3방향 드래그앤드롭 (사이드바 → 메인, 외부 → 앱, 저장소 간 이동)
- 더블클릭 편집 + 수정 감지 + Pending Changes 바
- 미리보기 — PDF, Office 문서 (pdf.js + LibreOffice 변환)
- 태그, 즐겨찾기, 휴지통 (Soft Delete, 30/60/90일 보존)
- SQLite FTS5 전문 검색 (한국어 unicode61 토크나이저)
- 보호 잠금 (DB 플래그) + SVN lock
- P2P 공유 — svnserve + zip 내보내기 + 임시 링크
- 초대 링크 (`docvault://` 커스텀 프로토콜)
- 백업 생성/복원 (SVN 저장소 + DB, 최대 7개)
- 설정 — 테마(라이트/다크/시스템), 언어, 자동 커밋, 공유 서버 포트
- 설정 → 서버 연결 탭 추가 (비활성 — 다음 업데이트 예고)
- `config.json` server 블록 placeholder (Phase C에서 활성화 예정)
- `docvault://` 프로토콜 시스템 등록 (초대 링크 수신 준비)

### 기술 스택
- Electron 33 + React 18 + TypeScript strict
- SQLite (better-sqlite3) + FTS5
- SVN CLI 번들 (Windows x64)
- Tailwind CSS
- electron-builder (NSIS 인스톨러)
