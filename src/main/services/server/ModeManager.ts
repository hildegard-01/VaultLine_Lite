import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { SERVER_RETRY_INTERVAL_MS } from '@shared/constants'

/**
 * ModeManager — 오프라인/커넥티드 모드 전환 관리
 *
 * 역할:
 * - config.json server.url 유무로 초기 모드 결정
 * - 연결 성공 시 커넥티드 모드, 실패 시 오프라인 유지 + 자동 재시도
 * - 모든 서버 서비스가 이 모듈의 isConnected()를 기준으로 동작 분기
 *
 * 구성:
 * - AppMode 타입
 * - initialize(): 앱 시작 시 1회 호출
 * - isConnected(): 현재 모드 boolean 반환
 * - getStatus(): 현재 상태 상세 반환
 * - setConnected(user): 로그인 성공 후 커넥티드 모드 전환
 * - setOffline(): 연결 해제 / 오류 시 오프라인 전환
 * - scheduleRetry(): 서버 재연결 주기적 시도 예약
 */

export type AppMode = 'offline' | 'connected'

export interface ServerConfig {
  url: string
  autoConnect: boolean
  retryIntervalSec: number
  heartbeatIntervalSec: number
  sync: {
    pushCommitMeta: boolean
    pushPreviewOnCommit: boolean
    previewPushMaxSizeMB: number
    previewPushFormats: string[]
    allowFileProxy: boolean
  }
}

export interface ConnectedUser {
  id: number
  username: string
  role: string
}

export interface ModeStatus {
  mode: AppMode
  serverUrl: string | null
  user: ConnectedUser | null
  retryScheduled: boolean
}

// 싱글턴 상태
let _mode: AppMode = 'offline'
let _serverUrl: string | null = null
let _user: ConnectedUser | null = null
let _retryTimer: ReturnType<typeof setTimeout> | null = null
let _initialized = false
let _serverConfig: ServerConfig | null = null

/** config.json 파일 로드 */
function loadServerConfig(): ServerConfig | null {
  try {
    // 개발: 프로젝트 루트 / 프로덕션: resources 폴더
    const configPath = app.isPackaged
      ? join(process.resourcesPath, 'config.json')
      : join(app.getAppPath(), 'config.json')

    if (!existsSync(configPath)) return null

    const raw = readFileSync(configPath, 'utf-8')
    const parsed = JSON.parse(raw)
    return parsed.server ?? null
  } catch {
    return null
  }
}

/**
 * 초기화 — 앱 시작 시 1회 호출
 * config.json을 읽어 서버 URL이 있으면 커넥티드 시도 여부를 반환
 * 실제 연결은 ServerConnectionService.autoConnect()가 담당
 */
export function initialize(): { shouldAutoConnect: boolean; serverUrl: string | null } {
  if (_initialized) return { shouldAutoConnect: false, serverUrl: _serverUrl }

  _initialized = true
  _serverConfig = loadServerConfig()

  if (!_serverConfig || !_serverConfig.url) {
    // server.url 없음 → 오프라인 모드
    _mode = 'offline'
    return { shouldAutoConnect: false, serverUrl: null }
  }

  _serverUrl = _serverConfig.url
  return {
    shouldAutoConnect: _serverConfig.autoConnect,
    serverUrl: _serverConfig.url
  }
}

/** 커넥티드 모드로 전환 (로그인 성공 후 호출) */
export function setConnected(user: ConnectedUser, serverUrl: string): void {
  _mode = 'connected'
  _user = user
  _serverUrl = serverUrl
  _cancelRetry()
}

/** 오프라인 모드로 전환 (연결 해제 / 오류 시 호출) */
export function setOffline(): void {
  _mode = 'offline'
  _user = null
}

/** 현재 커넥티드 모드 여부 */
export function isConnected(): boolean {
  return _mode === 'connected'
}

/** 현재 상태 상세 반환 */
export function getStatus(): ModeStatus {
  return {
    mode: _mode,
    serverUrl: _serverUrl,
    user: _user,
    retryScheduled: _retryTimer !== null
  }
}

/** 서버 config 반환 */
export function getServerConfig(): ServerConfig | null {
  return _serverConfig
}

/** 현재 접속 중인 사용자 반환 */
export function getCurrentUser(): ConnectedUser | null {
  return _user
}

/**
 * 재연결 예약 — 오프라인 전환 시 자동 재시도 스케줄
 * onRetry 콜백이 true를 반환하면 재시도 성공으로 간주하고 타이머 종료
 */
export function scheduleRetry(onRetry: () => Promise<boolean>): void {
  _cancelRetry()

  const intervalMs = _serverConfig?.retryIntervalSec
    ? _serverConfig.retryIntervalSec * 1_000
    : SERVER_RETRY_INTERVAL_MS

  const attempt = async (): Promise<void> => {
    if (_mode === 'connected') return // 이미 연결됨

    try {
      const success = await onRetry()
      if (!success) {
        _retryTimer = setTimeout(attempt, intervalMs)
      } else {
        _retryTimer = null
      }
    } catch {
      _retryTimer = setTimeout(attempt, intervalMs)
    }
  }

  _retryTimer = setTimeout(attempt, intervalMs)
}

/** 재연결 타이머 취소 */
function _cancelRetry(): void {
  if (_retryTimer !== null) {
    clearTimeout(_retryTimer)
    _retryTimer = null
  }
}

/** 앱 종료 시 정리 */
export function cleanup(): void {
  _cancelRetry()
  _mode = 'offline'
  _user = null
}
