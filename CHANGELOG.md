# CHANGELOG

VaultLine Lite 변경 이력입니다. [Keep a Changelog](https://keepachangelog.com/ko/) 형식을 따릅니다.

---

## [Unreleased]

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
