import { readFileSync } from 'fs'
import { handleIpc } from './index'
import * as PreviewService from '../services/PreviewService'

/**
 * 미리보기 IPC 핸들러
 * preview:generate — 미리보기 파일 경로 생성
 * preview:read-file — 파일 내용을 Base64로 반환 (CSP 우회)
 */

export function registerPreviewHandlers(): void {
  handleIpc('preview:generate', async (args: unknown) => {
    const { repoId, path, revision } = args as { repoId: number; path: string; revision?: number }
    return await PreviewService.generatePreview(repoId, path, revision)
  })

  // 파일 내용을 Base64로 반환 (Renderer에서 file:// 접근 불가 시 사용)
  handleIpc('preview:read-file', (args: unknown) => {
    const { filePath } = args as { filePath: string }
    const buffer = readFileSync(filePath)
    return { data: buffer.toString('base64') }
  })
}
