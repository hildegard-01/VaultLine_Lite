import { handleIpc } from './index'
import * as SyncService from '../services/SyncService'
import * as SvnLockService from '../services/SvnLockService'

/**
 * 동기화 + SVN 잠금 IPC 핸들러 (Phase 11.3)
 */

export function registerSyncHandlers(): void {
  // svn update 동기화
  handleIpc('sync:update', async (args) => {
    const { remoteRepoId } = args as { remoteRepoId: number }
    return SyncService.update(remoteRepoId)
  })

  // 충돌 해결
  handleIpc('sync:resolve-conflict', async (args) => {
    const { remoteRepoId, filePath, resolution } = args as {
      remoteRepoId: number; filePath: string; resolution: 'mine' | 'theirs'
    }
    await SyncService.resolveConflict(remoteRepoId, filePath, resolution)
  })

  // SVN 잠금
  handleIpc('svn-lock:lock', async (args) => {
    const { repoId, repoType, path, comment } = args as {
      repoId: number; repoType: 'local' | 'remote'; path: string; comment?: string
    }
    await SvnLockService.lock(repoId, repoType, path, comment)
  })

  // SVN 잠금 해제
  handleIpc('svn-lock:unlock', async (args) => {
    const { repoId, repoType, path } = args as {
      repoId: number; repoType: 'local' | 'remote'; path: string
    }
    await SvnLockService.unlock(repoId, repoType, path)
  })

  // SVN 잠금 목록
  handleIpc('svn-lock:list', (args) => {
    const { repoId, repoType } = args as { repoId: number; repoType: 'local' | 'remote' }
    return SvnLockService.listLocks(repoId, repoType)
  })
}
