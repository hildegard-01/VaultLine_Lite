/**
 * ServerNotificationService — 서버 알림 수신/관리
 */

import { ServerConnectionService } from './ServerConnectionService'
import { modeManager } from './ModeManager'

export const ServerNotificationService = {
  async getNotifications(limit = 50): Promise<any[]> {
    if (!modeManager.isConnected()) return []
    const client = ServerConnectionService.getClient()
    const res = await client.get('/notifications', { params: { limit } })
    return res.data
  },

  async getUnreadCount(): Promise<number> {
    if (!modeManager.isConnected()) return 0
    const client = ServerConnectionService.getClient()
    const res = await client.get('/notifications/unread-count')
    return res.data.unread_count
  },

  async markRead(notifId: number): Promise<void> {
    if (!modeManager.isConnected()) return
    const client = ServerConnectionService.getClient()
    await client.put(`/notifications/${notifId}/read`)
  },

  async markAllRead(): Promise<void> {
    if (!modeManager.isConnected()) return
    const client = ServerConnectionService.getClient()
    await client.put('/notifications/read-all')
  },
}
