/**
 * PresenceService — heartbeat (60초 간격)
 *
 * 역할: 서버에 주기적으로 온라인 상태를 알립니다.
 */

import log from 'electron-log'
import { ServerConnectionService } from './ServerConnectionService'

let heartbeatTimer: ReturnType<typeof setInterval> | null = null

export const PresenceService = {
  /** heartbeat 시작 */
  start(_serverUrl?: string): void {
    this.stop()

    // 즉시 온라인 알림
    this.sendOnline()

    // 60초 간격 heartbeat
    heartbeatTimer = setInterval(() => {
      this.sendHeartbeat()
    }, 60000)

    log.info('[Presence] heartbeat 시작 (60초 간격)')
  },

  /** heartbeat 중지 + 오프라인 알림 */
  stop(): void {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
    this.sendOffline()
  },

  async sendHeartbeat(): Promise<void> {
    try {
      const client = ServerConnectionService.getClient()
      await client.post('/presence/heartbeat')
    } catch (err) {
      log.warn('[Presence] heartbeat 실패:', (err as Error).message)
    }
  },

  async sendOnline(): Promise<void> {
    try {
      const client = ServerConnectionService.getClient()
      await client.post('/presence/online')
    } catch { /* 무시 */ }
  },

  async sendOffline(): Promise<void> {
    try {
      const client = ServerConnectionService.getClient()
      await client.post('/presence/offline')
    } catch { /* 무시 */ }
  },
}
