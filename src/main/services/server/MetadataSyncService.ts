/**
 * MetadataSyncService — 태그/활동 로그 서버 동기화
 *
 * 역할: 로컬 태그 변경 시 서버에 push, 서버 태그를 로컬에 반영.
 */

import log from 'electron-log'
import { ServerConnectionService } from './ServerConnectionService'
import { modeManager } from './ModeManager'

export const MetadataSyncService = {
  /** 태그 부착 push */
  async pushTagAttach(repoId: number, filePath: string, tagId: number): Promise<void> {
    if (!modeManager.isConnected()) return
    try {
      const client = ServerConnectionService.getClient()
      await client.post('/tags/attach', { repo_id: repoId, file_path: filePath, tag_id: tagId })
    } catch (err) {
      log.warn('[MetadataSync] 태그 부착 push 실패:', (err as Error).message)
    }
  },

  /** 태그 해제 push */
  async pushTagDetach(repoId: number, filePath: string, tagId: number): Promise<void> {
    if (!modeManager.isConnected()) return
    try {
      const client = ServerConnectionService.getClient()
      await client.delete('/tags/detach', { params: { repo_id: repoId, file_path: filePath, tag_id: tagId } })
    } catch (err) {
      log.warn('[MetadataSync] 태그 해제 push 실패:', (err as Error).message)
    }
  },

  /** 활동 로그 push (향후 확장용 — 서버 activity_log는 API 호출 시 자동 기록) */
  async pushActivity(_action: string, _detail: string): Promise<void> {
    if (!modeManager.isConnected()) return
  },
}
