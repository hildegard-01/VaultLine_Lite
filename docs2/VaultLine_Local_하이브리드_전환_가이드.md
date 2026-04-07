# VaultLine Local → 하이브리드 전환 개발자 가이드

> **현재 상태**: 로컬 버전 80% 완성, 패키징/배포 단계만 남음  
> **목표**: 기존 코드 변경 없이, 서버 연동 계층을 추가하여 하이브리드로 전환  
> **참조 문서**: VaultLine_Local_하이브리드_전환_설계서_최종.md  
> **작성일**: 2026-04-07

---

## 전환 전략 요약

```
현재 앱 (80% 완성)
├── src/main/services/    ← 16개 서비스 (건드리지 않음)
├── src/main/ipc/         ← IPC 핸들러 (건드리지 않음)
├── src/renderer/         ← React UI (조건부 렌더링만 추가)
└── config.json           ← server 블록만 추가

추가할 것:
├── src/main/services/server/  ← 새 폴더, 11개 서비스
├── src/renderer/components/connected/  ← 커넥티드 전용 UI 컴포넌트
└── 기존 서비스 5개에 1줄씩 sync hook 추가
```

**원칙: 기존 파일 수정은 최소화. 새 파일 추가가 주된 작업.**

---

## Phase A: 지금 바로 출시 준비 (0~1주)

로컬 버전을 그대로 출시합니다. 하이브리드 전환은 다음 업데이트에서 합니다.

### A-1. config.json에 server 블록 placeholder 추가

```json
// config.json 마지막에 추가
"server": {
  "url": "",
  "autoConnect": false
}
```

빈 URL이면 서버 연결 시도 안 함. 기존 동작에 영향 0.

### A-2. 설정 화면에 "서버 연결" 섹션 (비활성)

```
설정 → 🔌 서버 연결
┌─────────────────────────────────────┐
│  서버 연결                           │
│  ─────────────────────────────      │
│  서버 URL:  [                    ]   │
│                                     │
│  ⚠ 서버 연결 기능은 다음 업데이트에서 │
│    제공됩니다.                       │
│                                     │
│  [연결] ← 비활성 (grayed out)       │
└─────────────────────────────────────┘
```

이렇게 하면 사용자에게 "서버 기능이 올 거다"는 신호를 줄 수 있고, 출시를 지연시키지 않습니다.

### A-3. 패키징 및 출시

기존 electron-builder 설정 그대로 빌드하여 출시합니다. v1.2 설계서의 설치/배포 설계를 따릅니다.

### A-4. docvault:// 프로토콜 등록 (미리)

설치 시 `app.setAsDefaultProtocolClient('docvault')` 등록해둡니다. 아직 처리 로직은 없지만, 나중에 초대 링크를 받을 때를 대비합니다.

```typescript
// main.ts에 추가 (앱 시작 시)
app.setAsDefaultProtocolClient('docvault');
// 프로토콜 핸들러는 Phase C에서 구현
```

---

## Phase B: 경량 서버 개발 (6~8주, 별도 프로젝트)

앱과 **완전히 별도 저장소**에서 서버를 개발합니다.

### B-1. 서버 프로젝트 초기 구조 생성

```bash
mkdir vaultline-server && cd vaultline-server
# FastAPI 프로젝트 초기화
pip install fastapi uvicorn sqlalchemy alembic python-jose bcrypt
```

```
vaultline-server/
├── api/
│   ├── auth.py           # ★ Week 1: JWT 로그인
│   ├── users.py          # ★ Week 1: 사용자 CRUD
│   ├── groups.py         # Week 2: 그룹 CRUD
│   ├── repos.py          # ★ Week 2: 저장소 레지스트리
│   ├── sync.py           # ★ Week 3: 커밋 메타 수신 API
│   ├── proxy.py          # Week 4: 파일 프록시
│   ├── presence.py       # ★ Week 3: heartbeat API
│   ├── shares.py         # Week 5: 공유 링크
│   ├── approvals.py      # Week 6: 승인 워크플로우
│   ├── activity.py       # Week 4: 활동 로그
│   ├── notifications.py  # Week 5: 알림
│   ├── tags.py           # Week 4: 태그 동기화
│   └── admin.py          # Week 7: 관리자 대시보드
├── ws/
│   └── handler.py        # ★ Week 3: WebSocket 핸들러
├── web/dist/             # Week 7~8: React 웹 포탈 빌드
├── db/models.py          # ★ Week 1: SQLAlchemy 모델
├── scheduler/            # Week 6: 백그라운드 작업
├── config.yaml
└── main.py               # ★ Week 1: 진입점
```

### B-2. 주차별 개발 순서

| 주차 | 작업 | 산출물 | VaultLine v3.2 재사용 |
|------|------|--------|:-------------------:|
| **1주** | DB 모델 + JWT 인증 + 사용자 CRUD | 로그인/가입 가능한 API 서버 | 80% |
| **2주** | 그룹 CRUD + 저장소 레지스트리 | 저장소 등록/조회 가능 | 70% |
| **3주** | 커밋 메타 수신 API + WebSocket + heartbeat | 앱에서 커밋하면 서버에 메타데이터 도착 | 20% (신규) |
| **4주** | 파일 프록시 + 활동 로그 + 태그 동기화 | 웹에서 파일 미리보기 (프록시) 가능 | 50% |
| **5주** | 공유 링크 + 알림 | 서버 공유 URL 생성 가능 | 90% |
| **6주** | 승인 워크플로우 + 스케줄러 (캐시/로그 정리) | 승인 요청/처리 가능 | 90% |
| **7주** | 관리자 API + React 웹 포탈 시작 | 관리자 대시보드 | 60% |
| **8주** | 웹 포탈 완성 + 통합 테스트 | 완성된 서버 | 70% (React) |

### B-3. 서버에서 VaultLine v3.2 코드 재사용 가이드

```
그대로 가져오기 (복사 + 약간 수정):
  ├── auth.py          — JWT 로직 거의 동일
  ├── users.py         — 사용자 CRUD 동일 (SVN passwd 동기화 부분만 제거)
  ├── groups.py        — 그의 동일
  ├── shares.py        — 동일
  ├── approvals.py     — 동일
  ├── notifications.py — 동일
  └── tags.py          — 동일 (클라이언트에서 수신하는 방향 추가)

새로 작성:
  ├── sync.py          — 커밋 메타데이터 수신 + file_tree 갱신 (완전 신규)
  ├── proxy.py         — WebSocket으로 클라이언트에 파일 요청 → 중계 (완전 신규)
  ├── presence.py      — heartbeat 수신 + 온라인 상태 관리 (완전 신규)
  └── repos.py         — 메타데이터 레지스트리 (v3.2의 repos에서 SVN 조작 부분 제거)

제거 (v3.2에 있지만 사용 안 함):
  ├── file browsing (svn list/cat/log — 서버에 SVN 없음)
  ├── file management (upload/move/delete — 클라이언트에서만)
  ├── SVN authz/passwd management
  └── Docker/Nginx 관련 설정
```

---

## Phase C: 앱에 서버 연동 계층 추가 (3~4주)

**서버가 준비된 후**, 기존 앱에 연동 계층을 추가합니다.

### C-1. ModeManager 구현 (가장 먼저)

모든 서버 연동의 기반이 되는 모드 관리자를 만듭니다.

```typescript
// src/main/services/server/ModeManager.ts

export type AppMode = 'offline' | 'connected';

class ModeManager {
  private mode: AppMode = 'offline';
  private serverUrl: string = '';
  
  // 앱 시작 시 호출
  async initialize(): Promise<void> {
    const config = loadConfig();
    this.serverUrl = config.server?.url || '';
    
    if (!this.serverUrl) {
      this.setMode('offline');  // 서버 URL 없으면 오프라인
      return;
    }
    
    try {
      await this.tryConnect();
      this.setMode('connected');
    } catch {
      this.setMode('offline');  // 연결 실패 → 오프라인 폴백
      this.scheduleRetry();     // 30초 후 재시도
    }
  }
  
  isConnected(): boolean { return this.mode === 'connected'; }
  
  // 전체 앱에서 사용:
  // if (modeManager.isConnected()) { ... 서버 기능 ... }
}
```

**이 파일이 핵심입니다.** 기존 서비스 코드에 `if (modeManager.isConnected())` 한 줄만 추가하면 됩니다.

### C-2. 기존 서비스에 sync hook 추가 (5개 파일, 각 1줄)

```typescript
// CommitService.ts — 기존 commit() 메서드 마지막에 추가
async commit(wcPath: string, message: string): Promise<number> {
  const rev = await this.svnService.commit(wcPath, message);
  // ... 기존 로직 (인덱싱, 활동로그 등) ...
  
  // ↓ 이 1줄만 추가
  if (modeManager.isConnected()) await repoSyncService.pushCommitMeta(repoId, rev);
  
  return rev;
}

// TagService.ts — attach/detach 후
if (modeManager.isConnected()) await metadataSyncService.pushTags(repoId);

// ActivityService.ts — log() 후
if (modeManager.isConnected()) await metadataSyncService.pushActivity(entry);

// LockService.ts — toggle 후
if (modeManager.isConnected()) await metadataSyncService.pushLockState(repoId, filePath);
```

### C-3. server/ 폴더에 신규 서비스 생성

파일 생성 순서 (의존 관계 기준):

```
Week 1:
  ① ModeManager.ts           — 모드 관리 (위에서 설명)
  ② ServerConnectionService.ts — JWT 로그인/토큰 관리
  ③ PresenceService.ts        — heartbeat 전송 (60초 간격)

Week 2:
  ④ RepoSyncService.ts        — 커밋 메타데이터 push
  ⑤ MetadataSyncService.ts    — 태그/활동로그 push
  ⑥ FileProxyService.ts       — 서버의 파일 요청에 응답 (WS)

Week 3:
  ⑦ ServerShareService.ts     — 서버 공유 링크 생성/조회
  ⑧ ServerInviteService.ts    — 서버 초대 링크 생성/수신
  ⑨ ServerNotificationService.ts — 서버 알림 수신/표시
  ⑩ ServerApprovalProxy.ts    — 서버 승인 API 프록시
  ⑪ ServerAdminProxy.ts       — 서버 관리자 API 프록시
```

### C-4. ShareService 이중 구현

기존 ShareService를 인터페이스로 분리합니다.

```typescript
// 기존 ShareService.ts → LocalShareStrategy.ts로 이름 변경 (내용 변경 없음)

// 새로 생성: ShareService.ts (라우터 역할)
class ShareService {
  private local: LocalShareStrategy;   // 기존 코드
  private server: ServerShareStrategy; // 신규
  
  async share(repoId: number, filePath: string, options: ShareOptions) {
    if (modeManager.isConnected() && options.type === 'server_link') {
      return this.server.createServerLink(repoId, filePath, options);
    }
    return this.local.share(repoId, filePath, options);
  }
  
  getAvailableMethods(): ShareMethod[] {
    const methods = this.local.getMethods();  // zip, temp_server, clipboard
    if (modeManager.isConnected()) {
      methods.unshift({ type: 'server_link', label: '서버 공유 링크' });
    }
    return methods;
  }
}
```

### C-5. UI: 조건부 렌더링 추가

기존 React 컴포넌트를 수정하지 않고, 래퍼 컴포넌트로 감쌉니다.

```tsx
// src/renderer/hooks/useMode.ts (신규)
export function useMode() {
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    const check = () => setConnected(window.api.isConnected());
    check();
    const interval = setInterval(check, 5000);
    return () => clearInterval(interval);
  }, []);
  return { connected };
}

// src/renderer/components/Header.tsx — 기존 헤더에 조건부 요소 추가
function Header() {
  const { connected } = useMode();
  return (
    <header>
      {/* 기존 로고, 경로, 검색 — 변경 없음 */}
      <Logo /><Breadcrumb /><SearchButton />
      
      {/* 커넥티드에서만 표시 */}
      {connected && <NotificationBell />}
      {connected && <UserAvatar />}
      
      <SettingsButton />
      <ConnectionIndicator connected={connected} />
    </header>
  );
}

// src/renderer/components/Sidebar.tsx — 사이드바 하단에 조건부 메뉴
function Sidebar() {
  const { connected } = useMode();
  return (
    <aside>
      {/* 기존 사이드바 내용 — 변경 없음 */}
      <Bookmarks /><RepoList /><Tags /><Trash /><DiskUsage />
      
      {/* 커넥티드에서만 표시 */}
      {connected && <SharedWithMe />}
      {connected && isAdmin && <AdminMenuLink />}
    </aside>
  );
}
```

### C-6. config.json server 블록 활성화

Phase A에서 placeholder로 넣어둔 server 블록을 실제로 사용합니다.

```json
"server": {
  "url": "https://192.168.1.100:8080",
  "autoConnect": true,
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
```

### C-7. IPC 채널 추가 등록

```typescript
// src/main/ipc/server.ipc.ts (신규 파일)
ipcMain.handle('server:connect', (_, url, id, pw) => serverConnection.login(url, id, pw));
ipcMain.handle('server:disconnect', () => serverConnection.logout());
ipcMain.handle('server:status', () => modeManager.getStatus());
ipcMain.handle('server:isConnected', () => modeManager.isConnected());
```

기존 IPC 파일들은 수정하지 않습니다.

---

## Phase D: 마무리 (2주)

### D-1. 웹 포탈 연동 테스트

- 앱에서 커밋 → 서버 웹 포탈에서 이력 확인
- 웹 포탈에서 미리보기 → 앱이 PDF 생성 → 서버 캐시 → 웹 표시
- 웹 포탈에서 공유 링크 생성 → 외부 사용자 접속 확인

### D-2. 오프라인 ↔ 커넥티드 전환 안정성

- 서버 끊김 → 자동 오프라인 전환 → 로컬 기능 정상 동작 확인
- 서버 복구 → 자동 재연결 → 미전송 메타데이터 일괄 push
- 앱 시작 시 서버 미응답 → 3초 타임아웃 → 오프라인으로 즉시 시작

### D-3. eager preview cache

- 커밋 후 변경 파일 미리보기 자동 생성 + 서버 push 테스트
- 50MB 이상 파일은 건너뛰기 확인
- push 실패 시 로컬에서 정상 동작 확인 (서버 캐시 없어도 앱은 작동)

### D-4. 관리자 화면 통합

- 앱에서 관리자 로그인 → 사이드바 "관리" 메뉴 표시 확인
- 대시보드 메트릭, 사용자 관리, 시스템 현황 API 호출 정상 확인

---

## 변경 파일 요약 — 전체 전환 작업

### 기존 파일 수정 (최소)

| 파일 | 변경 내용 | 변경량 |
|------|----------|:------:|
| `main.ts` | ModeManager 초기화 + docvault:// 프로토콜 등록 | +5줄 |
| `CommitService.ts` | sync hook 1줄 | +1줄 |
| `TagService.ts` | sync hook 1줄 | +1줄 |
| `ActivityService.ts` | sync hook 1줄 | +1줄 |
| `LockService.ts` | sync hook 1줄 | +1줄 |
| `ShareService.ts` | Strategy 패턴으로 분리 (기존 코드 → LocalShareStrategy) | 리팩토링 |
| `config.json` | server 블록 추가 | +10줄 |
| `Header.tsx` | 조건부 알림벨/아바타 추가 | +5줄 |
| `Sidebar.tsx` | 조건부 공유받은문서/관리 메뉴 추가 | +5줄 |
| `SettingsPage.tsx` | 서버 연결 섹션 추가 | +50줄 |

### 신규 파일 (server/ 폴더)

| 파일 | 용도 | 예상 코드량 |
|------|------|:----------:|
| `server/ModeManager.ts` | 오프라인/커넥티드 전환 | ~100줄 |
| `server/ServerConnectionService.ts` | JWT 로그인/토큰 | ~150줄 |
| `server/PresenceService.ts` | heartbeat | ~50줄 |
| `server/RepoSyncService.ts` | 커밋 메타 push | ~100줄 |
| `server/MetadataSyncService.ts` | 태그/활동 sync | ~100줄 |
| `server/FileProxyService.ts` | 파일 프록시 응답 | ~150줄 |
| `server/ServerShareService.ts` | 서버 공유 링크 | ~80줄 |
| `server/ServerInviteService.ts` | 초대 링크 | ~100줄 |
| `server/ServerNotificationService.ts` | 알림 수신 | ~80줄 |
| `server/ServerApprovalProxy.ts` | 승인 API 프록시 | ~100줄 |
| `server/ServerAdminProxy.ts` | 관리자 API 프록시 | ~80줄 |
| `ipc/server.ipc.ts` | 서버 관련 IPC | ~50줄 |
| `hooks/useMode.ts` | React 모드 훅 | ~20줄 |
| `components/connected/*.tsx` | 커넥티드 전용 UI (5~8개) | ~400줄 |

### 수치 요약

| 항목 | 수량 |
|------|:----:|
| 기존 파일 수정 | ~10개 (대부분 1~5줄) |
| 신규 파일 추가 | ~20개 |
| 신규 코드량 | ~1,600줄 |
| 기존 코드 삭제 | 0줄 |
| 기존 기능 동작 변경 | 0개 |

---

## 체크리스트 — 전환 완료 확인

### 오프라인 모드 (서버 연결 없이)

- [ ] 앱 시작 → 서버 URL 없음 → 즉시 오프라인 모드 → 기존과 동일한 동작
- [ ] 저장소 생성/삭제/설정 변경 정상
- [ ] 파일 업로드/커밋/이력/Diff 정상
- [ ] 3방향 드래그앤드롭 정상
- [ ] 더블클릭 편집 → 수정감지 → Pending Changes 바 정상
- [ ] 보호 잠금 ON/OFF 정상
- [ ] 로컬 공유 (zip/임시서버/클립보드) 정상
- [ ] 태그/즐겨찾기/휴지통 정상
- [ ] 검색 정상
- [ ] 설정 화면 정상 (서버 연결 섹션은 미연결 상태 표시)
- [ ] 헤더에 알림벨/사용자아바타 숨겨져 있음
- [ ] 사이드바에 공유받은문서/관리 메뉴 숨겨져 있음

### 커넥티드 모드 (서버 연결 상태)

- [ ] 서버 URL 입력 + 로그인 → 커넥티드 전환 → 헤더에 🟢 표시
- [ ] 헤더에 알림벨 + 사용자아바타 표시됨
- [ ] 사이드바에 개인/팀/공유 3공간 구조로 전환
- [ ] 커밋 후 서버에 메타데이터 도착 확인 (서버 DB)
- [ ] 커밋 후 미리보기 자동 생성 + 서버 push (eager cache)
- [ ] 웹 포탈에서 파일 트리/커밋 이력 조회 가능
- [ ] 웹 포탈에서 미리보기 표시 (캐시 또는 앱 프록시)
- [ ] 서버 공유 링크 생성 → 외부 접속 확인
- [ ] 승인 요청/처리 (서버 경유)
- [ ] 알림 수신 (공유/승인 이벤트)
- [ ] 관리자 로그인 → 관리 메뉴 접근 → 대시보드 표시

### 모드 전환 안정성

- [ ] 서버 갑자기 끊김 → 자동 오프라인 전환 → 로컬 기능 중단 없음
- [ ] 서버 복구 → 자동 재연결 → 미전송 데이터 push
- [ ] 앱 종료 시 서버에 오프라인 알림
- [ ] 수동 연결 해제 → 즉시 오프라인 전환

---

## 타임라인 요약

```
현재 ─── Phase A ─── Phase B ──────────────── Phase C ──── Phase D ── 완성
        (1주)        (6~8주, 별도 프로젝트)    (3~4주)      (2주)

Phase A: 로컬 버전 출시 (placeholder만 추가)     ← 지금 바로
Phase B: 서버 개발 (앱과 무관, 병렬 가능)        ← 별도 팀/시간
Phase C: 앱에 server/ 폴더 추가                  ← 서버 완성 후
Phase D: 통합 테스트 + 마무리                     ← 최종 확인

총 추가 개발: ~11~14주 (Phase B와 A는 병렬 가능)
기존 코드 수정: ~10개 파일, 대부분 1~5줄
```
