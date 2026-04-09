/**
 * ServerAdminProxy — 관리자 API 프록시
 */

import { ServerConnectionService } from './ServerConnectionService'
import { modeManager } from './ModeManager'

export const ServerAdminProxy = {
  async getDashboard(): Promise<any> {
    if (!modeManager.isConnected()) throw new Error('서버에 연결되지 않았습니다.')
    const client = ServerConnectionService.getClient()
    const res = await client.get('/admin/dashboard')
    return res.data
  },

  async getSystemStatus(): Promise<any> {
    if (!modeManager.isConnected()) throw new Error('서버에 연결되지 않았습니다.')
    const client = ServerConnectionService.getClient()
    const res = await client.get('/admin/system')
    return res.data
  },

  async getOnlineUsers(): Promise<any[]> {
    if (!modeManager.isConnected()) return []
    const client = ServerConnectionService.getClient()
    const res = await client.get('/admin/online-users')
    return res.data
  },

  async forceLogout(userId: number): Promise<void> {
    if (!modeManager.isConnected()) return
    const client = ServerConnectionService.getClient()
    await client.post(`/admin/users/${userId}/force-logout`)
  },
}
