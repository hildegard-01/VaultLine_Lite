/**
 * ServerShareService — 서버 공유 링크 프록시
 */

import { ServerConnectionService } from './ServerConnectionService'
import { modeManager } from './ModeManager'

export const ServerShareService = {
  async createShare(repoId: number, filePath: string | null, permission: string, recipientIds: number[]): Promise<any> {
    if (!modeManager.isConnected()) throw new Error('서버에 연결되지 않았습니다.')
    const client = ServerConnectionService.getClient()
    const res = await client.post('/shares', {
      repo_id: repoId, file_path: filePath, permission,
      recipient_user_ids: recipientIds,
    })
    return res.data
  },

  async listShares(): Promise<any[]> {
    if (!modeManager.isConnected()) return []
    const client = ServerConnectionService.getClient()
    const res = await client.get('/shares')
    return res.data.items
  },

  async deleteShare(shareId: number): Promise<void> {
    if (!modeManager.isConnected()) return
    const client = ServerConnectionService.getClient()
    await client.delete(`/shares/${shareId}`)
  },
}
