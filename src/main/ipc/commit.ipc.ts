import { handleIpc } from './index'
import * as CommitService from '../services/CommitService'
import type { CommitLogRequest, DiffRequest, FileUploadRequest } from '@shared/types/ipc'

/**
 * 커밋/이력/Diff IPC 핸들러 (5개 채널)
 * file:upload, file:upload-version, commit:log, commit:diff, commit:discard
 */

export function registerCommitHandlers(): void {
  // 파일 업로드 + 커밋
  handleIpc('file:upload', async (args: unknown) => {
    const req = args as FileUploadRequest
    return await CommitService.uploadAndCommit(
      req.repoId,
      req.targetPath,
      req.filePaths,
      req.commitMessage
    )
  })

  // 새 버전 업로드
  handleIpc('file:upload-version', async (args: unknown) => {
    const { repoId, filePath, srcPath, commitMessage } = args as {
      repoId: number
      filePath: string
      srcPath: string
      commitMessage: string
    }
    return await CommitService.uploadNewVersion(repoId, filePath, srcPath, commitMessage)
  })

  // 커밋 이력 조회
  handleIpc('commit:log', async (args: unknown) => {
    const req = args as CommitLogRequest
    return await CommitService.getCommitLog(req)
  })

  // Diff 조회
  handleIpc('commit:diff', async (args: unknown) => {
    const req = args as DiffRequest
    return await CommitService.getDiff(req.repoId, req.path, req.rev1, req.rev2)
  })

  // 변경 되돌리기
  handleIpc('commit:discard', async (args: unknown) => {
    const { repoId, path } = args as { repoId: number; path?: string }
    await CommitService.discardChanges(repoId, path)
  })
}
