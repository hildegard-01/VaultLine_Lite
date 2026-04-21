/**
 * ModeManager — 오프라인/커넥티드 모드 전환 핵심
 *
 * 역할: 서버 연결 상태를 관리하고 모드를 전환합니다.
 *       연결 실패 시 자동 폴백(오프라인) + 주기적 재시도.
 * 구성: ModeManager 싱글턴 / initialize() / connect() / disconnect() / isConnected()
 */

import { BrowserWindow } from 'electron'
import log from 'electron-log'
import { ServerConnectionService } from './ServerConnectionService'
import { PresenceService } from './PresenceService'

export type AppMode = 'offline' | 'connected'

interface ServerConfig {
  url: string
  autoConnect: boolean
  retryIntervalSec: number
}

class ModeManager {
  private mode: AppMode = 'offline'
  private serverUrl = ''
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private retryIntervalMs = 30000

  /** 현재 모드 반환 */
  getMode(): AppMode {
    return this.mode
  }

  /** 커넥티드 여부 */
  isConnected(): boolean {
    return this.mode === 'connected'
  }

  /** 서버 URL */
  getServerUrl(): string {
    return this.serverUrl
  }

  /** 초기화 — config.json에서 서버 설정 로드 */
  async initialize(config: ServerConfig): Promise<void> {
    this.serverUrl = config.url || ''
    this.retryIntervalMs = (config.retryIntervalSec || 30) * 1000

    if (!this.serverUrl) {
      log.info('[ModeManager] 서버 URL 미설정 → 오프라인 모드')
      this.setMode('offline')
      return
    }

    if (config.autoConnect) {
      await this.connect()
    }
  }

  /** 서버 연결 시도 */
  async connect(url?: string, username?: string, password?: string): Promise<boolean> {
    if (url) this.serverUrl = url
    if (!this.serverUrl) return false

    this.clearRetry()

    try {
      // 서버 health 확인 (3초 타임아웃)
      const healthy = await ServerConnectionService.healthCheck(this.serverUrl)
      if (!healthy) {
        log.warn('[ModeManager] 서버 응답 없음 → 오프라인 유지')
        this.setMode('offline')
        this.scheduleRetry()
        return false
      }

      // 로그인 (username/password 제공 시)
      if (username && password) {
        const success = await ServerConnectionService.login(this.serverUrl, username, password)
        if (!success) {
          log.warn('[ModeManager] 로그인 실패')
          return false
        }
      }

      // 연결 성공
      this.setMode('connected')
      log.info('[ModeManager] 커넥티드 모드 전환 완료')

      // Presence 온라인 알림
      PresenceService.start(this.serverUrl)

      return true
    } catch (err) {
      log.error('[ModeManager] 연결 실패:', err)
      this.setMode('offline')
      this.scheduleRetry()
      return false
    }
  }

  /** 서버 연결 해제 */
  async disconnect(): Promise<void> {
    this.clearRetry()

    try {
      PresenceService.stop()
      await ServerConnectionService.logout()
    } catch { /* 무시 */ }

    this.setMode('offline')
    log.info('[ModeManager] 오프라인 모드 전환')
  }

  /** 재시도 예약 */
  private scheduleRetry(): void {
    if (this.retryTimer) return
    this.retryTimer = setTimeout(async () => {
      this.retryTimer = null
      log.info('[ModeManager] 서버 재연결 시도...')
      await this.connect()
    }, this.retryIntervalMs)
  }

  /** 재시도 취소 */
  private clearRetry(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
  }

  /** 모드 변경 + Renderer에 알림 */
  private setMode(newMode: AppMode): void {
    const changed = this.mode !== newMode
    this.mode = newMode

    if (changed) {
      // 모든 BrowserWindow에 모드 변경 알림
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('server:mode-changed', { mode: newMode })
      }
    }
  }

  /** 정리 (앱 종료 시) */
  async cleanup(): Promise<void> {
    this.clearRetry()
    if (this.isConnected()) {
      try {
        PresenceService.stop()
        await ServerConnectionService.logout()
      } catch { /* 무시 */ }
    }
  }
}

/** 싱글턴 */
export const modeManager = new ModeManager()
