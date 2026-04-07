import { handleIpc } from './index'
import * as ShareService from '../services/ShareService'

/**
 * 로컬 공유 IPC 핸들러 (REQ-025, REQ-026)
 *
 * 채널:
 * - share:export        — ZIP 내보내기 패키지 생성
 * - share:start-server  — Express :9090 임시 서버 시작
 * - share:stop-server   — 임시 서버 중지
 * - share:server-status — 서버 상태 조회
 * - share:copy-clipboard — 공유 URL 반환 (클립보드는 Renderer에서 처리)
 */

export function registerShareHandlers(): void {
  // ZIP 내보내기 — 단일/다중 파일 지원
  handleIpc('share:export', async (args) => {
    const { repoId, path, paths } = args as { repoId: number; path: string; paths?: string[] }

    const { dialog, BrowserWindow } = require('electron')
    const { basename, extname } = require('path')

    const filePaths = paths && paths.length > 0 ? paths : [path]
    const defaultName = filePaths.length > 1
      ? `VaultLine_${filePaths.length}files`
      : basename(filePaths[0], extname(filePaths[0]))

    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showSaveDialog(win!, {
      title: 'ZIP 패키지 저장',
      defaultPath: `${defaultName}.zip`,
      filters: [{ name: 'ZIP 아카이브', extensions: ['zip'] }]
    })

    if (result.canceled || !result.filePath) {
      throw new Error('저장이 취소되었습니다.')
    }

    return ShareService.exportZipPackage(repoId, filePaths[0], result.filePath, filePaths.length > 1 ? filePaths : undefined)
  })

  // 임시 서버 시작
  handleIpc('share:start-server', async (args) => {
    const { repoId, path, paths, expiryMinutes, password, maxDownloads, port } = args as {
      repoId: number
      path: string
      paths?: string[]
      expiryMinutes?: number
      password?: string
      maxDownloads?: number
      port?: number
    }
    return ShareService.startTempServer(repoId, path, expiryMinutes, password, maxDownloads, port, paths)
  })

  // 임시 서버 중지
  handleIpc('share:stop-server', async () => {
    await ShareService.stopTempServer()
  })

  // 서버 상태 조회
  handleIpc('share:server-status', () => {
    return ShareService.getServerStatus()
  })

  // 공유 URL 반환 (Renderer에서 클립보드 복사)
  handleIpc('share:copy-clipboard', async (args) => {
    const { repoId, path } = args as { repoId: number; path: string }
    return ShareService.getShareUrl(repoId, path)
  })
}
