# VaultLine Lite — E2E 테스트 케이스

> 최종 수정: 2026-04-15
> 테스트 ID 형식: `TC-{섹션번호}-{순번}`
> 상태: ✅ 통과 / ❌ 실패 / ⏳ 미실행

---

## TC-01. 모드 전환 (D-1)

| ID | 시나리오 | 기대 결과 | 상태 |
|----|---------|-----------|------|
| TC-01-01 | config.json server.url 없이 앱 시작 | 오프라인 모드, 헤더에 ConnectionIndicator 🔴 | ⏳ |
| TC-01-02 | 설정 → 서버 탭 → URL/ID/PW 입력 → [연결] | 커넥티드 모드 전환, 🟢 표시, 알림벨·아바타 표시 | ⏳ |
| TC-01-03 | 커넥티드 상태에서 서버 강제 종료 | heartbeat 실패 → 오프라인 전환, 🔴, 30초 후 재시도 | ⏳ |
| TC-01-04 | 서버 재시작 후 30초 대기 | scheduleRetry 성공 → 🟢 (단, 자동 로그인 없음 → UI 로그인 요구) | ⏳ |
| TC-01-05 | 아바타 드롭다운 → [서버 연결 해제] | 오프라인 전환, 알림벨·아바타 숨김 | ⏳ |
| TC-01-06 | 잘못된 서버 URL 입력 → [연결] | 에러 메시지 "서버에 연결할 수 없습니다." | ⏳ |
| TC-01-07 | 잘못된 ID/PW → [연결] | 에러 메시지 "아이디 또는 비밀번호가 올바르지 않습니다." | ⏳ |

---

## TC-02. 서버 동기화 (D-2)

| ID | 시나리오 | 기대 결과 | 상태 |
|----|---------|-----------|------|
| TC-02-01 | 커넥티드 모드에서 파일 커밋 | RepoSyncService.pushCommitMetaFull 호출, 서버 /sync/commit 수신 확인 | ⏳ |
| TC-02-02 | 오프라인 중 파일 커밋 | server_sync_queue에 commit_meta 적재 | ⏳ |
| TC-02-03 | 오프라인 큐 적재 후 서버 재연결 | flushQueue 실행 → synced_at 업데이트, 서버 수신 확인 | ⏳ |
| TC-02-04 | 태그 attach (커넥티드) | MetadataSyncService.syncTagAttach → 서버 /tags/attach 반영 | ⏳ |
| TC-02-05 | 태그 detach (커넥티드) | MetadataSyncService.syncTagDetach → 서버 /tags/detach 반영 | ⏳ |
| TC-02-06 | 파일 잠금 (커넥티드) | MetadataSyncService.syncActivity → 서버 /activity file.lock 기록 | ⏳ |
| TC-02-07 | 파일 잠금 해제 (커넥티드) | 서버 /activity file.unlock 기록 | ⏳ |

---

## TC-03. 파일 프록시 + WebSocket (D-3)

| ID | 시나리오 | 기대 결과 | 상태 |
|----|---------|-----------|------|
| TC-03-01 | 커넥티드 후 WebSocket 연결 | FileProxyService._ws 열림 (readyState OPEN) | ⏳ |
| TC-03-02 | 서버에서 file_request 전송 | 로컬 파일 읽어 base64 file_response 전송 | ⏳ |
| TC-03-03 | file_request 경로에 `..` 포함 | 오류 응답 "파일을 찾을 수 없습니다." 반환, 파일 미전송 | ⏳ |
| TC-03-04 | 설정 allowFileProxy=false 상태에서 file_request | "파일 프록시가 비활성화되어 있습니다." 응답 | ⏳ |
| TC-03-05 | WS 연결 끊김 (커넥티드 모드 유지 중) | 5초 후 자동 재연결 시도 | ⏳ |
| TC-03-06 | 오프라인 전환 후 WS close | 재연결 미시도 (isConnected=false 체크) | ⏳ |
| TC-03-07 | 서버 알림 수신 (notification) | window 'vaultline:notification-received' 이벤트 발생 | ⏳ |

---

## TC-04. UI 커넥티드 컴포넌트 (D-4)

| ID | 시나리오 | 기대 결과 | 상태 |
|----|---------|-----------|------|
| TC-04-01 | 오프라인 모드에서 헤더 | 알림벨·아바타 미표시, ConnectionIndicator 🔴 | ⏳ |
| TC-04-02 | 커넥티드 모드에서 헤더 | 알림벨·아바타·🟢 표시 | ⏳ |
| TC-04-03 | 알림벨 클릭 → 드롭다운 | 알림 목록 표시, 미읽음 배지 수 | ⏳ |
| TC-04-04 | 알림 항목 클릭 | mark-read 호출, 해당 항목 읽음 처리 | ⏳ |
| TC-04-05 | [모두 읽음] 클릭 | mark-all-read 호출, 배지 0 | ⏳ |
| TC-04-06 | 일반 사용자 로그인 | 사이드바 AdminMenuLink 미표시 | ⏳ |
| TC-04-07 | admin 로그인 | 사이드바 AdminMenuLink 표시 | ⏳ |
| TC-04-08 | 사이드바 공유받은문서 | 30초 폴링, 서버 repo 목록 표시 | ⏳ |
| TC-04-09 | 아바타 → [서버 연결 해제] 확인 | 오프라인 전환, server:disconnect IPC 호출 | ⏳ |

---

## TC-05. 기존 로컬 기능 회귀 테스트 (오프라인 모드)

| ID | 시나리오 | 기대 결과 | 상태 |
|----|---------|-----------|------|
| TC-05-01 | 오프라인 모드에서 저장소 생성 | 정상 생성, 서버 호출 없음 | ✅ |
| TC-05-02 | 파일 업로드 및 커밋 | 로컬 SVN 커밋 성공, pushCommitMetaFull 미호출 | ✅ |
| TC-05-03 | 태그 attach/detach | 로컬 DB 저장, syncTagAttach 미호출 | ✅ |
| TC-05-04 | 파일 잠금 토글 | 로컬 DB 저장, syncActivity 미호출 | ✅ |
| TC-05-05 | 검색 (FTS5) | 정상 검색, 서버 쿼리 없음 | ⏳ |
| TC-05-06 | 휴지통 이동/복원 | 정상 동작 | ⏳ |

---

## TC-06. NSIS 인스톨러 (D-6)

| ID | 시나리오 | 기대 결과 | 상태 |
|----|---------|-----------|------|
| TC-06-01 | `npm run package:win` 빌드 | 에러 없이 dist/ 인스톨러 생성 | ⏳ |
| TC-06-02 | 인스톨러 실행 → 첫 실행 마법사 | 5단계 마법사 정상 동작 | ⏳ |
| TC-06-03 | 설치 후 오프라인 모드 첫 실행 | 로컬 기능 100% 정상 | ⏳ |
