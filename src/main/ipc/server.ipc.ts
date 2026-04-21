/**
 * 서버 관련 IPC 핸들러 (4개 채널)
 * server:connect, server:disconnect, server:status, server:isConnected
 */

import { handleIpc } from './index'
import { modeManager } from '../services/server/ModeManager'
import { ServerConnectionService } from '../services/server/ServerConnectionService'
import { RepoSyncService } from '../services/server/RepoSyncService'

export function registerServerHandlers(): void {
  // 서버 연결
  handleIpc('server:connect', async (args: unknown) => {
    const { url, username, password } = args as { url: string; username: string; password: string }
    const success = await modeManager.connect(url, username, password)
    if (success) {
      // 큐에 쌓인 동기화 데이터 일괄 push
      await RepoSyncService.flushQueue()
    }
    return {
      connected: success,
      mode: modeManager.getMode(),
      user: success ? ServerConnectionService.getUserInfo() : null,
    }
  })

  // 서버 연결 해제
  handleIpc('server:disconnect', async () => {
    await modeManager.disconnect()
    return { mode: 'offline' }
  })

  // 서버 상태 조회
  handleIpc('server:status', () => {
    return {
      mode: modeManager.getMode(),
      connected: modeManager.isConnected(),
      serverUrl: modeManager.getServerUrl(),
      user: modeManager.isConnected() ? ServerConnectionService.getUserInfo() : null,
    }
  })

  // 커넥티드 여부
  handleIpc('server:isConnected', () => {
    return modeManager.isConnected()
  })
}
