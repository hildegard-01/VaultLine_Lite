# VaultLine Lite - Claude 개발 규칙

> 이 파일은 VaultLine Lite 프로젝트 전용 개발 규칙입니다.  
> **공통 규칙 전체**: `C:\dev\CommonMd\CLAUDE.md` — 이 파일의 모든 규칙이 우선 적용됩니다.  
> 이 파일은 공통 규칙에 더해, 프로젝트 고유 규칙을 정의합니다.

---

## 0. 공통 규칙 요약 (CommonMd/CLAUDE.md 전문 준수)

> CommonMd/CLAUDE.md의 내용을 그대로 따릅니다. 핵심만 아래에 요약합니다.

| 규칙 | 요약 |
|------|------|
| 수정 범위 | 요청한 내용만 수정. 관련 있어도 미요청 항목 임의 변경 금지 |
| 기존 기능 보호 | 수정 전 영향받는 파일/기능 목록 파악 필수 |
| 최소 변경 | 정확한 원인 파악 후 최소한의 변경으로 해결 |
| 구조 변경 금지 | 번들러/패키지매니저/디렉토리 구조 임의 변경 금지 |
| 파일 크기 | TS/TSX 500줄 권장 / 800줄 초과 시 분리 후 진행 |
| 문서 동기화 | 기능 추가·수정 시 ROADMAP, CHANGELOG 등 반드시 업데이트 |
| 하드코딩 금지 | 설정값은 `shared/constants.ts` 또는 config 파일로 분리 |
| 민감정보 | API 키·비밀번호 절대 수정·커밋 금지 |
| 언어 | 응답·주석·커밋메시지 전부 한글. 파일 인코딩 UTF-8 |
| 에러처리 | API/IPC 호출 시 항상 예외 처리, 한글 에러 메시지 |
| 프로젝트 격리 | VaultLine_Lite만 수정. VaultLine·VaultLine_Local 임의 수정 금지 |

---

## 1. 프로젝트 개요

- **프로젝트명**: VaultLine Lite (하이브리드 에디션)
- **목적**: 로컬 단독 실행(오프라인 모드) + 경량 중앙 서버 연동(커넥티드 모드)을 하나의 앱으로 제공하는 SVN 기반 문서 버전관리 데스크톱 앱
- **기술 스택**: Electron 30+ (Node.js Main + React 18 Renderer) + TypeScript + Tailwind CSS + SQLite (better-sqlite3) + SVN CLI (번들)
- **배포**: NSIS 인스톨러(Windows) / DMG(macOS) / AppImage(Linux), electron-builder
- **베이스**: `VaultLine_Local` (로컬 기능, ~80% 완성) + `VaultLine` 서버 버전 (UI/기능 계승)
- **작업 디렉토리**: `C:\dev\VaultLine_Lite`

### 핵심 원칙

1. **기존 로컬 코드 변경 최소화** — 완성된 로컬 코드 위에 서버 연동 계층만 추가
2. **서버 없이 100% 작동** — 오프라인 모드에서 로컬 SVN 기능 전부 사용 가능
3. **UI는 VaultLine 서버 버전 풀 UI 복원** — 알림벨, 사용자 아바타, 공유 화면, 승인 화면, 관리자 화면 전부 포함
4. **서버 기능은 커넥티드 모드에서만 활성화** — 오프라인 모드에서는 숨김/비활성

---

## 2. 프로젝트 구조

```
VaultLine_Lite/
├── src/
│   ├── main/                       # Electron Main Process (Node.js)
│   │   ├── services/               # 로컬 서비스 (건드리지 않음 — 로컬에서 그대로 계승)
│   │   │   ├── server/             # ★ 신규: 서버 연동 계층 (11개 서비스)
│   │   │   │   ├── ModeManager.ts          # 오프라인/커넥티드 전환 핵심
│   │   │   │   ├── ServerConnectionService.ts # JWT 로그인/토큰 관리
│   │   │   │   ├── PresenceService.ts       # heartbeat (60초 간격)
│   │   │   │   ├── RepoSyncService.ts       # 커밋 메타데이터 push
│   │   │   │   ├── MetadataSyncService.ts   # 태그/활동로그 sync
│   │   │   │   ├── FileProxyService.ts      # 파일 프록시 응답 (WebSocket)
│   │   │   │   ├── ServerShareService.ts    # 서버 공유 링크
│   │   │   │   ├── ServerInviteService.ts   # 초대 링크
│   │   │   │   ├── ServerNotificationService.ts # 알림 수신
│   │   │   │   ├── ServerApprovalProxy.ts   # 승인 API 프록시
│   │   │   │   └── ServerAdminProxy.ts      # 관리자 API 프록시
│   │   ├── ipc/                    # IPC 핸들러
│   │   │   └── server.ipc.ts       # ★ 신규: 서버 관련 IPC 채널
│   │   └── db/                     # SQLite 초기화, 마이그레이션
│   ├── renderer/                   # React 18 + TypeScript UI
│   │   ├── components/
│   │   │   └── connected/          # ★ 신규: 커넥티드 전용 컴포넌트
│   │   ├── hooks/
│   │   │   └── useMode.ts          # ★ 신규: 오프라인/커넥티드 모드 훅
│   │   ├── pages/
│   │   ├── services/
│   │   ├── types/
│   │   └── utils/
│   ├── shared/                     # Main/Renderer 공유 타입, 상수
│   └── preload/                    # contextBridge 설정
├── resources/                      # 번들 리소스 (SVN CLI, 아이콘 등)
├── docs/                           # 기존 설계/개발 문서
├── docs2/                          # ★ 하이브리드 전환 설계 문서 (참조용)
├── electron-builder.yml
├── package.json
├── tsconfig.json
└── electron.vite.config.ts
```

### 참고: V2 UI 복원 진행 예정

- 상세 계획: `docs2/V2_UI_복원_계획서.md`
- VaultLine V2 디자인 소스: `C:\dev\VaultLine\frontend\src\components\v2\`
- VaultLine V2 페이지 소스: `C:\dev\VaultLine\frontend\src\pages\v2\`
- **기존 layout 컴포넌트 (Shell.tsx, Header.tsx, Sidebar.tsx)는 참조용으로 유지** — 삭제하지 않음
- 신규 V2 컴포넌트는 인라인 스타일 + theme.ts 사용 (기존 Tailwind 컴포넌트는 변경하지 않음)

---

## 3. 이중 모드 아키텍처 (핵심)

### 3.1 모드 전환 흐름

```
앱 시작
  ├─ config.json server.url 없음 ────────→ 오프라인 모드 (로컬 코드 100%)
  │
  └─ server.url 있음 ──────────────────→ 연결 시도 (3초 타임아웃)
                                           ├─ 성공 → 커넥티드 모드
                                           └─ 실패 → 오프라인 모드 (자동 폴백)
                                                      └─ 30초 후 재시도
```

수동 전환: 설정 → 서버 연결 → [연결] / [연결 해제] / [오프라인으로 작업]

### 3.2 기능별 모드 매트릭스

| 기능 | 오프라인 모드 | 커넥티드 모드 |
|------|:-----------:|:-----------:|
| 파일 탐색/커밋/Diff | ✅ 로컬 | ✅ 로컬 + 서버 메타 동기화 |
| 미리보기 (pdf.js) | ✅ 로컬 | ✅ 로컬 + 서버 캐시 |
| 태그/즐겨찾기/휴지통 | ✅ 로컬 | ✅ 로컬 + 서버 동기화 |
| 검색 (FTS5) | ✅ 로컬 | ✅ 로컬 + 팀 검색 |
| 보호 잠금 (DB) | ✅ 로컬 | ✅ 로컬 (변경 없음) |
| 3방향 드래그앤드롭 | ✅ 로컬 | ✅ 로컬 (변경 없음) |
| 더블클릭 편집+수정감지 | ✅ 로컬 | ✅ 로컬 (변경 없음) |
| Pending Changes 바 | ✅ 로컬 | ✅ 로컬 (변경 없음) |
| P2P 공유 (svnserve) | ✅ 로컬 | ✅ 로컬 (변경 없음) |
| 서버 공유 링크 | ❌ 숨김 | ✅ 서버 영구 URL |
| 초대 링크 | docvault:// P2P | 서버 https:// |
| 사용자 관리 | ❌ | ✅ 서버 JWT auth |
| 알림 벨 아이콘 | ❌ 숨김 | ✅ 서버 알림 |
| 승인 워크플로우 | ❌ 숨김 | ✅ 서버 API |
| 관리자 화면 | 로컬 설정만 | ✅ 풀 관리자 |
| 활동 로그 | 로컬만 | 로컬 + 서버 팀 로그 |

### 3.3 ModeManager 사용 패턴 (필수 준수)

```typescript
// src/main/services/server/ModeManager.ts — 핵심 파일
// 기존 서비스에 서버 기능 추가 시 반드시 아래 패턴 사용:

if (modeManager.isConnected()) {
  await serverSyncService.doSomething();  // 서버 기능
}
// 위 조건이 없으면 기존 로컬 동작 그대로
```

---

## 4. 핵심 설계 결정 (변경 금지)

| # | 결정 | 이유 | 절대 금지 |
|---|------|------|---------|
| D1 | SVN 사용 (file:// 로컬) | 바이너리 적합, 오프라인 동작 | Git/Git LFS로 변경 |
| D2 | SVN CLI 번들 | 사용자 별도 설치 불필요 | 외부 SVN 서버 요구 |
| D3 | Electron 데스크톱앱 | React 재사용, Node.js 기반 | Tauri/C++/Qt로 변경 |
| D4 | Nextcloud 코드 불사용 | AGPL 감염 방지 | Nextcloud CSS/코드 복사 |
| D5 | Node.js Main Process | Electron 자체가 Node.js | Python/Go 백엔드 추가 |
| D6 | React 18 프론트엔드 | VaultLine 서버 컴포넌트 75% 재사용 | Vue.js로 변경 |
| D7 | SQLite + better-sqlite3 | 로컬 임베디드, FTS5, 동기 API | PostgreSQL/MySQL 등 |
| D8 | Electron IPC (HTTP 없음) | Main↔Renderer 직접 통신 | REST API/Express 추가 |
| D9 | 저장소별 독립 SVN 레포 | 권한격리, 독립백업 | 단일저장소+폴더 |
| D10 | SQLite FTS5 검색 | unicode61 한국어, 별도 엔진 불필요 | Elasticsearch 도입 |
| D11 | DB 플래그 보호잠금 | 개인 실수 방지 (SVN lock과 별도) | SVN lock으로 대체 |
| D12 | 서버에 파일 저장 안 함 | 서버 용량 최소화 (메타데이터 + 미리보기 캐시만) | 서버에 SVN dump 저장 |
| D13 | ModeManager 패턴 | 기존 서비스 코드 변경 최소화 | 기존 서비스 전면 재작성 |
| D14 | docvault:// 커스텀 프로토콜 | 초대 원클릭 UX | 웹 기반 초대 시스템만 |

---

## 5. 코딩 규칙

### Main Process (Node.js/TypeScript)

- **Node.js 18+** (Electron 30+ 내장)
- **TypeScript strict mode** 필수
- **better-sqlite3** 동기 API 사용 (비동기 래퍼 불필요)
- **SVN CLI 실행**: `child_process.execFile` 또는 `spawn` (shell: false)
- **저장소별 직렬화**: 저장소당 큐/뮤텍스로 SVN 명령 직렬화
- **에러 처리**: IPC 응답 `{ success: boolean, data?, error?: string }` 패턴
- **로깅**: `electron-log` 사용, 한글 메시지

### Renderer Process (React/TypeScript)

- **React 18+** 함수형 컴포넌트 + Hook
- **TypeScript strict mode**
- **Tailwind CSS** 스타일링 (CSS 파일 최소화)
- **상태 관리**: React Query (IPC 응답 캐싱) + Context (전역 UI 상태)
- **라우팅**: React Router v6
- **IPC 호출**: preload contextBridge를 통한 타입 안전 호출

### 서버 연동 계층 (server/ 폴더)

- 서버 API 호출: `axios` (타임아웃 3~5초 설정 필수)
- 서버 WebSocket: `ws` 라이브러리
- 서버 연결 실패 시 항상 graceful fallback (로컬 동작 유지)
- 토큰: 메모리에만 보관 (파일 저장 금지). 앱 재시작 시 재로그인

### 공통

- 설정값 하드코딩 금지 — `shared/constants.ts` 또는 `config.json`으로 분리
- 모든 주석/로그/에러 메시지는 한글
- 파일 인코딩 UTF-8

---

## 6. SVN 연동 규칙

### 로컬 SVN (file:// 프로토콜)

- 각 저장소: SVN 레포 + 작업 복사본 + DB 메타데이터
- **SVN CLI 번들 경로**: `resources/svn/` (플랫폼별)
- 저장소 생성: `svnadmin create` → 작업 복사본 `svn checkout file:///...`
- 모든 SVN 명령은 번들된 SVN 바이너리 경로로 실행

### P2P 공유 시 svnserve

- **기본 포트**: 3690 (포트 충돌 자동 감지)
- **authz/passwd 자동 생성**: 수동 편집 절대 금지 — 앱 API 통해서만 변경
- **passwd 파일**: 평문 저장 (SVN 요구사항)

### Windows 환경 주의 (MSYS 경로 변환)

- `child_process` 실행 시: `env: { MSYS_NO_PATHCONV: '1' }` 옵션 적용
- 경로 검증: Windows 경로 트래버설 차단 유틸리티 적용

---

## 7. 인증/보안 규칙

### 오프라인 모드 (기본)

- **인증 없음**: 단일 사용자 로컬 앱
- OS 파일 권한으로 데이터 보호

### P2P 공유 모드

- **저장소별 사용자**: ID/PW/권한(r 또는 rw)
- **SVN lock**: `svn:needs-lock` 속성으로 동시 편집 방지
- **초대 링크**: `docvault://join?data={Base64_JSON}`, 만료 시간/일회용 옵션

### 커넥티드 모드 (서버 JWT)

- **Access Token**: 메모리(JavaScript 변수)에만 보관, 만료 시 자동 갱신
- **Refresh Token**: HttpOnly / Secure / SameSite=Strict 쿠키 (서버가 설정)
- **토큰 파일 저장 금지**: 디스크에 토큰 기록하지 않음
- **서버 연결 끊김 시**: 즉시 오프라인 모드로 전환, 로컬 기능 계속 동작

### 공통 보안

- **임시공유 서버**: localhost:9090, 비밀번호 옵션, 자동 만료
- **내보내기 패키지**: 선택적 AES-256 암호화
- **SQLite**: 파라미터화된 쿼리 (SQL 인젝션 방지 필수)
- **파일 검증**: 확장자 + 크기 제한

---

## 8. DB 규칙

- **SQLite** + better-sqlite3 (동기 API)
- **WAL 모드**: 파일 감시와 UI 동시 접근 허용
- **FTS5**: unicode61 토크나이저 (한국어 지원), search_index 테이블
- **테이블 구성** (로컬 19개 + 서버 연동용 추가):
  - 핵심: `repositories`, `repo_settings`
  - 메타데이터: `tags`, `file_tags`, `tag_rules`, `bookmarks`, `trash_items`
  - 보호/공유: `file_locks`, `lock_rules`, `shares`
  - 활동: `activity_log`, `search_metadata`
  - 설정: `app_settings`, `preview_cache`
  - P2P: `shared_users`, `invitations`, `remote_repos`, `svn_locks`
  - 서버 연동 추가: `server_sync_queue` (미전송 메타 큐잉)
- **Soft Delete**: trash_items (30/60/90일 보존)
- **마이그레이션**: 앱 시작 시 스키마 버전 체크 + 자동 마이그레이션

---

## 9. IPC 채널 규칙

### 채널 명명 규칙

- `{도메인}:{동작}` 패턴 (예: `repo:create`, `server:connect`)
- Main Process에서 `ipcMain.handle()` 등록
- Renderer에서 preload contextBridge를 통해 호출

### 기존 채널 (~80개, 변경 금지)

| 도메인 | 채널 수 | 예시 |
|--------|---------|------|
| repo | 6 | list, create, import, update, delete, stats |
| file | 15 | list, info, upload, mkdir, rename, move, copy, delete 등 |
| commit | 5 | log, diff, detail, revert, discard |
| preview | 2 | generate, thumbnail |
| search | 3 | query, reindex, global |
| tag | 6 | list, create, delete, attach, detach, rules |
| bookmark | 3 | list, toggle, check |
| trash | 3 | list, restore, empty |
| lock | 4 | status, toggle, list, rules |
| share | 5 | export, start-server, stop-server, copy-clipboard, list |
| watcher | 3 | status, pending, commit-selected |
| svnserve | 3 | start, stop, status |
| shared-user | 4 | list, create, update, delete |
| invitation | 3 | create, validate, list |
| remote-repo | 4 | accept, list, disconnect, status |
| sync | 2 | update, resolve-conflict |
| activity | 2 | list, export |
| settings | 4 | get, update, reset, export |
| backup | 3 | create, restore, list |

### 신규 서버 채널 (server.ipc.ts에 추가)

| 채널 | 설명 |
|------|------|
| `server:connect` | URL + ID + PW로 서버 로그인 |
| `server:disconnect` | 서버 연결 해제 |
| `server:status` | 현재 모드/연결 상태 조회 |
| `server:isConnected` | 커넥티드 여부 boolean |

---

## 10. UI 레이아웃 규칙

### 디자인 시스템 (VaultLine 서버 버전 계승)

- **컬러 스킴**:
  - Navy: `#1B2A4A` (헤더/사이드바 배경)
  - Accent: `#4ECDC4` (강조/버튼)
  - 상태색: Green(`#2E7D32` synced), Orange(`#E65100` modified), Blue(`#1565C0` new), Purple(`#6A1B9A` locked)

### 공통 레이아웃

- **헤더(48px)**: 로고 + 브레드크럼 + 검색바(Ctrl+K) + 설정 버튼
  - 커넥티드 추가: 알림 벨 + 사용자 아바타 + 🟢/🔴 연결 상태 표시
- **사이드바(200px)**:
  - 오프라인: 즐겨찾기, 저장소 목록, 태그, 휴지통, 디스크 사용량
  - 커넥티드 추가: 공유받은문서, 관리(admin만)
- **메인 영역(flex:1)**: 파일 테이블 + 툴바 + 드래그앤드롭 영역
- **우측 패널(260px)**: 파일 상세, 빠른 작업, 최근 커밋 / 저장소 현황

### 반응형 (데스크톱 윈도우 리사이즈 대응)

- **최소 크기**: 900×600px (`BrowserWindow.minWidth/minHeight`)
- **xl (1280px+)**: 사이드바(200) + 메인 + 우측패널(260) 전체 표시
- **lg (1024~1279)**: 우측패널 접힘 → 파일 선택 시 오버레이
- **md (900~1023)**: 사이드바 축소(48px 아이콘만) + 호버 시 확장
- JS `window.resize` 이벤트로 감지 (CSS media query 아닌 Electron 윈도우 크기 기준)

### 파일 상태 표시

- 🟢 synced / 🟠 modified / 🔵 new / 🔒yellow(내 편집) / 🔒red(타인 편집) / 🔒purple(보호잠금)

### 조건부 렌더링 패턴 (기존 컴포넌트 수정 최소화)

```tsx
// 기존 컴포넌트를 수정하지 않고, 래퍼로 감싸는 방식
const { connected } = useMode();

// Header: 기존 요소 유지 + 커넥티드 요소 추가
{connected && <NotificationBell />}
{connected && <UserAvatar />}
<ConnectionIndicator connected={connected} />

// Sidebar: 기존 메뉴 유지 + 커넥티드 메뉴 추가
{connected && <SharedWithMe />}
{connected && isAdmin && <AdminMenuLink />}
```

---

## 11. 서버 동기화 규칙 (메타데이터 전용)

### 원칙: 서버에 파일 원본 저장 안 함

- 서버 저장: 커밋 로그, 파일 트리 스냅샷, 사용자/그룹/공유/승인/태그/알림, 미리보기 PDF 캐시
- 서버 미저장: SVN 저장소 원본, 파일 내용, 과거 리비전 내용

### 커밋 시 push 프로토콜

```json
POST /api/sync/commit
{
  "repo_id": "proj_a",
  "revision": 45,
  "author": "user",
  "message": "커밋 메시지",
  "date": "2026-04-07T10:30:00",
  "changed_files": [
    { "action": "M", "path": "/보고서/Q1.docx", "size": 263900 }
  ],
  "file_tree_snapshot": [...]
}
```

페이로드: 커밋당 1~5KB (파일 내용 없음)

### 서버 연결 실패 시 큐잉

- 오프라인 상태에서 발생한 커밋 메타는 `server_sync_queue` 테이블에 저장
- 서버 재연결 시 일괄 push

### 미리보기 캐시 (on-demand)

- 웹 포탈에서 미리보기 요청 → 캐시 HIT: 바로 서빙 / MISS: 소유자 앱에 WebSocket 요청 → PDF 생성 → 서버 캐시 저장
- 캐시 상한: 기본 5GB (설정 가능)
- 소유자 오프라인 시: "파일 소유자가 오프라인입니다" 메시지

---

## 12. 기존 VaultLine 서버 코드 재사용 규칙

VaultLine(`C:\dev\VaultLine`) 프론트엔드 컴포넌트를 최대한 활용한다.

| 영역 | 재사용률 | 방법 |
|------|---------|------|
| React 컴포넌트 (커넥티드 전용) | 75% | TypeScript 그대로, API→IPC 호출 변환 |
| diff2html / pdf.js | 100% | 그대로 사용 |
| Tailwind 스타일 | 90% | 동일 디자인 시스템 |
| DB 스키마 | 60% | 19개 중 대부분 재사용 |

**주의**: `C:\dev\VaultLine` 소스는 참조만 한다. 직접 수정 금지.

---

## 13. 환경변수 및 설정

### config.json 구조

```json
{
  "server": {
    "url": "",
    "autoConnect": false,
    "retryIntervalSec": 30,
    "sync": {
      "pushCommitMeta": true,
      "pushPreviewOnCommit": true,
      "previewPushMaxSizeMB": 50,
      "previewPushFormats": ["docx","xlsx","pptx","pdf","hwp"],
      "allowFileProxy": true
    },
    "heartbeatIntervalSec": 60
  }
}
```

`server.url`이 비어있으면 서버 연결 시도 안 함 — 기존 동작에 영향 없음.

### 환경변수 (하드코딩 금지)

| 변수명 | 기본값 | 용도 |
|--------|--------|------|
| `VITE_DEV_PORT` | `5173` | Renderer dev server 포트 |
| `SVN_BINARY_PATH` | `resources/svn` | 번들 SVN 바이너리 경로 |
| `LIBREOFFICE_PATH` | 자동 탐지 | LibreOffice 실행 경로 |
| `DATA_DIR` | `%APPDATA%/VaultLine_Lite` | 데이터 저장 경로 |
| `SVNSERVE_PORT` | `3690` | P2P 공유 SVN 포트 |
| `SHARE_SERVER_PORT` | `9090` | 임시 공유 Express 서버 포트 |

---

## 14. 개발 진행 규칙

### 단계 확인 시

- **ROADMAP.md와 REQUIREMENTS.md 반드시 함께 확인** — ROADMAP은 단계/순서, REQUIREMENTS는 상세 요구사항
- docs2 폴더의 설계문서 참조:
  - `VaultLine_Local_하이브리드_전환_설계서_최종.md` — 전체 아키텍처 및 설계
  - `VaultLine_Local_하이브리드_전환_가이드.md` — Phase별 개발 가이드
  - `VaultLine_설계명세서_추가개발_v2_0.md` — v2.0 추가 기능 상세 명세

### 구현 시작 전

- **구현 계획과 범위를 반드시 사용자에게 확인받고 시작** — 계획 없이 바로 코드 작성 금지
- 계획에는 다음 포함: 구현 파일 목록, 각 파일의 역할, 제외 항목

### 소스코드 생성 시

- **파일 생성 시마다 역할과 구성을 사용자에게 설명**
- 형식:
  ```
  📄 src/main/services/server/ModeManager.ts
  역할: 오프라인/커넥티드 모드 전환 관리. 전체 서버 연동의 기반.
  구성: ModeManager 클래스 / initialize() / isConnected() / scheduleRetry()
  ```

### 테스트 규칙

- **E2E 테스트**: Playwright 또는 Spectron (`e2e/` 디렉토리)
- **테스트 케이스 문서**: `docs/TEST_CASES.md`
- **테스트 진행 기록**: `docs/E2E_TEST_PROGRESS.md` — 이어서 할 때 반드시 먼저 읽기
- **테스트 후**: `docs/TEST_CASES.md` 상태(✅/❌) 반드시 업데이트
- 테스트 케이스 ID: `TC-{섹션번호}-{순번}` (예: TC-01-01)

---

## 15. 설치/배포 규칙

### 패키징

- **Windows**: NSIS 인스톨러 (~175MB, per-user, 관리자 불필요)
- **macOS**: DMG (~180MB, universal binary)
- **Linux**: AppImage/deb/rpm (~170MB)
- **Portable**: ZIP + portable.flag (USB/제한 환경용)

### 빌드 명령어

```bash
# 개발 모드
npm run dev

# 프로덕션 빌드
npm run build

# Windows 인스톨러 패키징
npm run package:win
```

### 첫 실행 마법사

1. 데이터 디렉토리 선택
2. SVN 바이너리 감지 확인
3. LibreOffice 감지 확인
4. 첫 번째 저장소 생성
5. (선택) 서버 연결 설정
6. 완료

---

## 16. 문서 동기화 규칙 (필수)

| 변경 내용 | 업데이트 대상 |
|----------|-------------|
| 새 기능 완료 | ROADMAP.md (체크박스 완료 표시) |
| API/IPC 추가·변경 | SPEC.md 또는 관련 스펙 문서 |
| 아키텍처 변경 | CLAUDE.md, ARCHITECTURE.md |
| 설정 추가 | config.json 예시 및 환경변수 표 |
| 버그 수정·기능 추가 | CHANGELOG.md |

**작업 완료 체크리스트**:
- [ ] ROADMAP.md 진행 상태 업데이트
- [ ] 관련 문서 업데이트
- [ ] CHANGELOG.md 변경 이력 기록

---

## 17. 문서 참조

| 문서 | 용도 |
|------|------|
| [OVERVIEW.md](./OVERVIEW.md) | 프로젝트 개요 |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 시스템 아키텍처 |
| [REQUIREMENTS.md](./REQUIREMENTS.md) | 기능 요구사항 |
| [SPEC.md](./SPEC.md) | 기술 스펙, DB 스키마 |
| [ROADMAP.md](./ROADMAP.md) | 개발 로드맵 (Phase별) |
| [CHANGELOG.md](./CHANGELOG.md) | 변경 이력 |
| [DEPLOY.md](./DEPLOY.md) | 빌드/배포 가이드 |
| [Manual.md](./Manual.md) | 사용자 매뉴얼 |
| [docs/TEST_CASES.md](./docs/TEST_CASES.md) | E2E 테스트 케이스 |
| [docs/E2E_TEST_PROGRESS.md](./docs/E2E_TEST_PROGRESS.md) | E2E 테스트 진행 기록 |
| [docs2/VaultLine_Local_하이브리드_전환_설계서_최종.md](./docs2/VaultLine_Local_하이브리드_전환_설계서_최종.md) | 하이브리드 전환 전체 설계 |
| [docs2/VaultLine_Local_하이브리드_전환_가이드.md](./docs2/VaultLine_Local_하이브리드_전환_가이드.md) | Phase별 개발 가이드 |
| [docs2/VaultLine_설계명세서_추가개발_v2_0.md](./docs2/VaultLine_설계명세서_추가개발_v2_0.md) | v2.0 추가 기능 명세 |

---

## 18. 읽기 금지 폴더

- `docs/DONOTREAD/` 폴더 내의 파일은 **절대 읽지 말 것**

---

## 19. 수정 전 확인 규칙 (필수)

코드 수정이 필요한 경우 **바로 수정하지 않고** 아래 순서를 따른다:

1. 수정할 내용(파일명, 변경 이유, 방향)을 정리해서 사용자에게 먼저 보여준다
2. 사용자가 "수정 시작해" 또는 명시적으로 승인하면 그때 진행한다
3. 여러 수정사항이 쌓인 경우 `memory/project_todo.md`에 기록해두고 승인 시 한꺼번에 처리한다

**예외**: 빌드/실행 명령, 파일 읽기 등 코드를 변경하지 않는 작업은 바로 진행한다.

---

*최종 수정: 2026-04-25 — 수정 전 확인 규칙 추가*
