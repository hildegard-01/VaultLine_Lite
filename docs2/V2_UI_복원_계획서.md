# VaultLine Lite — V2 UI 선행 복원 계획서

> 작성일: 2026-04-08  
> 상태: 계획 완료, 구현 대기  
> 선행 조건: Phase A 완료 (v0.1.0)

---

## 1. 배경

Phase A(로컬 버전)가 완료된 상태에서, VaultLine 서버 버전의 V2 풀 UI를 Lite에 복원한다.
서버 전용 기능(공유, 결재, 알림, 관리자)은 UI만 추가하고 오프라인에서 비활성 처리한다.
로컬에서 동작 가능한 기능(상세보기, Diff, 활동로그, 북마크, 태그)은 실제 작동하도록 구현한다.

**핵심 원칙**:
- 기존 로컬 코드 최소 변경 — 새 파일 추가 위주
- 기존 FilesPage, 모달 12개, IPC 서비스 24개 건드리지 않음
- 기존 UI 컴포넌트(Shell.tsx, Header.tsx, Sidebar.tsx)는 참조용으로 유지 (삭제하지 않음)

---

## 2. VaultLine(서버) vs Lite 기능 차이 요약

### Lite에 없는 페이지 (복원 대상)

| 카테고리 | VaultLine 서버 | Lite 현재 | 동작 모드 |
|----------|---------------|-----------|-----------|
| 파일 상세보기 | FileDetailPage (5탭) | 없음 (우측 패널+모달로 분산) | 로컬 동작 |
| 활동 로그 | ActivityPage | 없음 | 로컬 동작 |
| 북마크 | BookmarksPage | 없음 (사이드바만) | 로컬 동작 |
| 태그 관리 | TagsPage | 없음 (사이드바만) | 로컬 동작 |
| 공유받은 문서 | SharesPage | 없음 | 서버 전용 (placeholder) |
| 결재/승인 | ApprovalsPage | 없음 | 서버 전용 (placeholder) |
| 알림 | NotificationsPage + 벨 아이콘 | 없음 | 서버 전용 (placeholder) |
| 관리자 패널 | 10개 페이지 | 없음 | 서버 전용 (placeholder) |
| V2 디자인 | theme + Icons + V2 컴포넌트 | 없음 | 기반 |

### 기능이 다른 컴포넌트 (주의 필요)

| 컴포넌트 | VaultLine | Lite | 차이점 |
|----------|-----------|------|--------|
| Header | 알림벨 + 사용자 아바타 | 설정 버튼만 | 커넥티드 시 벨/아바타 추가 |
| Sidebar | 팀 저장소 + 관리 메뉴 | 개인 저장소 + 태그 + 디스크 | 커넥티드 시 메뉴 확장 |
| ShareModal | 사용자/그룹/링크 공유 | ZIP/로컬서버 공유 | **완전히 다름** — 각각 유지 |
| FileRightPanel | 3탭 (정보/공유/버전) | 단일 뷰 | 상세보기 페이지로 분리 |

### Lite에만 있는 것 (유지, 변경하지 않음)

DropZone, PendingChangesBar, ConflictModal, CreateRepoModal, InvitationModal, JoinModal, LockRulesModal, PreviewModal, SharedUsersModal, InputModal, StatusDot, FileIcon, TagBadge

---

## 3. 구현 단계

### Step 1: V2 디자인 시스템 기반

| 작업 | 파일 | 비고 |
|------|------|------|
| 테마 토큰 | `src/renderer/src/design/theme.ts` | VaultLine V2 theme.ts 이식 |
| 아이콘 라이브러리 | `src/renderer/src/design/Icons.tsx` | VaultLine V2 Icons.tsx 이식 (33개 SVG) |
| 모드 훅 | `src/renderer/src/hooks/useMode.ts` | offline/connected 상태 제공. 현재는 항상 offline |
| 폰트 | `src/renderer/src/styles/globals.css` 수정 | Pretendard 폰트 적용 |
| Tailwind 확장 | `tailwind.config.js` 수정 | V2 색상을 extend에 추가 |

### Step 2: 레이아웃 교체

| 작업 | 파일 | 비고 |
|------|------|------|
| ShellV2 | `src/renderer/src/components/layout/ShellV2.tsx` | V2 레이아웃. 기존 모달 관리 + 이벤트 브릿지 유지 |
| HeaderV2 | `src/renderer/src/components/layout/HeaderV2.tsx` | 52px navy. 알림벨/아바타 → useMode 조건부. 브레드크럼 유지 |
| SidebarV2 | `src/renderer/src/components/layout/SidebarV2.tsx` | 220px. 기존 기능 유지 + 바로가기 섹션 추가 |
| App.tsx | 수정 | Shell → ShellV2 교체 + 새 라우트 추가 |
| main.tsx | 수정 | ModeProvider 래핑 |

**기존 Shell.tsx, Header.tsx, Sidebar.tsx는 참조용으로 유지 (삭제하지 않음)**

### Step 3: FileDetailPage (핵심 — 로컬 동작)

VaultLine V2의 FileDetailPageV2(1569줄)를 탭별 분리 (500줄 제한 준수):

| 파일 | 설명 | IPC 채널 |
|------|------|----------|
| `pages/file-detail/FileDetailPage.tsx` | 메인 셸 + 탭바 (~250줄) | `file:info`, `bookmark:check` |
| `pages/file-detail/PreviewTab.tsx` | 프리뷰 탭 (~150줄) | `preview:generate`, `preview:read-file` |
| `pages/file-detail/HistoryTab.tsx` | 전체 커밋 이력 (~150줄) | `commit:log` |
| `pages/file-detail/DiffTab.tsx` | diff 뷰어 (~200줄) | `commit:diff`, `commit:log` |
| `pages/file-detail/ApprovalTab.tsx` | 결재 — 오프라인 placeholder (~30줄) | useMode 가드 |
| `pages/file-detail/TagTab.tsx` | 태그 관리 (~120줄) | `tag:list`, `tag:file-tags`, `tag:attach`, `tag:detach` |
| `pages/file-detail/MetadataPanel.tsx` | 우측 정보 패널 (~150줄) | `file:info`, `lock:status`, `bookmark:toggle` |

### Step 4: 로컬 동작 페이지

| 파일 | 설명 | 비고 |
|------|------|------|
| `pages/ActivityPage.tsx` (~130줄) | 활동 로그 타임라인 | **신규 IPC** `activity:list` 필요 |
| `pages/BookmarksPage.tsx` (~160줄) | 북마크 목록 | 기존 `bookmark:list` |
| `pages/TagsPage.tsx` (~300줄) | 태그별 파일 목록 | 기존 `tag:list`, `tag:files` |

**백엔드 추가:**
- `src/main/ipc/activity.ipc.ts` (~30줄)
- `src/shared/types/ipc.ts`에 `activity:list` 채널 추가
- `src/main/ipc/index.ts`에 등록

### Step 5: 서버 전용 placeholder 페이지

| 파일 | 설명 |
|------|------|
| `components/shared/OfflinePlaceholder.tsx` | 공용 비활성 안내 컴포넌트 |
| `pages/SharesPage.tsx` | placeholder |
| `pages/ApprovalsPage.tsx` | placeholder |
| `pages/NotificationsPage.tsx` | placeholder |
| `pages/admin/AdminPlaceholder.tsx` | 관리자 공통 placeholder |

### Step 6: 라우팅 통합

```
/                     → HomePage (기존)
/repo/:repoId         → FilesPage (기존)
/file/:repoId         → FileDetailPage (신규)
/bookmarks            → BookmarksPage (신규)
/tags                 → TagsPage (신규)
/activity             → ActivityPage (신규)
/trash                → TrashPage (기존)
/shares               → SharesPage (placeholder)
/approvals            → ApprovalsPage (placeholder)
/notifications        → NotificationsPage (placeholder)
/admin/*              → AdminPlaceholder (placeholder)
```

---

## 4. 스타일링 전략

**하이브리드 방식:**
- 신규 V2 컴포넌트 → 인라인 스타일 + theme.ts (VaultLine V2 동일)
- 기존 컴포넌트 → Tailwind 유지 (변경하지 않음)
- Tailwind config에 V2 색상 추가하여 필요시 참조 가능

---

## 5. 파일 변경 요약

| 구분 | 파일 수 | 상세 |
|------|---------|------|
| **신규 (renderer)** | ~18개 | design 2, hooks 1, layout 3, pages 12, shared 1 |
| **신규 (main)** | 1개 | activity.ipc.ts |
| **수정** | 5개 | App.tsx, main.tsx, globals.css, tailwind.config.js, ipc.ts, index.ts |
| **기존 유지 (참조용 포함)** | 전부 | FilesPage, HomePage, TrashPage, 모달 12개, 서비스 24개, 기존 layout 3개 |

---

## 6. 참조 소스

- VaultLine V2 디자인: `C:\dev\VaultLine\frontend\src\components\v2\`
- VaultLine V2 페이지: `C:\dev\VaultLine\frontend\src\pages\v2\`
- VaultLine 와이어프레임: `C:\dev\VaultLine\docs\wireframes.html`
