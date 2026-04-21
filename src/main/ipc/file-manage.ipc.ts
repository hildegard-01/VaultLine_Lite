import { handleIpc } from './index'
import * as FileManageService from '../services/FileManageService'

/**
 * 파일 관리 IPC 핸들러 (6개 채널)
 * file:mkdir, file:rename, file:move, file:delete, file:restore-version, file:restore-deleted
 */

export function registerFileManageHandlers(): void {
  // 폴더 생성
  handleIpc('file:mkdir', async (args: unknown) => {
    const { repoId, path, commitMessage } = args as { repoId: number; path: string; commitMessage: string }
    await FileManageService.createFolder(repoId, path, commitMessage)
  })

  // 이름 변경
  handleIpc('file:rename', async (args: unknown) => {
    const { repoId, oldPath, newName, commitMessage } = args as {
      repoId: number; oldPath: string; newName: string; commitMessage: string
    }
    await FileManageService.renameFile(repoId, oldPath, newName, commitMessage)
  })

  // 이동
  handleIpc('file:move', async (args: unknown) => {
    const { repoId, srcPath, destPath, commitMessage } = args as {
      repoId: number; srcPath: string; destPath: string; commitMessage: string
    }
    await FileManageService.moveFile(repoId, srcPath, destPath, commitMessage)
  })

  // 삭제
  handleIpc('file:delete', async (args: unknown) => {
    const { repoId, path, commitMessage } = args as { repoId: number; path: string; commitMessage: string }
    await FileManageService.deleteFile(repoId, path, commitMessage)
  })

  // 이전 버전 복원
  handleIpc('file:restore-version', async (args: unknown) => {
    const { repoId, path, targetRevision, commitMessage } = args as {
      repoId: number; path: string; targetRevision: number; commitMessage: string
    }
    return await FileManageService.restoreVersion(repoId, path, targetRevision, commitMessage)
  })

  // 삭제된 파일 복원 (휴지통)
  handleIpc('file:restore-deleted', async (args: unknown) => {
    const { repoId, trashItemId, commitMessage } = args as {
      repoId: number; trashItemId: number; commitMessage: string
    }
    return await FileManageService.restoreDeleted(repoId, trashItemId, commitMessage)
  })

  // 일괄 이동 (같은 저장소 내)
  handleIpc('file:bulk-move', async (args: unknown) => {
    const { repoId, srcPaths, destFolder, commitMessage } = args as {
      repoId: number; srcPaths: string[]; destFolder: string; commitMessage: string
    }
    return await FileManageService.bulkMove(repoId, srcPaths, destFolder, commitMessage)
  })

  // 저장소 간 이동
  handleIpc('file:cross-repo-move', async (args: unknown) => {
    const { srcRepoId, destRepoId, srcPaths, destFolder, commitMessage } = args as {
      srcRepoId: number; destRepoId: number; srcPaths: string[]; destFolder: string; commitMessage: string
    }
    return await FileManageService.crossRepoMove(srcRepoId, destRepoId, srcPaths, destFolder, commitMessage)
  })
}
