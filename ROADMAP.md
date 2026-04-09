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
