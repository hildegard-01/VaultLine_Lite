import { handleIpc } from './index'
import * as ShareService from '../services/ShareService'
import { getDatabase } from '../services/DatabaseService'
import { createHash } from 'crypto'

/**
 * 로컬 공유 IPC 핸들러 (REQ-025, REQ-026)
 *
 * 채널:
 * - share:export        — ZIP 내보내기 패키지 생성
 * - share:start-server  — 새 링크 추가 (서버 자동 시작)
 * - share:stop-server   — 전체 서버 중지 + 모든 링크 비활성화
 * - share:server-status — 서버 상태 조회
 * - share:copy-clipboard — 공유 URL 반환 (클립보드는 Renderer에서 처리)
 * - share:link-list     — 활성 링크 목록 조회
 * - share:list          — 서버 공유 링크 목록 (server 타입)
 * - share:revoke        — 링크 비활성화 (server/link 공통)
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

  // 새 공유 링크 추가 (서버 없으면 자동 시작)
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
    return ShareService.addShareLink(repoId, path, expiryMinutes, password, maxDownloads, port, paths)
  })

  // 서버만 재시작 (링크 생성 없이 기존 활성 링크 서빙)
  handleIpc('share:restart-server', async () => {
    return ShareService.restartServer()
  })

  // 전체 서버 중지 + 모든 링크 비활성화
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

  // 활성 로컬 링크 목록 (link 타입)
  handleIpc('share:link-list', () => {
    return ShareService.getActiveLinks()
  })

  // 서버 공유 링크 목록 (server 타입 — 커넥티드 모드)
  handleIpc('share:list', () => {
    const db = getDatabase()
    return db.prepare(`
      SELECT s.id, s.repo_id, s.file_path, s.share_type, s.token,
             s.expires_at, s.is_active, s.access_count, s.created_at,
             r.name AS repo_name
      FROM shares s
      LEFT JOIN repositories r ON r.id = s.repo_id
      WHERE s.is_active = 1 AND s.share_type = 'server'
      ORDER BY s.created_at DESC
    `).all()
  })

  // 링크 만료일시 / 비밀번호 수정
  handleIpc('share:link-update', (args) => {
    const { id, expiresAt, password, clearPassword } = args as {
      id: number
      expiresAt?: string
      password?: string
      clearPassword?: boolean
    }
    const db = getDatabase()

    if (expiresAt !== undefined) {
      db.prepare('UPDATE shares SET expires_at = ? WHERE id = ?').run(expiresAt || null, id)
    }
    if (clearPassword) {
      db.prepare('UPDATE shares SET password_hash = NULL WHERE id = ?').run(id)
    } else if (password) {
      const hash = createHash('sha256').update(password).digest('hex')
      db.prepare('UPDATE shares SET password_hash = ? WHERE id = ?').run(hash, id)
    }

    // 업데이트된 링크 정보 반환 (활성 링크 목록에서 조회)
    const updated = ShareService.getActiveLinks().find(l => l.id === id)
    if (!updated) throw new Error('링크를 찾을 수 없습니다.')
    return updated
  })

  // 링크 비활성화 — 활성 링크가 없으면 서버 자동 중지
  handleIpc('share:revoke', async (args) => {
    const { id } = args as { id: number }
    const db = getDatabase()
    db.prepare('UPDATE shares SET is_active = 0 WHERE id = ?').run(id)
    await ShareService.stopServerIfEmpty()
    return { id }
  })
}
