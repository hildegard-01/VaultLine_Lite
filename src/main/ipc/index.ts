import { ipcMain } from 'electron'
import type { IpcResponse } from '@shared/types/ipc'

/**
 * IPC 핸들러 등록
 * 각 도메인별 핸들러를 등록하는 중앙 진입점
 */

// 공통 핸들러 래퍼: try-catch + IpcResponse 패턴
export function handleIpc<T>(
  channel: string,
  handler: (args: unknown) => Promise<T> | T
): void {
  ipcMain.handle(channel, async (_event, args) => {
    try {
      const data = await handler(args)
      return { success: true, data } as IpcResponse<T>
    } catch (error) {
      const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.'
      return { success: false, error: message } as IpcResponse<T>
    }
  })
}

export function registerIpcHandlers(): void {
  // 저장소 관리 (Phase 2)
  registerRepoHandlers()

  // 파일 탐색 (Phase 2)
  registerFileHandlers()

  // 커밋/이력/Diff (Phase 3)
  registerCommitHandlers()

  // 파일 관리 — CRUD + 복원 (Phase 4)
  registerFileManageHandlers()

  // 미리보기 (Phase 5)
  registerPreviewHandlers()

  // 검색 (Phase 5)
  registerSearchHandlers()

  // 태그 + 즐겨찾기 + 휴지통 (Phase 6)
  registerMetadataHandlers()

  // 보호 잠금 (Phase 8)
  registerLockHandlers()

  // 로컬 공유 (Phase 8)
  registerShareHandlers()

  // 파일 감시 + 드래그 내보내기 (Phase 9)
  registerWatcherHandlers()

  // 설정 + 백업 + 일괄 커밋 (Phase 10)
  registerSettingsHandlers()

  // svnserve + 공유 사용자 (Phase 11)
  registerSvnServeHandlers()

  // 초대 + 원격 저장소 (Phase 11)
  registerInvitationHandlers()

  // 동기화 + SVN 잠금 (Phase 11)
  registerSyncHandlers()

  // 서버 연동 (Phase C)
  registerServerHandlers()

  // 다이얼로그 — Electron 네이티브 파일 선택
  handleIpc('dialog:open-file', async () => {
    const { dialog, BrowserWindow } = require('electron')
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile', 'multiSelections'],
      title: '업로드할 파일 선택'
    })
    return result.canceled ? [] : result.filePaths
  })

  handleIpc('dialog:open-folder', async () => {
    const { dialog, BrowserWindow } = require('electron')
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory'],
      title: '폴더 선택'
    })
    return result.canceled ? null : result.filePaths[0]
  })

  // 앱 정보
  handleIpc('settings:app-info', () => {
    return {
      version: require('../../package.json').version,
      electron: process.versions.electron,
      node: process.versions.node
    }
  })
}

// 지연 import (순환 참조 방지)
import { registerRepoHandlers } from './repo.ipc'
import { registerFileHandlers } from './file.ipc'
import { registerCommitHandlers } from './commit.ipc'
import { registerFileManageHandlers } from './file-manage.ipc'
import { registerPreviewHandlers } from './preview.ipc'
import { registerSearchHandlers } from './search.ipc'
import { registerMetadataHandlers } from './metadata.ipc'
import { registerLockHandlers } from './lock.ipc'
import { registerShareHandlers } from './share.ipc'
import { registerWatcherHandlers } from './watcher.ipc'
import { registerSettingsHandlers } from './settings.ipc'
import { registerSvnServeHandlers } from './svnserve.ipc'
import { registerInvitationHandlers } from './invitation.ipc'
import { registerSyncHandlers } from './sync.ipc'
import { registerServerHandlers } from './server.ipc'
