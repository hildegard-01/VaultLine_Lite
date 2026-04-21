import { app } from 'electron'
import { existsSync, statSync } from 'fs'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'
import * as os from 'os'
import { handleIpc } from './index'
import { getSvnPath, getSvnEnv } from '../services/SvnPathHelper'
import { getDbPath } from '../services/DatabaseService'

/**
 * 시스템 정보 IPC 핸들러 (Phase U)
 *
 * 채널:
 * - system:health-check  — SVN/LibreOffice/svnserve/watcher 상태 확인
 * - system:info-full     — 버전·OS·DB 크기 등 통합 조회 (관리자 화면)
 */

const execFileP = promisify(execFile)

/** LibreOffice 경로 탐색 (PreviewService와 중복 로직 — 독립 유지) */
function findLibreOffice(): string | null {
  const candidates = process.platform === 'win32'
    ? [
        'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
        'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
        join(app.getPath('home'), 'LibreOfficePortable\\App\\libreoffice\\program\\soffice.exe'),
      ]
    : ['/usr/bin/soffice', '/usr/local/bin/soffice', '/Applications/LibreOffice.app/Contents/MacOS/soffice']
  for (const path of candidates) {
    if (existsSync(path)) return path
  }
  return null
}

export function registerSystemHandlers(): void {
  // ─── 서비스 헬스체크 ───
  handleIpc('system:health-check', async () => {
    // SVN
    let svn: { ok: boolean; version?: string } = { ok: false }
    try {
      const { stdout } = await execFileP(getSvnPath('svn'), ['--version', '--quiet'], { env: getSvnEnv(), timeout: 3000 })
      svn = { ok: true, version: stdout.trim() }
    } catch { /* 실패 — ok=false */ }

    // LibreOffice
    const lo = findLibreOffice()
    const libreoffice = lo ? { ok: true, path: lo } : { ok: false }

    // svnserve 바이너리 존재 여부 + 동작 중 서비스는 SvnServeService에서 상태 조회하면 되지만,
    // 여기서는 바이너리 감지만 수행 (running 여부는 저장소별이라 글로벌에서는 NA)
    let svnserve: { ok: boolean; running: boolean } = { ok: false, running: false }
    try {
      const svnservePath = getSvnPath('svnserve')
      svnserve = { ok: existsSync(svnservePath), running: false }
    } catch {
      svnserve = { ok: false, running: false }
    }

    // Watcher — chokidar 모듈이 로드됐는지로 단순 판단 (항상 ok)
    const watcher = { ok: true }

    return { svn, libreoffice, svnserve, watcher }
  })

  // ─── 통합 시스템 정보 ───
  handleIpc('system:info-full', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require('../../../package.json') as { version: string }

    let dbSizeBytes = 0
    try {
      dbSizeBytes = statSync(getDbPath()).size
    } catch { /* DB 파일 아직 생성 전 */ }

    return {
      version: pkg.version,
      electron: process.versions.electron,
      node: process.versions.node,
      chrome: process.versions.chrome,
      platform: process.platform,
      arch: process.arch,
      osRelease: os.release(),
      uptime: process.uptime(),
      dbSizeBytes,
      dataDir: app.getPath('userData'),
    }
  })
}
