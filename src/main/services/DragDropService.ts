import { join, basename } from 'path'
import { copyFileSync, existsSync, mkdirSync } from 'fs'
import { app } from 'electron'
import { getDatabase } from './DatabaseService'
import type { Repository } from '@shared/types/ipc'

/**
 * DragDropService — 드래그 내보내기 (REQ-014)
 *
 * 역할:
 * - 앱 → 외부 드래그 시 .svn 메타데이터 없는 클린 파일을 임시 경로에 복사
 * - Electron webContents.startDrag()에 전달할 경로 제공
 */

/** 저장소 조회 */
function getRepoById(repoId: number): Repository {
  const db = getDatabase()
  const repo = db.prepare(`
    SELECT id, name, svn_path as svnPath, wc_path as wcPath
    FROM repositories WHERE id = ? AND status = 'active'
  `).get(repoId) as Repository | undefined
  if (!repo) throw new Error('저장소를 찾을 수 없습니다.')
  return repo
}

/**
 * 파일을 임시 디렉토리에 클린 복사 (.svn 제외)
 * Electron startDrag에 사용할 경로를 반환
 */
export function prepareDragExport(repoId: number, filePath: string): { tempPath: string } {
  const repo = getRepoById(repoId)
  const srcPath = join(repo.wcPath, filePath)

  if (!existsSync(srcPath)) {
    throw new Error(`파일을 찾을 수 없습니다: ${filePath}`)
  }

  // 임시 디렉토리에 복사
  const tempDir = join(app.getPath('temp'), 'vaultline-drag')
  if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true })

  const fileName = basename(filePath)
  const tempPath = join(tempDir, fileName)

  copyFileSync(srcPath, tempPath)

  return { tempPath }
}
