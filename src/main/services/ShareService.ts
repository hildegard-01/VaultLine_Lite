import { execFile } from 'child_process'
import { promisify } from 'util'
import { join, basename, extname } from 'path'
import { existsSync, mkdirSync, writeFileSync, statSync, readdirSync } from 'fs'
import express from 'express'
import type { Server } from 'http'
import { createHash } from 'crypto'
import { getDatabase } from './DatabaseService'
import { getLocalIpAddress } from './SvnServeService'
import { SHARE_SERVER_PORT, SHARE_DEFAULT_EXPIRY_MINUTES } from '@shared/constants'
import type { Repository, ShareServerStatus } from '@shared/types/ipc'

/**
 * ShareService — 로컬 공유 서비스 (REQ-025, REQ-026)
 *
 * 역할:
 * - ZIP 내보내기 패키지 생성 (PowerShell/zip CLI)
 * - Express :9090 임시 웹서버 관리 (시작/중지/상태)
 * - 공유 URL 반환
 */

const execFileAsync = promisify(execFile)

// 임시 서버 싱글턴 상태
let _server: Server | null = null
let _serverStatus: ShareServerStatus = { running: false }
let _expiryTimer: ReturnType<typeof setTimeout> | null = null

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

/** ZIP 내보내기 패키지 생성 (원본 + metadata.json + index.html) */
export async function exportZipPackage(
  repoId: number,
  filePath: string,
  destPath: string,
  multiPaths?: string[]
): Promise<{ exportPath: string }> {
  const repo = getRepoById(repoId)
  const allPaths = multiPaths && multiPaths.length > 0 ? multiPaths : [filePath]
  const srcPath = join(repo.wcPath, filePath)

  if (!existsSync(srcPath)) {
    throw new Error(`파일을 찾을 수 없습니다: ${filePath}`)
  }

  // ZIP 파일 경로 결정
  const fileName = basename(filePath, extname(filePath))
  const zipPath = destPath.endsWith('.zip') ? destPath : join(destPath, `${fileName}.zip`)
  const destDir = join(zipPath, '..')
  if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })

  // 스테이징 디렉토리 — ZIP에 포함될 파일들을 모아둠
  const { tmpdir } = require('os')
  const stagingDir = join(tmpdir(), `vaultline-export-${Date.now()}`)
  mkdirSync(stagingDir, { recursive: true })

  try {
    // 원본 파일 복사 — 단일 또는 다중
    const { copyFileSync: cpFile } = require('fs')
    for (const fp of allPaths) {
      const src = join(repo.wcPath, fp)
      if (!existsSync(src)) continue
      const name = basename(src)
      const st = statSync(src)
      if (st.isDirectory()) {
        copyDirSync(src, join(stagingDir, name))
      } else {
        cpFile(src, join(stagingDir, name))
      }
    }

    // metadata.json 생성
    const db = getDatabase()
    const tags = db.prepare(`
      SELECT t.name FROM file_tags ft JOIN tags t ON ft.tag_id = t.id
      WHERE ft.repo_id = ? AND ft.file_path = ?
    `).all(repoId, filePath) as Array<{ name: string }>

    const commits = db.prepare(`
      SELECT revision, file_name, commit_message FROM search_index
      WHERE repo_id = ? AND file_path = ? ORDER BY revision DESC LIMIT 10
    `).all(repoId, filePath) as Array<{ revision: number; file_name: string; commit_message: string }>

    const metadata = {
      exportedAt: new Date().toISOString(),
      source: 'VaultLine Local',
      repository: repo.name,
      fileCount: allPaths.length,
      files: allPaths.map(fp => basename(fp)),
      filePath,
      fileName: allPaths.length > 1 ? `${allPaths.length}개 파일` : basename(srcPath),
      fileSize: allPaths.reduce((sum, fp) => {
        try { return sum + statSync(join(repo.wcPath, fp)).size } catch { return sum }
      }, 0),
      tags: tags.map(t => t.name),
      recentCommits: commits.map(c => ({
        revision: c.revision,
        message: c.commit_message
      }))
    }
    writeFileSync(join(stagingDir, 'metadata.json'), JSON.stringify(metadata, null, 2), 'utf-8')

    // index.html 생성 — 브라우저에서 열 수 있는 뷰어
    const fileNames = allPaths.map(fp => basename(fp))
    const indexHtml = buildExportIndexHtml(metadata, fileNames)
    writeFileSync(join(stagingDir, 'index.html'), indexHtml, 'utf-8')

    // 플랫폼별 ZIP 생성
    if (process.platform === 'win32') {
      await execFileAsync('powershell', [
        '-NoProfile', '-NonInteractive', '-Command',
        `Compress-Archive -Path '${stagingDir}\\*' -DestinationPath '${zipPath}' -Force`
      ], { windowsHide: true })
    } else {
      await execFileAsync('zip', ['-r', zipPath, '.'], { cwd: stagingDir })
    }
  } finally {
    // 스테이징 디렉토리 정리
    const { rmSync } = require('fs')
    try { rmSync(stagingDir, { recursive: true, force: true }) } catch { /* 무시 */ }
  }

  // 공유 이력 기록
  const db = getDatabase()
  db.prepare(`
    INSERT INTO shares (repo_id, file_path, share_type, created_at)
    VALUES (?, ?, 'zip', CURRENT_TIMESTAMP)
  `).run(repoId, filePath)
  db.prepare(`
    INSERT INTO activity_log (repo_id, action, file_path, detail, created_at)
    VALUES (?, 'file.export', ?, 'ZIP 패키지 내보내기', CURRENT_TIMESTAMP)
  `).run(repoId, filePath)

  return { exportPath: zipPath }
}

/** 디렉토리 재귀 복사 (.svn 제외) */
function copyDirSync(src: string, dest: string): void {
  const { copyFileSync: cpFile } = require('fs')
  mkdirSync(dest, { recursive: true })
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    if (entry.name === '.svn') continue
    const srcEntry = join(src, entry.name)
    const destEntry = join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDirSync(srcEntry, destEntry)
    } else {
      cpFile(srcEntry, destEntry)
    }
  }
}

/** 내보내기 index.html 생성 — 단일/다중 파일 대응 */
function buildExportIndexHtml(
  metadata: { repository: string; fileName: string; fileSize: number; exportedAt: string; tags: string[]; recentCommits: Array<{ revision: number; message: string }>; fileCount?: number; files?: string[] },
  fileNames: string[]
): string {
  const tagsHtml = metadata.tags.length > 0
    ? metadata.tags.map(t => `<span class="tag">${t}</span>`).join(' ')
    : '<span class="muted">없음</span>'
  const commitsHtml = metadata.recentCommits.length > 0
    ? metadata.recentCommits.map(c => `<li><strong>r.${c.revision}</strong> — ${c.message}</li>`).join('\n')
    : '<li class="muted">이력 없음</li>'
  const sizeKB = (metadata.fileSize / 1024).toFixed(1)
  const title = fileNames.length > 1 ? `${fileNames.length}개 파일` : fileNames[0]

  // 파일 목록 + 개별 링크
  const filesHtml = fileNames.map(name =>
    `<li><a href="./${encodeURIComponent(name)}" class="file-link">${name}</a></li>`
  ).join('\n')

  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"><title>${title} — VaultLine 패키지</title>
<style>
  body{font-family:'Segoe UI',system-ui,sans-serif;max-width:600px;margin:40px auto;padding:0 20px;color:#333}
  h1{color:#1B2A4A;font-size:20px;margin-bottom:4px}
  .meta{color:#888;font-size:13px;margin-bottom:24px}
  .section{margin-bottom:20px}
  .section h3{font-size:13px;color:#1B2A4A;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px}
  .tag{display:inline-block;padding:2px 8px;border-radius:4px;background:#4ECDC420;color:#1B2A4A;font-size:12px;margin-right:4px}
  ul{padding-left:20px;font-size:13px;line-height:1.8}
  .muted{color:#aaa}
  .file-link{color:#1565C0;text-decoration:none;font-weight:500}
  .file-link:hover{text-decoration:underline}
  .footer{margin-top:32px;font-size:11px;color:#aaa}
</style></head><body>
<h1>${title}</h1>
<div class="meta">${metadata.repository} · ${sizeKB} KB · ${new Date(metadata.exportedAt).toLocaleString('ko-KR')}</div>
<div class="section"><h3>포함된 파일</h3><ul>${filesHtml}</ul></div>
<div class="section"><h3>태그</h3>${tagsHtml}</div>
<div class="section"><h3>최근 커밋</h3><ul>${commitsHtml}</ul></div>
<p class="footer">VaultLine Local에서 내보낸 패키지입니다.</p>
</body></html>`
}

/** 임시 웹서버 시작 */
export async function startTempServer(
  repoId: number,
  filePath: string,
  expiryMinutes?: number,
  password?: string,
  maxDownloads?: number,
  port?: number,
  multiPaths?: string[]
): Promise<ShareServerStatus> {
  // 만료 시간: 파라미터 > 앱 설정 > 기본값
  let actualExpiry = expiryMinutes || SHARE_DEFAULT_EXPIRY_MINUTES
  if (!expiryMinutes) {
    try {
      const dbEx = getDatabase()
      const setting = dbEx.prepare("SELECT value FROM app_settings WHERE key = 'shareExpiryMinutes'").get() as { value: string } | undefined
      if (setting) actualExpiry = Number(setting.value) || SHARE_DEFAULT_EXPIRY_MINUTES
    } catch { /* 무시 */ }
  }
  // 이미 실행 중이면 중지 후 재시작
  if (_server) await stopTempServer()

  const repo = getRepoById(repoId)
  const allPaths = multiPaths && multiPaths.length > 0 ? multiPaths : [filePath]
  const isMulti = allPaths.length > 1

  // 다중 파일: 임시 ZIP 생성
  let srcPath: string
  let fileName: string
  if (isMulti) {
    const { tmpdir } = require('os')
    const zipDir = join(tmpdir(), 'vaultline-share')
    if (!existsSync(zipDir)) mkdirSync(zipDir, { recursive: true })
    const zipPath = join(zipDir, `share-${Date.now()}.zip`)

    // 스테이징
    const stagingDir = join(tmpdir(), `vaultline-share-staging-${Date.now()}`)
    mkdirSync(stagingDir, { recursive: true })
    const { copyFileSync: cpFile } = require('fs')
    for (const fp of allPaths) {
      const src = join(repo.wcPath, fp)
      if (existsSync(src)) {
        const st = statSync(src)
        if (st.isDirectory()) {
          copyDirSync(src, join(stagingDir, basename(fp)))
        } else {
          cpFile(src, join(stagingDir, basename(fp)))
        }
      }
    }

    // ZIP 생성
    if (process.platform === 'win32') {
      const { execFileSync } = require('child_process')
      execFileSync('powershell', [
        '-NoProfile', '-NonInteractive', '-Command',
        `Compress-Archive -Path '${stagingDir}\\*' -DestinationPath '${zipPath}' -Force`
      ], { windowsHide: true })
    } else {
      const { execFileSync } = require('child_process')
      execFileSync('zip', ['-r', zipPath, '.'], { cwd: stagingDir })
    }

    // 스테이징 정리
    try { const { rmSync } = require('fs'); rmSync(stagingDir, { recursive: true, force: true }) } catch { /* 무시 */ }

    srcPath = zipPath
    fileName = `VaultLine_${allPaths.length}files.zip`
  } else {
    srcPath = join(repo.wcPath, filePath)
    fileName = basename(filePath)
  }

  if (!existsSync(srcPath)) {
    throw new Error(`파일을 찾을 수 없습니다: ${filePath}`)
  }

  // 공유 토큰 생성 + DB 저장
  const token = generateToken()
  const expiresAt = new Date(Date.now() + actualExpiry * 60 * 1000).toISOString()
  const passwordHash = password ? createHash('sha256').update(password).digest('hex') : null
  const db = getDatabase()
  db.prepare(`
    INSERT INTO shares (repo_id, file_path, share_type, token, password_hash, expires_at, is_active)
    VALUES (?, ?, 'link', ?, ?, ?, 1)
  `).run(repoId, filePath, token, passwordHash, expiresAt)

  // Express 서버 구성
  const app = express()
  app.use(express.urlencoded({ extended: false }))

  // 비밀번호 검증 미들웨어
  const verifyPassword = (req: express.Request, _res: express.Response): boolean => {
    if (!passwordHash) return true
    const input = req.query.pw as string || req.body?.pw
    if (!input) return false
    return createHash('sha256').update(input).digest('hex') === passwordHash
  }

  // 다운로드 횟수 확인
  const checkDownloadLimit = (): boolean => {
    if (!maxDownloads) return true
    const row = db.prepare('SELECT access_count FROM shares WHERE token = ?').get(token) as { access_count: number } | undefined
    return !row || row.access_count < maxDownloads
  }

  // 다운로드 엔드포인트
  app.get(`/download/:token`, (req, res) => {
    if (req.params.token !== token) {
      res.status(403).send('유효하지 않은 링크입니다.')
      return
    }
    if (new Date() > new Date(expiresAt)) {
      res.status(410).send('만료된 링크입니다.')
      return
    }
    if (!checkDownloadLimit()) {
      res.status(410).send('다운로드 횟수가 초과되었습니다.')
      return
    }
    if (!verifyPassword(req, res)) {
      res.status(403).send('비밀번호가 올바르지 않습니다.')
      return
    }

    // 접근 카운트 증가
    db.prepare('UPDATE shares SET access_count = access_count + 1 WHERE token = ?').run(token)

    res.download(srcPath, fileName, () => {
      // 횟수 제한 도달 시 자동 중지
      if (maxDownloads && !checkDownloadLimit()) {
        stopTempServer()
      }
    })
  })

  // 파일 정보 페이지
  app.get(`/`, (_req, res) => {
    const pwForm = passwordHash
      ? `<form action="/download/${token}" method="get" style="margin-top:12px">
           <input name="pw" type="password" placeholder="비밀번호 입력" style="padding:8px;border:1px solid #ddd;border-radius:4px;margin-right:8px">
           <button type="submit" style="padding:8px 20px;background:#4ECDC4;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600">다운로드</button>
         </form>`
      : `<a href="/download/${token}" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#4ECDC4;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">다운로드</a>`
    const limitText = maxDownloads ? `<br>다운로드 제한: ${maxDownloads}회` : ''

    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>VaultLine 공유</title>
      <style>body{font-family:'Segoe UI',system-ui,sans-serif;padding:32px;max-width:480px;margin:0 auto}
      h2{color:#1B2A4A}p{color:#666;font-size:14px}</style></head><body>
      <h2>${fileName}</h2>
      <p>VaultLine Local에서 공유된 파일입니다.<br>만료: ${new Date(expiresAt).toLocaleString('ko-KR')}${limitText}</p>
      ${passwordHash ? '<p style="color:#E65100;font-size:13px">이 파일은 비밀번호로 보호되어 있습니다.</p>' : ''}
      ${pwForm}
      </body></html>`)
  })

  // 포트 결정: 파라미터 > 앱 설정 > 기본값
  let actualPort = port || SHARE_SERVER_PORT
  if (!port) {
    try {
      const db2 = getDatabase()
      const setting = db2.prepare("SELECT value FROM app_settings WHERE key = 'shareServerPort'").get() as { value: string } | undefined
      if (setting) actualPort = Number(setting.value) || SHARE_SERVER_PORT
    } catch { /* 무시 */ }
  }

  // 서버 시작
  await new Promise<void>((resolve, reject) => {
    _server = app.listen(actualPort, '0.0.0.0', () => resolve())
    _server.on('error', reject)
  })

  // 만료 타이머
  _expiryTimer = setTimeout(() => stopTempServer(), actualExpiry * 60 * 1000)

  // 로컬 IP로 표시
  const localIp = getLocalIpAddress()
  const url = `http://${localIp}:${actualPort}`
  _serverStatus = {
    running: true, url, token, expiresAt, repoId, filePath,
    hasPassword: !!passwordHash,
    maxDownloads: maxDownloads || undefined,
    accessCount: 0
  }

  db.prepare(`
    INSERT INTO activity_log (repo_id, action, file_path, detail, created_at)
    VALUES (?, 'share.create', ?, ?, CURRENT_TIMESTAMP)
  `).run(repoId, filePath, `임시 링크 생성: ${url}`)

  return _serverStatus
}

/** 임시 웹서버 중지 */
export async function stopTempServer(): Promise<void> {
  if (_expiryTimer) {
    clearTimeout(_expiryTimer)
    _expiryTimer = null
  }

  if (_server) {
    const db = getDatabase()
    if (_serverStatus.token) {
      db.prepare('UPDATE shares SET is_active = 0 WHERE token = ?').run(_serverStatus.token)
    }

    await new Promise<void>((resolve) => _server!.close(() => resolve()))
    _server = null
  }

  _serverStatus = { running: false }
}

/** 서버 상태 조회 */
export function getServerStatus(): ShareServerStatus {
  // 만료 여부 확인
  if (_serverStatus.running && _serverStatus.expiresAt) {
    if (new Date() > new Date(_serverStatus.expiresAt)) {
      stopTempServer()
      return { running: false }
    }
  }
  return _serverStatus
}

/** 공유 URL 반환 (서버가 실행 중이어야 함) */
export async function getShareUrl(repoId: number, filePath: string): Promise<{ url: string }> {
  // 같은 파일로 서버가 이미 실행 중이면 URL 반환
  if (_serverStatus.running && _serverStatus.repoId === repoId && _serverStatus.filePath === filePath) {
    return { url: `${_serverStatus.url}/download/${_serverStatus.token}` }
  }
  // 서버 시작 후 URL 반환
  const status = await startTempServer(repoId, filePath)
  return { url: `${status.url}/download/${status.token}` }
}

/** 랜덤 토큰 생성 */
function generateToken(): string {
  const { randomBytes } = require('crypto')
  return randomBytes(16).toString('hex')
}
