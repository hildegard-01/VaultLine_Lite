import { join, extname } from 'path'
import { existsSync, mkdirSync, statSync, unlinkSync, copyFileSync } from 'fs'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { app } from 'electron'
import { getDatabase, getAppDataDir } from './DatabaseService'
import * as SvnService from './SvnService'
import { PREVIEW_SUPPORTED_EXTENSIONS, PREVIEW_TIMEOUT_MS, DEFAULT_CACHE_DIR } from '@shared/constants'
import type { Repository } from '@shared/types/ipc'

const execFileAsync = promisify(execFile)

/**
 * PreviewService — 파일 미리보기 서비스
 *
 * 역할:
 * - LibreOffice headless → PDF 변환 (docx/xlsx/hwp 등)
 * - 리비전 기반 캐시 (같은 리비전은 재변환 불필요)
 * - 이미지/텍스트/PDF는 직접 반환
 * - 캐시 용량 관리
 */

/** 미리보기 캐시 디렉토리 */
function getCacheDir(): string {
  const dir = join(getAppDataDir(), DEFAULT_CACHE_DIR, 'preview')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/** LibreOffice 경로 탐색 */
function findLibreOffice(): string | null {
  const candidates = process.platform === 'win32'
    ? [
        'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
        'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
        join(app.getPath('home'), 'LibreOfficePortable\\App\\libreoffice\\program\\soffice.exe')
      ]
    : ['/usr/bin/soffice', '/usr/local/bin/soffice', '/Applications/LibreOffice.app/Contents/MacOS/soffice']

  for (const path of candidates) {
    if (existsSync(path)) return path
  }
  return null
}

/** 미리보기 지원 여부 확인 */
export function isPreviewSupported(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase()
  return PREVIEW_SUPPORTED_EXTENSIONS.includes(ext)
}

/** 미리보기 유형 판단 */
function getPreviewType(filePath: string): 'pdf' | 'image' | 'text' | 'office' | 'unsupported' {
  const ext = extname(filePath).toLowerCase()
  if (ext === '.pdf') return 'pdf'
  if (['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.webp'].includes(ext)) return 'image'
  if (['.txt', '.md', '.csv', '.json', '.xml', '.html', '.css'].includes(ext)) return 'text'
  if (['.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt', '.hwp', '.hwpx'].includes(ext)) return 'office'
  return 'unsupported'
}

/** 미리보기 생성 (캐시 확인 → 변환) */
export async function generatePreview(
  repoId: number,
  filePath: string,
  revision?: number
): Promise<{ cachePath: string; type: string }> {
  const db = getDatabase()
  const repo = db.prepare(`
    SELECT id, svn_path as svnPath, wc_path as wcPath
    FROM repositories WHERE id = ? AND status = 'active'
  `).get(repoId) as Repository | undefined
  if (!repo) throw new Error('저장소를 찾을 수 없습니다.')

  const previewType = getPreviewType(filePath)
  if (previewType === 'unsupported') {
    throw new Error('미리보기를 지원하지 않는 파일 형식입니다.')
  }

  // 이미지/텍스트는 WC 파일 직접 반환
  if (previewType === 'image' || previewType === 'text') {
    const wcFilePath = join(repo.wcPath, filePath)
    if (!existsSync(wcFilePath)) throw new Error('파일을 찾을 수 없습니다.')
    return { cachePath: wcFilePath, type: previewType }
  }

  // PDF는 직접 반환
  if (previewType === 'pdf') {
    const wcFilePath = join(repo.wcPath, filePath)
    if (!existsSync(wcFilePath)) throw new Error('파일을 찾을 수 없습니다.')
    return { cachePath: wcFilePath, type: 'pdf' }
  }

  // Office 문서: 캐시 확인 → LibreOffice 변환
  const targetRevision = revision || (await SvnService.info(repo.wcPath, filePath)).revision
  const cacheKey = `${repoId}_${filePath.replace(/[/\\]/g, '_')}_r${targetRevision}.pdf`
  const cachePath = join(getCacheDir(), cacheKey)

  // 캐시 히트
  if (existsSync(cachePath)) {
    return { cachePath, type: 'pdf' }
  }

  // LibreOffice 변환
  const soffice = findLibreOffice()
  if (!soffice) {
    throw new Error('LibreOffice가 설치되어 있지 않습니다. 미리보기를 사용하려면 LibreOffice를 설치하세요.')
  }

  const wcFilePath = join(repo.wcPath, filePath)
  if (!existsSync(wcFilePath)) throw new Error('파일을 찾을 수 없습니다.')

  // 임시 디렉토리 — 영문 파일명으로 복사 (한글 경로 인코딩 문제 방지)
  const tempDir = join(getCacheDir(), '_temp')
  if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true })

  const ext = extname(filePath)
  const tempName = `preview_${Date.now()}${ext}`
  const tempSrc = join(tempDir, tempName)
  const tempPdf = join(tempDir, tempName.replace(ext, '.pdf'))
  copyFileSync(wcFilePath, tempSrc)

  try {
    await execFileAsync(soffice, [
      '--headless', '--norestore', '--nolockcheck', '--convert-to', 'pdf', '--outdir', tempDir, tempSrc
    ], { timeout: PREVIEW_TIMEOUT_MS, windowsHide: true })

    if (existsSync(tempPdf)) {
      copyFileSync(tempPdf, cachePath)
      try { unlinkSync(tempPdf) } catch { /* EBUSY 무시 */ }
    } else {
      throw new Error('PDF 변환에 실패했습니다.')
    }
  } finally {
    try { if (existsSync(tempSrc)) unlinkSync(tempSrc) } catch { /* EBUSY 무시 */ }
  }

  // DB 캐시 기록
  const fileSize = statSync(cachePath).size
  db.prepare(`
    INSERT INTO preview_cache (repo_id, file_path, revision, cache_path, file_size)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(repo_id, file_path, revision) DO UPDATE SET cache_path = excluded.cache_path, file_size = excluded.file_size
  `).run(repoId, filePath, targetRevision, cachePath, fileSize)

  return { cachePath, type: 'pdf' }
}
