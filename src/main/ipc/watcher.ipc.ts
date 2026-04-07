import { handleIpc } from './index'
import * as FileWatcherService from '../services/FileWatcherService'
import * as DragDropService from '../services/DragDropService'

/**
 * 파일 감시 + 드래그 내보내기 IPC 핸들러 (Phase 9)
 *
 * 채널:
 * - watcher:pending         — Pending Changes 목록 조회
 * - watcher:commit-selected — 선택 파일 커밋
 * - watcher:discard         — 선택 파일 변경 폐기
 * - watcher:has-pending     — 미커밋 변경 여부
 * - file:drag-export        — 드래그 내보내기용 임시 파일 경로
 */

export function registerWatcherHandlers(): void {
  // Pending Changes 목록
  handleIpc('watcher:pending', () => {
    return FileWatcherService.getPendingList()
  })

  // 선택 파일 커밋
  handleIpc('watcher:commit-selected', async (args) => {
    const { repoId, filePaths, commitMessage } = args as {
      repoId: number
      filePaths: string[]
      commitMessage: string
    }
    return FileWatcherService.commitPendingFiles(repoId, filePaths, commitMessage)
  })

  // 선택 파일 변경 폐기
  handleIpc('watcher:discard', async (args) => {
    const { repoId, filePaths } = args as {
      repoId: number
      filePaths: string[]
    }
    await FileWatcherService.discardPendingFiles(repoId, filePaths)
  })

  // 미커밋 변경 여부
  handleIpc('watcher:has-pending', () => {
    return FileWatcherService.hasPendingChanges()
  })

  // 드래그 내보내기용 임시 파일 생성
  handleIpc('file:drag-export', (args) => {
    const { repoId, path } = args as { repoId: number; path: string }
    return DragDropService.prepareDragExport(repoId, path)
  })
}
