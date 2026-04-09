# CHANGELOG

VaultLine Lite 변경 이력입니다. [Keep a Changelog](https://keepachangelog.com/ko/) 형식을 따릅니다.

---

## [Unreleased]

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
