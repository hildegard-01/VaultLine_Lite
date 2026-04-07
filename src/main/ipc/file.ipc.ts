import { shell } from 'electron'
import { join } from 'path'
import { handleIpc } from './index'
import * as FileService from '../services/FileService'
import { startWatching } from '../services/FileWatcherService'
import { getLockStatus } from '../services/LockService'
import { getDatabase } from '../services/DatabaseService'
import type { FileListRequest } from '@shared/types/ipc'

/**
 * 파일 탐색 IPC 핸들러
 * file:list, file:info, file:blame, file:open-external
 */

export function registerFileHandlers(): void {
  // 파일/폴더 목록
  handleIpc('file:list', async (args: unknown) => {
    const req = args as FileListRequest
    return await FileService.listFiles(req)
  })

  // 파일 상세 정보
  handleIpc('file:info', async (args: unknown) => {
    const { repoId, path } = args as { repoId: number; path: string }
    return await FileService.getFileInfo(repoId, path)
  })

  // blame
  handleIpc('file:blame', async (args: unknown) => {
    const { repoId, path } = args as { repoId: number; path: string }
    return await FileService.getBlame(repoId, path)
  })

  // OS 기본 앱으로 열기 + 파일 감시 시작 (REQ-007)
  handleIpc('file:open-external', async (args: unknown) => {
    const { repoId, path } = args as { repoId: number; path: string }
    const db = getDatabase()
    const repo = db.prepare('SELECT wc_path as wcPath FROM repositories WHERE id = ?').get(repoId) as { wcPath: string } | undefined
    if (!repo) throw new Error('저장소를 찾을 수 없습니다.')
    const fullPath = join(repo.wcPath, path)

    const lockInfo = getLockStatus(repoId, path)

    if (lockInfo?.locked) {
      // 보호잠금 파일: 읽기 전용으로 설정 후 열기
      const { chmodSync, statSync } = require('fs')
      try {
        const stat = statSync(fullPath)
        if (stat.mode & 0o200) {
          // 쓰기 권한 제거
          chmodSync(fullPath, stat.mode & ~0o222)
        }
      } catch { /* 무시 */ }

      // 잠금 사유 반환 (Renderer에서 알림 표시용)
      await shell.openPath(fullPath)
      return { locked: true, reason: lockInfo.reason }
    }

    await shell.openPath(fullPath)

    // 잠기지 않은 파일만 변경 감시 시작
    startWatching(repoId, path)
    return { locked: false }
  })
}
