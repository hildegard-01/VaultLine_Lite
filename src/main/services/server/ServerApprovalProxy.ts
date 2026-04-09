/**
 * ServerApprovalProxy — 승인 API 프록시
 */

import { ServerConnectionService } from './ServerConnectionService'
import { modeManager } from './ModeManager'

export const ServerApprovalProxy = {
  async listApprovals(statusFilter?: string): Promise<any> {
    if (!modeManager.isConnected()) return { items: [], total: 0 }
    const client = ServerConnectionService.getClient()
    const res = await client.get('/approvals', { params: { status_filter: statusFilter } })
    return res.data
  },

  async createApproval(repoId: number, filePath: string, revision: number, message: string, reviewerIds: number[]): Promise<any> {
    if (!modeManager.isConnected()) throw new Error('서버에 연결되지 않았습니다.')
    const client = ServerConnectionService.getClient()
    const res = await client.post('/approvals', {
      repo_id: repoId, file_path: filePath, revision, message,
      reviewer_user_ids: reviewerIds,
    })
    return res.data
  },

  async approve(approvalId: number, comment?: string): Promise<any> {
    if (!modeManager.isConnected()) throw new Error('서버에 연결되지 않았습니다.')
    const client = ServerConnectionService.getClient()
    const res = await client.post(`/approvals/${approvalId}/approve`, { comment })
    return res.data
  },

  async reject(approvalId: number, comment?: string): Promise<any> {
    if (!modeManager.isConnected()) throw new Error('서버에 연결되지 않았습니다.')
    const client = ServerConnectionService.getClient()
    const res = await client.post(`/approvals/${approvalId}/reject`, { comment })
    return res.data
  },
}
