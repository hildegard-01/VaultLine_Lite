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

## Phase A-2 — V2 UI 선행 복원 (진행 예정)

VaultLine 서버 V2 풀 UI를 Lite에 복원. 서버 기능은 placeholder로 비활성.
상세 계획: `docs2/V2_UI_복원_계획서.md`

- [ ] A2-1. V2 디자인 시스템 기반 (theme.ts, Icons.tsx, useMode 훅)
- [ ] A2-2. 레이아웃 교체 (ShellV2, HeaderV2, SidebarV2) — 기존 layout은 참조용 유지
- [ ] A2-3. FileDetailPage (5탭: 프리뷰, 이력, Diff, 결재-비활성, 태그)
- [ ] A2-4. 로컬 동작 페이지 (ActivityPage, BookmarksPage, TagsPage)
- [ ] A2-5. 서버 전용 placeholder (공유, 결재, 알림, 관리자)
- [ ] A2-6. 라우팅 통합 + 안정화

---

## Phase B — 경량 서버 개발 (6~8주, 별도 프로젝트)

앱과 완전히 별도 저장소에서 서버를 개발. 앱 코드와 무관.

- [ ] B-1. 서버 프로젝트 초기 구조 (FastAPI + SQLAlchemy)
- [ ] B-2. Week 1: DB 모델 + JWT 인증 + 사용자 CRUD
- [ ] B-3. Week 2: 그룹 CRUD + 저장소 레지스트리
- [ ] B-4. Week 3: 커밋 메타 수신 API + WebSocket + heartbeat
- [ ] B-5. Week 4: 파일 프록시 + 활동 로그 + 태그 동기화
- [ ] B-6. Week 5: 공유 링크 + 알림
- [ ] B-7. Week 6: 승인 워크플로우 + 스케줄러
- [ ] B-8. Week 7~8: 관리자 API + React 웹 포탈

---

## Phase C — 앱에 서버 연동 계층 추가 (3~4주)

서버 완성 후, 기존 앱에 서버 연동 계층 추가. 기존 로컬 코드 최소 변경.

### 신규 파일 (server/ 폴더)

- [ ] C-1. `src/main/services/server/ModeManager.ts` — 오프라인/커넥티드 전환 핵심
- [ ] C-2. `src/main/services/server/ServerConnectionService.ts` — JWT 로그인/토큰
- [ ] C-3. `src/main/services/server/PresenceService.ts` — heartbeat (60초)
- [ ] C-4. `src/main/services/server/RepoSyncService.ts` — 커밋 메타 push
- [ ] C-5. `src/main/services/server/MetadataSyncService.ts` — 태그/활동 sync
- [ ] C-6. `src/main/services/server/FileProxyService.ts` — 파일 프록시 (WebSocket)
- [ ] C-7. `src/main/services/server/ServerShareService.ts` — 서버 공유 링크
- [ ] C-8. `src/main/services/server/ServerInviteService.ts` — 초대 링크
- [ ] C-9. `src/main/services/server/ServerNotificationService.ts` — 알림 수신
- [ ] C-10. `src/main/services/server/ServerApprovalProxy.ts` — 승인 API 프록시
- [ ] C-11. `src/main/services/server/ServerAdminProxy.ts` — 관리자 API 프록시
- [ ] C-12. `src/main/ipc/server.ipc.ts` — 서버 관련 IPC 채널 4개

### 기존 파일 수정 (최소)

- [ ] C-13. `src/main/services/CommitService.ts` — sync hook 1줄
- [ ] C-14. `src/main/services/TagService.ts` — sync hook 1줄
- [ ] C-15. `src/main/services/LockService.ts` — sync hook 1줄

### UI (커넥티드 전용)

- [ ] C-16. `src/renderer/src/hooks/useMode.ts` — 오프라인/커넥티드 모드 훅
- [ ] C-17. `src/renderer/src/components/connected/` — 커넥티드 전용 컴포넌트 (알림벨, 사용자 아바타 등)
- [ ] C-18. `src/renderer/src/components/layout/Header.tsx` — 조건부 알림벨/아바타 추가
- [ ] C-19. `src/renderer/src/components/layout/Sidebar.tsx` — 조건부 공유받은문서/관리 메뉴
- [ ] C-20. `SettingsModal.tsx` 서버 연결 탭 — 실제 연결 기능 활성화

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
