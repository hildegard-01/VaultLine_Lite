import { join } from 'path'
import { existsSync } from 'fs'
import { app } from 'electron'
import { is } from '@electron-toolkit/utils'

/**
 * SvnPathHelper — SVN 바이너리 경로 + Windows 경로 유틸리티
 *
 * 역할:
 * - SVN 바이너리 경로 탐색 (번들 → 시스템 PATH 순)
 * - file:// URL 생성 (Windows 경로 → SVN URL)
 * - MSYS 경로 변환 방지 환경변수
 */

// SVN 바이너리 캐시
let _svnBinDir: string | null = null

/** SVN 바이너리 디렉토리 탐색 */
function findSvnBinDir(): string {
  // 1. 번들 경로 (프로덕션) — process.resourcesPath = 설치경로/resources/
  if (!is.dev) {
    const bundledPath = join(process.resourcesPath, 'svn', 'bin')
    if (existsSync(join(bundledPath, 'svn.exe')) || existsSync(join(bundledPath, 'svn'))) {
      return bundledPath
    }
  }

  // 2. 개발 모드: resources/ 폴더
  const devBundledPath = join(process.cwd(), 'resources', 'svn', 'bin')
  if (existsSync(join(devBundledPath, 'svn.exe')) || existsSync(join(devBundledPath, 'svn'))) {
    return devBundledPath
  }

  // 3. 알려진 설치 경로 탐색 (SlikSVN, TortoiseSVN 등)
  const knownPaths = process.platform === 'win32'
    ? [
        'C:\\tools\\svn\\bin',
        'C:\\Program Files\\SlikSvn\\bin',
        'C:\\Program Files (x86)\\SlikSvn\\bin',
        'C:\\Program Files\\TortoiseSVN\\bin',
        'C:\\Program Files (x86)\\Subversion\\bin'
      ]
    : ['/usr/bin', '/usr/local/bin', '/opt/homebrew/bin']

  for (const dir of knownPaths) {
    const svnExe = join(dir, process.platform === 'win32' ? 'svn.exe' : 'svn')
    if (existsSync(svnExe)) {
      return dir
    }
  }

  // 4. 시스템 PATH에서 탐색
  const pathDirs = (process.env.PATH || '').split(process.platform === 'win32' ? ';' : ':')
  for (const dir of pathDirs) {
    if (!dir) continue
    const svnExe = join(dir, process.platform === 'win32' ? 'svn.exe' : 'svn')
    if (existsSync(svnExe)) {
      return dir
    }
  }

  throw new Error('SVN 바이너리를 찾을 수 없습니다. SVN을 설치하거나 resources/svn/bin에 배치하세요.')
}

/** SVN 바이너리 디렉토리 (캐시) */
export function getSvnBinDir(): string {
  if (!_svnBinDir) {
    _svnBinDir = findSvnBinDir()
  }
  return _svnBinDir
}

/** SVN 실행 파일 전체 경로 */
export function getSvnPath(command: 'svn' | 'svnadmin' | 'svnserve' = 'svn'): string {
  const binDir = getSvnBinDir()
  const ext = process.platform === 'win32' ? '.exe' : ''
  return join(binDir, command + ext)
}

/**
 * Windows 경로를 SVN file:// URL로 변환
 * 예: C:\repos\test → file:///C:/repos/test
 */
export function toFileUrl(windowsPath: string): string {
  // 이미 file:// URL인 경우 그대로 반환
  if (windowsPath.startsWith('file:///')) {
    return windowsPath
  }
  // 백슬래시 → 슬래시, file:/// 접두어
  const normalized = windowsPath.replace(/\\/g, '/')
  return `file:///${normalized}`
}

/**
 * child_process 실행 시 환경변수
 * MSYS 경로 변환 방지 + SVN 바이너리 PATH 추가
 */
export function getSvnEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    MSYS_NO_PATHCONV: '1',
    MSYS2_ARG_CONV_EXCL: '*',
    PATH: getSvnBinDir() + (process.platform === 'win32' ? ';' : ':') + (process.env.PATH || '')
  }
}
