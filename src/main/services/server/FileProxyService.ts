/**
 * FileProxyService — 서버 파일 프록시 (WebSocket 응답)
 *
 * 역할: 서버에서 file_request를 받으면 로컬 파일을 읽어 응답합니다.
 */

import { readFileSync } from 'fs'
import log from 'electron-log'
import * as PreviewService from '../PreviewService'

export const FileProxyService = {
  /** 서버 file_request 처리 */
  async handleFileRequest(req: {
    req_id: string
    repo_id: number
    path: string
    action: 'preview' | 'download'
  }): Promise<{ req_id: string; type: string; data: string } | null> {
    try {
      if (req.action === 'preview') {
        // 미리보기 생성
        const result = await PreviewService.generatePreview(req.repo_id, req.path)
        const buffer = readFileSync(result.cachePath)
        return {
          req_id: req.req_id,
          type: 'file_response',
          data: buffer.toString('base64'),
        }
      }
      // download는 향후 구현
      return null
    } catch (err) {
      log.error('[FileProxy] 파일 요청 처리 실패:', (err as Error).message)
      return null
    }
  },
}
