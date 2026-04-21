/**
 * ServerInviteService — 서버 초대 링크 프록시
 */

import { ServerConnectionService } from './ServerConnectionService'
import { modeManager } from './ModeManager'

export const ServerInviteService = {
  /** 서버 기반 초대 링크 생성 */
  async createInvite(repoId: number, permission: string, expiresHours: number): Promise<{ shareToken: string; url: string }> {
    if (!modeManager.isConnected()) throw new Error('서버에 연결되지 않았습니다.')
    const client = ServerConnectionService.getClient()
    const expires = new Date(Date.now() + expiresHours * 3600000).toISOString()
    const res = await client.post('/shares', {
      repo_id: repoId, permission, expires_at: expires,
    })
    const baseUrl = ServerConnectionService.getBaseUrl()
    return {
      shareToken: res.data.share_token,
      url: `${baseUrl}/public/${res.data.share_token}`,
    }
  },
}
