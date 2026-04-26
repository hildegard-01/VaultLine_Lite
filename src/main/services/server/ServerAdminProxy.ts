/**
 * ServerAdminProxy — 관리자 API 프록시
 */

import { ServerConnectionService } from './ServerConnectionService'
import { modeManager } from './ModeManager'

function requireConnected() {
  if (!modeManager.isConnected()) throw new Error('서버에 연결되지 않았습니다.')
  return ServerConnectionService.getClient()
}

export const ServerAdminProxy = {
  /* ──────────── 대시보드 / 시스템 ──────────── */

  async getDashboard(): Promise<any> {
    const client = requireConnected()
    const res = await client.get('/admin/dashboard')
    return res.data
  },

  async getSystemStatus(): Promise<any> {
    const client = requireConnected()
    const res = await client.get('/admin/system')
    return res.data
  },

  async getOnlineUsers(): Promise<any[]> {
    if (!modeManager.isConnected()) return []
    const client = ServerConnectionService.getClient()
    const res = await client.get('/admin/online-users')
    return res.data
  },

  /* ──────────── 사용자 관리 ──────────── */

  async listUsers(skip = 0, limit = 100, search?: string): Promise<{ items: any[]; total: number }> {
    const client = requireConnected()
    const params: Record<string, any> = { skip, limit }
    if (search) params.search = search
    const res = await client.get('/users', { params })
    return res.data
  },

  async createUser(body: {
    username: string
    password: string
    display_name?: string
    email?: string
    role?: string
  }): Promise<any> {
    const client = requireConnected()
    const res = await client.post('/users', body)
    return res.data
  },

  async updateUser(userId: number, body: {
    display_name?: string
    email?: string
    role?: string
    status?: string
  }): Promise<any> {
    const client = requireConnected()
    const res = await client.put(`/users/${userId}`, body)
    return res.data
  },

  async deleteUser(userId: number): Promise<void> {
    const client = requireConnected()
    await client.delete(`/users/${userId}`)
  },

  async resetPassword(userId: number): Promise<{ temp_password: string }> {
    const client = requireConnected()
    const res = await client.post(`/users/${userId}/password-reset`)
    return res.data
  },

  async forceLogout(userId: number): Promise<void> {
    const client = requireConnected()
    await client.post(`/admin/users/${userId}/force-logout`)
  },

  /* ──────────── 공유 관리 (관리자 전용) ──────────── */

  async listAllShares(skip = 0, limit = 100): Promise<{ items: any[]; total: number }> {
    const client = requireConnected()
    const res = await client.get('/admin/shares', { params: { skip, limit } })
    return res.data
  },

  async forceDeleteShare(shareId: number): Promise<void> {
    const client = requireConnected()
    await client.delete(`/admin/shares/${shareId}`)
  },
}
