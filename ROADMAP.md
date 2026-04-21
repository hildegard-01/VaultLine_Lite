# VaultLine Lite — 개발 로드맵

> 최종 수정: 2026-04-08

---

## Phase A — 로컬 버전 출시 (1주) ✅ 완료

로컬 SVN 기능을 그대로 패키징하여 출시. 서버 연결은 다음 Phase에서 추가.

- [x] A-1. `config.json` server 블록 placeholder 추가
- [x] A-2. 설정 화면 "서버 연결" 탭 추가 (비활성 — "다음 업데이트에서 제공")
- [x] A-3. 앱명 VaultLine Lite로 변경 / electron-builder 패키징 준비
- [x] A-4. `docvault://` 프로토콜 등록 (초대 링크 수신 대비)

---

## Phase A-2 — V2 UI 선행 복원 ✅ 완료

VaultLine 서버 V2 풀 UI를 Lite에 복원. 서버 기능은 placeholder로 비활성.
상세 계획: `docs2/V2_UI_복원_계획서.md`

- [x] A2-1. V2 디자인 시스템 기반 (theme.ts, Icons.tsx, useMode 훅)
- [x] A2-2. 레이아웃 교체 (ShellV2, HeaderV2, SidebarV2) — 기존 layout은 참조용 유지
- [x] A2-3. FileDetailPage (5탭: 프리뷰, 이력, Diff, 결재-비활성, 태그)
- [x] A2-4. 로컬 동작 페이지 (ActivityPage, BookmarksPage, TagsPage)
- [x] A2-5. 서버 전용 placeholder (공유, 결재, 알림, 관리자) — OfflinePlaceholder + useMode 연동
- [x] A2-6. 라우팅 통합 + 안정화

---

## Phase B — 경량 서버 개발 ✅ 완료

별도 프로젝트 `C:\dev\VaultLine_Server` (FastAPI + SQLAlchemy). 65개 API + WebSocket.

- [x] B-1. 서버 프로젝트 초기 구조 (FastAPI + SQLAlchemy)
- [x] B-2. Week 1: DB 모델 + JWT 인증 + 사용자 CRUD
- [x] B-3. Week 2: 그룹 CRUD + 저장소 레지스트리
- [x] B-4. Week 3: 커밋 메타 수신 API + WebSocket + heartbeat
- [x] B-5. Week 4: 파일 프록시 + 활동 로그 + 태그 동기화
- [x] B-6. Week 5: 공유 링크 + 알림
- [x] B-7. Week 6: 승인 워크플로우 + 스케줄러
- [x] B-8. Week 7~8: 관리자 API

---

## Phase C — 앱에 서버 연동 계층 추가 ✅ 완료

서버 연동 계층 추가 완료. 기존 로컬 코드 최소 변경.

### 신규 파일 (server/ 폴더)

- [x] C-1. `ModeManager.ts` — 오프라인/커넥티드 전환 핵심
- [x] C-2. `ServerConnectionService.ts` — JWT 로그인/토큰 (메모리 전용)
- [x] C-3. `PresenceService.ts` — heartbeat (60초)
- [x] C-4. `RepoSyncService.ts` — 커밋 메타 push + 오프라인 큐잉
- [x] C-5. `MetadataSyncService.ts` — 태그/활동 sync
- [x] C-6. `FileProxyService.ts` — 파일 프록시 (WebSocket 응답)
- [x] C-7. `ServerShareService.ts` — 서버 공유 링크
- [x] C-8. `ServerInviteService.ts` — 초대 링크
- [x] C-9. `ServerNotificationService.ts` — 알림 수신
- [x] C-10. `ServerApprovalProxy.ts` — 승인 API 프록시
- [x] C-11. `ServerAdminProxy.ts` — 관리자 API 프록시
- [x] C-12. `server.ipc.ts` — 서버 IPC 채널 4개 (connect/disconnect/status/isConnected)

### 기존 파일 수정

- [x] C-13. `CommitService.ts` — sync hook (RepoSyncService.pushCommit)
- [x] C-16. `useMode.ts` — server:mode-changed 이벤트 수신 (자동 모드 전환)
- [x] C-18. `HeaderV2.tsx` — 알림벨/연결상태 조건부 표시 (Phase A-2에서 이미 구현)
- [x] C-19. `SidebarV2.tsx` — 공유받은문서/관리 메뉴 조건부 (Phase A-2에서 이미 구현)
- [x] C-20. `SettingsModal.tsx` — 서버 연결 탭 실제 연결 기능 활성화
- [x] DB 스키마 — server_sync_queue 테이블 추가

---

## Phase U — 관리자 UI + FilesPage V2 재구축 ✅ 완료

와이어프레임(`docs2/현재구현_wireframes_v2.html`) 기준으로 UI를 재정비.
로컬 리소스 기반 관리자 화면을 서버 없이 먼저 구축하고, 서버 연동은 Phase D에서 스위치.

### U1 — FilesPage V2 재작성

- [x] U1-1. `FileToolbarV2` — V2 인라인 스타일 + 벌크액션바
- [x] U1-2. `FileTableV2` — 7컬럼 (체크/★/이름+칩/크기/리비전/수정일/⋮) + 드래그앤드롭 유지
- [x] U1-3. `FileRightPanelV2` — 5섹션 (선택파일/메타+태그/버전이력/공유/작업)
- [x] U1-4. FilesPage.tsx import 교체 — 기존 IPC/모달/로직은 그대로

### U2 — DB 마이그레이션 + 신규 IPC 10개

- [x] U2-1. `repositories` — `quota_bytes`, `pending_deletion_at` 컬럼 추가
- [x] U2-2. `shared_users` — `status`, `last_login_at`, `failed_login_count` 추가
- [x] U2-3. SCHEMA_VERSION 2 → 3, `addColumnIfMissing` 멱등 마이그레이션
- [x] U2-4. `activity:stats`, `activity:export-csv`
- [x] U2-5. `repo:admin-list`, `repo:set-quota`, `repo:mark-deletion`, `repo:cancel-deletion`
- [x] U2-6. `system:health-check`, `system:info-full` (신규 system.ipc.ts)
- [x] U2-7. `settings:reset-category`
- [x] U2-8. `shared-user:reset-password` + `status` 관리 필드 확장
- [x] U2-9. `backup:create/restore` 인자 확장 (`includeDB`, `includeSVN`)

### U3 — 관리자 레이아웃 + 7페이지

- [x] U3-1. `AdminSidebarV2` — `/admin/*` 경로 진입 시 ShellV2가 사이드바 자동 교체
- [x] U3-2. AdminDashboard — 메트릭 4카드 + 최근 활동 5건
- [x] U3-3. AdminUsers — 저장소별 P2P 공유 사용자 관리 + 비번 변경
- [x] U3-4. AdminRepos — 쿼터/예약삭제/사용량 표시
- [x] U3-5. AdminSettings — 카테고리별 설정 + 초기화
- [x] U3-6. AdminSystemInfo — 시스템/서비스/디스크 (30초 폴링)
- [x] U3-7. AdminBackup — 즉시 백업(옵션) + 부분 복원
- [x] U3-8. AdminActivityLog — 통계 4카드 + 필터 + CSV 내보내기

### U4 — Placeholder 유지

- [x] U4-1. `/admin/groups` — 서버 전용 placeholder (그룹 개념은 서버에서만 지원)
- [x] U4-2. `/admin/approval-rules` — 서버 전용 placeholder
- [x] U4-3. `/shares`, `/approvals`, `/notifications` — 기존 placeholder 유지

---

## Phase D — 통합 테스트 + 마무리 (2주)

- [ ] D-1. 오프라인 ↔ 커넥티드 전환 안정성 테스트
- [ ] D-2. 웹 포탈 연동 테스트 (커밋 → 서버 이력 확인)
- [ ] D-3. eager preview cache 테스트
- [ ] D-4. 관리자 화면 통합 테스트
- [ ] D-5. E2E 테스트 전체 통과
- [ ] D-6. NSIS 인스톨러 최종 빌드 + 배포

---

## 타임라인

```
현재 ─── Phase A ✅ ─── Phase B ──────────────── Phase C ──── Phase D ── 완성
                        (6~8주, 별도 프로젝트)    (3~4주)      (2주)
```
