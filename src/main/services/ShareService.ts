import { execFile } from 'child_process'
import { promisify } from 'util'
import { join, basename, extname, isAbsolute } from 'path'
import { existsSync, mkdirSync, writeFileSync, statSync, readdirSync } from 'fs'
import express from 'express'
import type { Server } from 'http'
import { createHash } from 'crypto'
import { getDatabase } from './DatabaseService'
import { getLocalIpAddress } from './SvnServeService'
import { SHARE_SERVER_PORT, SHARE_DEFAULT_EXPIRY_MINUTES } from '@shared/constants'
import type { Repository, ShareServerStatus, ShareLinkEntry } from '@shared/types/ipc'

/**
 * ShareService — 로컬 공유 서비스 (REQ-025, REQ-026)
 *
 * 역할:
 * - ZIP 내보내기 패키지 생성 (PowerShell/zip CLI)
 * - Express 단일 서버 관리 — 여러 링크를 하나의 서버로 처리
 * - 링크별 만료/비밀번호/다운로드 제한은 DB에서 요청마다 조회
 */

const execFileAsync = promisify(execFile)

// ─── 싱글턴 서버 상태 ───────────────────────────────────────────────────────
let _server: Server | null = null
let _serverPort: number = SHARE_SERVER_PORT
let _localIp: string = '127.0.0.1'
let _cleanupTimer: ReturnType<typeof setInterval> | null = null

function getServerBaseUrl(): string {
  return `http://${_localIp}:${_serverPort}`
}

function countActiveLinks(): number {
  try {
    const db = getDatabase()
    const row = db.prepare(
      "SELECT COUNT(*) as cnt FROM shares WHERE share_type='link' AND is_active=1 AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))"
    ).get() as { cnt: number }
    return row.cnt
  } catch { return 0 }
}

function cleanExpiredLinks(): void {
  try {
    const db = getDatabase()
    db.prepare(
      "UPDATE shares SET is_active = 0 WHERE share_type = 'link' AND is_active = 1 AND expires_at IS NOT NULL AND datetime(expires_at) <= datetime('now')"
    ).run()
    if (countActiveLinks() === 0) stopServer()
  } catch { /* 만료 정리 오류 무시 */ }
}

async function stopServer(): Promise<void> {
  if (_cleanupTimer) { clearInterval(_cleanupTimer); _cleanupTimer = null }
  if (_server) {
    await new Promise<void>((resolve) => _server!.close(() => resolve()))
    _server = null
  }
}

async function ensureServerRunning(port: number): Promise<void> {
  if (_server) return

  const app = express()
  app.use(express.urlencoded({ extended: false }))

  // ── 범용 다운로드 핸들러 — 요청마다 DB 조회 ──
  app.get('/download/:token', (req, res) => {
    const db = getDatabase()
    const share = db.prepare(`
      SELECT s.id, s.repo_id, s.file_path, s.token, s.expires_at, s.password_hash,
             s.max_downloads, s.access_count, r.wc_path as wcPath
      FROM shares s
      LEFT JOIN repositories r ON r.id = s.repo_id
      WHERE s.token = ? AND s.share_type = 'link' AND s.is_active = 1
    `).get(req.params.token) as {
      id: number; repo_id: number; file_path: string; token: string
      expires_at: string | null; password_hash: string | null
      max_downloads: number | null; access_count: number; wcPath: string | null
    } | undefined

    if (!share) { res.status(403).send('유효하지 않은 링크입니다.'); return }

    if (share.expires_at && new Date() > new Date(share.expires_at)) {
      db.prepare('UPDATE shares SET is_active = 0 WHERE id = ?').run(share.id)
      res.status(410).send('만료된 링크입니다.'); return
    }

    if (share.max_downloads !== null && share.access_count >= share.max_downloads) {
      db.prepare('UPDATE shares SET is_active = 0 WHERE id = ?').run(share.id)
      res.status(410).send('다운로드 횟수가 초과되었습니다.'); return
    }

    if (share.password_hash) {
      const input = req.query.pw as string
      if (!input || createHash('sha256').update(input).digest('hex') !== share.password_hash) {
        const name = basename(share.file_path)
        res.status(200).send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>VaultLine 공유</title>
<style>body{font-family:'Segoe UI',system-ui,sans-serif;padding:32px;max-width:480px;margin:0 auto}
h2{color:#1B2A4A}p{color:#666;font-size:14px}
input{padding:8px;border:1px solid #ddd;border-radius:4px;margin-right:8px}
button{padding:8px 20px;background:#4ECDC4;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600}
</style></head><body>
<h2>${name}</h2>
<p style="color:#E65100">이 파일은 비밀번호로 보호되어 있습니다.</p>
<form action="/download/${share.token}" method="get">
  <input name="pw" type="password" placeholder="비밀번호 입력">
  <button type="submit">다운로드</button>
</form></body></html>`)
        return
      }
    }

    // 절대 경로(temp ZIP) vs 상대 경로(SVN wc 하위)
    const srcPath = isAbsolute(share.file_path)
      ? share.file_path
      : join(share.wcPath ?? '', share.file_path)
    const fileName = basename(share.file_path)
    if (!existsSync(srcPath)) { res.status(404).send('파일을 찾을 수 없습니다.'); return }

    db.prepare('UPDATE shares SET access_count = access_count + 1 WHERE id = ?').run(share.id)
    db.prepare(`INSERT INTO activity_log (repo_id, action, file_path, detail, created_at)
      VALUES (?, 'share.download', ?, ?, CURRENT_TIMESTAMP)`)
      .run(share.repo_id, share.file_path, `임시 링크 다운로드 (IP: ${req.ip ?? '알 수 없음'})`)

    res.download(srcPath, fileName, () => {
      if (share.max_downloads !== null) {
        const cur = db.prepare('SELECT access_count FROM shares WHERE id = ?').get(share.id) as
          | { access_count: number } | undefined
        if (cur && cur.access_count >= share.max_downloads) {
          db.prepare('UPDATE shares SET is_active = 0 WHERE id = ?').run(share.id)
          if (countActiveLinks() === 0) stopServer()
        }
      }
    })
  })

  app.get('/', (_req, res) => {
    const count = countActiveLinks()
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>VaultLine 공유 서버</title>
<style>body{font-family:'Segoe UI',system-ui,sans-serif;padding:32px;max-width:480px;margin:0 auto}
h2{color:#1B2A4A}</style></head><body>
<h2>VaultLine 공유 서버</h2><p>활성 링크: ${count}개</p></body></html>`)
  })

  _serverPort = port
  _localIp = getLocalIpAddress()

  await new Promise<void>((resolve, reject) => {
    _server = app.listen(port, '0.0.0.0', () => resolve())
    _server!.on('error', reject)
  })

  _cleanupTimer = setInterval(cleanExpiredLinks, 60_000)
}

// ─── 다중 파일 임시 ZIP ─────────────────────────────────────────────────────
async function createTempZip(repo: Repository, paths: string[]): Promise<string> {
  const { tmpdir } = require('os')
  const zipDir = join(tmpdir(), 'vaultline-share')
  if (!existsSync(zipDir)) mkdirSync(zipDir, { recursive: true })
  const zipPath = join(zipDir, `share-${Date.now()}.zip`)
  const stagingDir = join(tmpdir(), `vaultline-share-staging-${Date.now()}`)
  mkdirSync(stagingDir, { recursive: true })

  const { copyFileSync: cpFile } = require('fs')
  for (const fp of paths) {
    const src = join(repo.wcPath, fp)
    if (!existsSync(src)) continue
    if (statSync(src).isDirectory()) { copyDirSync(src, join(stagingDir, basename(fp))) }
    else { cpFile(src, join(stagingDir, basename(fp))) }
  }

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

  try { const { rmSync } = require('fs'); rmSync(stagingDir, { recursive: true, force: true }) } catch { /* 무시 */ }
  return zipPath
}

// ─── 저장소 조회 ────────────────────────────────────────────────────────────
function getRepoById(repoId: number): Repository {
  const db = getDatabase()
  const repo = db.prepare(`
    SELECT id, name, svn_path as svnPath, wc_path as wcPath
    FROM repositories WHERE id = ? AND status = 'active'
  `).get(repoId) as Repository | undefined
  if (!repo) throw new Error('저장소를 찾을 수 없습니다.')
  return repo
}

// ─── 공개 API ────────────────────────────────────────────────────────────────

/** 새 공유 링크 추가 (서버가 없으면 자동 시작) */
export async function addShareLink(
  repoId: number,
  filePath: string,
  expiryMinutes?: number,
  password?: string,
  maxDownloads?: number,
  port?: number,
  multiPaths?: string[]
): Promise<ShareServerStatus> {
  let actualPort = port || SHARE_SERVER_PORT
  if (!port) {
    try {
      const db = getDatabase()
      const s = db.prepare("SELECT value FROM app_settings WHERE key = 'shareServerPort'").get() as
        | { value: string } | undefined
      if (s) actualPort = Number(s.value) || SHARE_SERVER_PORT
    } catch { /* 무시 */ }
  }

  let actualExpiry = expiryMinutes || SHARE_DEFAULT_EXPIRY_MINUTES
  if (!expiryMinutes) {
    try {
      const db = getDatabase()
      const s = db.prepare("SELECT value FROM app_settings WHERE key = 'shareExpiryMinutes'").get() as
        | { value: string } | undefined
      if (s) actualExpiry = Number(s.value) || SHARE_DEFAULT_EXPIRY_MINUTES
    } catch { /* 무시 */ }
  }

  await ensureServerRunning(actualPort)

  let actualFilePath = filePath
  if (multiPaths && multiPaths.length > 1) {
    const repo = getRepoById(repoId)
    actualFilePath = await createTempZip(repo, multiPaths)
  }

  const token = generateToken()
  const expiresAt = new Date(Date.now() + actualExpiry * 60 * 1000).toISOString()
  const passwordHash = password ? createHash('sha256').update(password).digest('hex') : null

  const db = getDatabase()
  const result = db.prepare(`
    INSERT INTO shares (repo_id, file_path, share_type, token, password_hash, expires_at, max_downloads, is_active)
    VALUES (?, ?, 'link', ?, ?, ?, ?, 1)
  `).run(repoId, actualFilePath, token, passwordHash, expiresAt, maxDownloads ?? null)

  const id = Number(result.lastInsertRowid)
  const baseUrl = getServerBaseUrl()

  db.prepare(`INSERT INTO activity_log (repo_id, action, file_path, detail, created_at)
    VALUES (?, 'share.create', ?, ?, CURRENT_TIMESTAMP)`)
    .run(repoId, filePath, `임시 링크 생성: ${baseUrl}/download/${token}`)

  const repoRow = db.prepare('SELECT name FROM repositories WHERE id = ?').get(repoId) as
    | { name: string } | undefined

  const newLink: ShareLinkEntry = {
    id,
    repoId,
    filePath: actualFilePath,
    repoName: repoRow?.name ?? null,
    token,
    expiresAt,
    hasPassword: !!passwordHash,
    maxDownloads: maxDownloads ?? null,
    accessCount: 0,
    createdAt: new Date().toISOString(),
    downloadUrl: `${baseUrl}/download/${token}`
  }

  return {
    running: true,
    url: baseUrl,
    port: actualPort,
    activeLinkCount: countActiveLinks(),
    newLink
  }
}

/** 활성 링크 목록 조회 */
export function getActiveLinks(): ShareLinkEntry[] {
  const db = getDatabase()
  const rows = db.prepare(`
    SELECT s.id, s.repo_id, s.file_path, s.token, s.expires_at,
           s.password_hash, s.max_downloads, s.access_count, s.created_at,
           r.name as repo_name
    FROM shares s
    LEFT JOIN repositories r ON r.id = s.repo_id
    WHERE s.share_type = 'link' AND s.is_active = 1
      AND (s.expires_at IS NULL OR datetime(s.expires_at) > datetime('now'))
    ORDER BY s.created_at DESC
  `).all() as Array<{
    id: number; repo_id: number; file_path: string; token: string
    expires_at: string | null; password_hash: string | null
    max_downloads: number | null; access_count: number; created_at: string
    repo_name: string | null
  }>

  const baseUrl = _server ? getServerBaseUrl() : ''
  return rows.map(row => ({
    id: row.id,
    repoId: row.repo_id,
    filePath: row.file_path,
    repoName: row.repo_name,
    token: row.token,
    expiresAt: row.expires_at ?? '',
    hasPassword: !!row.password_hash,
    maxDownloads: row.max_downloads,
    accessCount: row.access_count,
    createdAt: row.created_at,
    downloadUrl: baseUrl ? `${baseUrl}/download/${row.token}` : ''
  }))
}

/** 서버 상태 조회 */
export function getServerStatus(): ShareServerStatus {
  if (!_server) return { running: false }
  const count = countActiveLinks()
  if (count === 0) {
    stopServer()
    return { running: false }
  }
  return { running: true, url: getServerBaseUrl(), port: _serverPort, activeLinkCount: count }
}

/** 활성 링크가 없으면 서버 자동 중지 */
export async function stopServerIfEmpty(): Promise<void> {
  if (countActiveLinks() === 0) await stopServer()
}

/** 서버만 시작 (링크 생성 없이) — 기존 활성 링크를 그대로 서빙 */
export async function restartServer(): Promise<ShareServerStatus> {
  if (countActiveLinks() === 0) return { running: false }
  await ensureServerRunning(_serverPort)
  return getServerStatus()
}

/** 모든 링크 비활성화 + 서버 중지 */
export async function stopTempServer(): Promise<void> {
  try {
    const db = getDatabase()
    db.prepare("UPDATE shares SET is_active = 0 WHERE share_type = 'link' AND is_active = 1").run()
  } catch { /* 무시 */ }
  await stopServer()
}

/** 공유 URL 반환 — 기존 활성 링크 재사용 또는 신규 생성 */
export async function getShareUrl(repoId: number, filePath: string): Promise<{ url: string }> {
  const db = getDatabase()
  const existing = db.prepare(`
    SELECT token FROM shares
    WHERE repo_id = ? AND file_path = ? AND share_type = 'link' AND is_active = 1
      AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))
    ORDER BY created_at DESC LIMIT 1
  `).get(repoId, filePath) as { token: string } | undefined

  if (existing && _server) {
    return { url: `${getServerBaseUrl()}/download/${existing.token}` }
  }

  const status = await addShareLink(repoId, filePath)
  return { url: status.newLink!.downloadUrl }
}

/** 랜덤 토큰 생성 */
function generateToken(): string {
  const { randomBytes } = require('crypto')
  return randomBytes(16).toString('hex')
}

// ─── ZIP 내보내기 패키지 ─────────────────────────────────────────────────────

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

  const fileName = basename(filePath, extname(filePath))
  const zipPath = destPath.endsWith('.zip') ? destPath : join(destPath, `${fileName}.zip`)
  const destDir = join(zipPath, '..')
  if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })

  const { tmpdir } = require('os')
  const stagingDir = join(tmpdir(), `vaultline-export-${Date.now()}`)
  mkdirSync(stagingDir, { recursive: true })

  try {
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
      recentCommits: commits.map(c => ({ revision: c.revision, message: c.commit_message }))
    }
    writeFileSync(join(stagingDir, 'metadata.json'), JSON.stringify(metadata, null, 2), 'utf-8')

    const fileNames = allPaths.map(fp => basename(fp))
    const indexHtml = buildExportIndexHtml(metadata, fileNames)
    writeFileSync(join(stagingDir, 'index.html'), indexHtml, 'utf-8')

    if (process.platform === 'win32') {
      await execFileAsync('powershell', [
        '-NoProfile', '-NonInteractive', '-Command',
        `Compress-Archive -Path '${stagingDir}\\*' -DestinationPath '${zipPath}' -Force`
      ], { windowsHide: true })
    } else {
      await execFileAsync('zip', ['-r', zipPath, '.'], { cwd: stagingDir })
    }
  } finally {
    const { rmSync } = require('fs')
    try { rmSync(stagingDir, { recursive: true, force: true }) } catch { /* 무시 */ }
  }

  const db = getDatabase()
  db.prepare(`INSERT INTO shares (repo_id, file_path, share_type, created_at)
    VALUES (?, ?, 'zip', CURRENT_TIMESTAMP)`).run(repoId, filePath)
  db.prepare(`INSERT INTO activity_log (repo_id, action, file_path, detail, created_at)
    VALUES (?, 'file.export', ?, 'ZIP 패키지 내보내기', CURRENT_TIMESTAMP)`).run(repoId, filePath)

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
    if (entry.isDirectory()) { copyDirSync(srcEntry, destEntry) }
    else { cpFile(srcEntry, destEntry) }
  }
}

/** 내보내기 index.html 생성 */
function buildExportIndexHtml(
  metadata: {
    repository: string; fileName: string; fileSize: number; exportedAt: string
    tags: string[]; recentCommits: Array<{ revision: number; message: string }>
    fileCount?: number; files?: string[]
  },
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
