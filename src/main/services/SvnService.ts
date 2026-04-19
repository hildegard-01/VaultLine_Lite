import { execFile } from 'child_process'
import { promisify } from 'util'
import { getSvnPath, getSvnEnv, toFileUrl } from './SvnPathHelper'

const execFileAsync = promisify(execFile)

/**
 * SvnService — SVN CLI 래핑 서비스
 *
 * 역할:
 * - svn/svnadmin CLI 명령을 child_process.execFile로 실행
 * - 저장소별 명령 큐로 직렬화 (동시 SVN 명령 충돌 방지)
 * - XML 출력 파싱 (svn list --xml, svn log --xml, svn info --xml)
 *
 * 구성:
 * - exec(): SVN 명령 실행 (큐 직렬화)
 * - createRepo(): svnadmin create
 * - checkout(): svn checkout
 * - list(): svn list --xml
 * - info(): svn info --xml
 * - log(): svn log --xml
 * - diff(): svn diff
 * - blame(): svn blame --xml
 * - add/commit/mkdir/rename/move/delete: 변경 명령
 */

// 저장소별 명령 큐 (직렬화)
const repoQueues = new Map<string, Promise<unknown>>()

/** 저장소별 직렬화 큐에 작업 추가 */
function enqueue<T>(repoKey: string, fn: () => Promise<T>): Promise<T> {
  const prev = repoQueues.get(repoKey) || Promise.resolve()
  const next = prev.then(fn, fn) // 이전 작업 실패해도 다음 실행
  repoQueues.set(repoKey, next)
  return next
}

/** SVN CLI 실행 공통 함수 */
async function execSvn(
  command: 'svn' | 'svnadmin',
  args: string[],
  options?: { cwd?: string; timeout?: number }
): Promise<{ stdout: string; stderr: string }> {
  const svnPath = getSvnPath(command)
  const env = getSvnEnv()
  const timeout = options?.timeout || 30_000

  console.log(`[SVN] 실행: ${command} ${args.join(' ')}`)

  try {
    const result = await execFileAsync(svnPath, args, {
      env,
      cwd: options?.cwd,
      timeout,
      maxBuffer: 50 * 1024 * 1024,
      windowsHide: true
    })
    if (result.stdout) console.log(`[SVN] stdout: ${result.stdout.trim()}`)
    if (result.stderr) console.warn(`[SVN] stderr: ${result.stderr.trim()}`)
    return result
  } catch (err: unknown) {
    const error = err as { stderr?: string; message?: string }
    const msg = error.stderr || error.message || '알 수 없는 SVN 오류'
    console.error(`[SVN] 오류: ${msg.trim()}`)
    throw new Error(`SVN 오류: ${msg.trim()}`)
  }
}

// ═══ 저장소 관리 ═══

/** svnadmin create — 새 SVN 저장소 생성 */
export async function createRepo(repoPath: string): Promise<void> {
  await execSvn('svnadmin', ['create', repoPath])
}

/** svnadmin hotcopy — SVN 저장소 백업 */
export async function hotcopy(repoPath: string, destPath: string): Promise<void> {
  await execSvn('svnadmin', ['hotcopy', repoPath, destPath])
}

/** svn checkout — 작업 복사본 생성 */
export async function checkout(repoPath: string, wcPath: string): Promise<void> {
  const url = toFileUrl(repoPath)
  await execSvn('svn', ['checkout', url, wcPath, '--quiet'])
}

// ═══ 조회 ═══

/**
 * svn list --xml — 디렉토리 내용 목록
 * 주의: WC 경로가 아닌 file:// URL 사용 (WC 루트 대상 list가 빈 결과 반환하는 SVN 동작 때문)
 */
export async function list(
  wcPath: string,
  subPath: string = '',
  repoPath?: string
): Promise<SvnListEntry[]> {
  // file:// URL로 조회 (repoPath가 제공되면 사용, 아니면 svn info로 URL 획득)
  return enqueue(wcPath, async () => {
    let targetUrl: string
    if (repoPath) {
      const baseUrl = toFileUrl(repoPath)
      targetUrl = subPath ? `${baseUrl}/${subPath}` : baseUrl
    } else {
      // WC에서 저장소 URL 추출
      const { stdout: infoXml } = await execSvn('svn', ['info', '--xml', wcPath])
      const repoRoot = extractTag(infoXml, 'root')
      targetUrl = subPath ? `${repoRoot}/${subPath}` : repoRoot
    }
    const { stdout } = await execSvn('svn', ['list', '--xml', targetUrl])
    return parseSvnListXml(stdout)
  })
}

/** svn info --xml — 파일/디렉토리 상세 정보 */
export async function info(
  wcPath: string,
  subPath: string = ''
): Promise<SvnInfoEntry> {
  const targetPath = subPath ? `${wcPath}/${subPath}` : wcPath
  return enqueue(wcPath, async () => {
    const { stdout } = await execSvn('svn', ['info', '--xml', targetPath])
    return parseSvnInfoXml(stdout)
  })
}

/** svn info (절대 경로) — 파일이 SVN 관리 중인지 확인 */
export async function infoLocal(wcPath: string, absPath: string): Promise<{ stdout: string }> {
  return enqueue(wcPath, async () => {
    return await execSvn('svn', ['info', absPath])
  })
}

/**
 * svn log --xml — 커밋 이력 조회
 * file:// URL 사용으로 안정적 조회
 */
export async function log(
  wcPath: string,
  subPath: string = '',
  limit: number = 50,
  repoPath?: string
): Promise<SvnLogEntry[]> {
  return enqueue(wcPath, async () => {
    let targetUrl: string
    if (repoPath) {
      const baseUrl = toFileUrl(repoPath)
      targetUrl = subPath ? `${baseUrl}/${subPath}` : baseUrl
    } else {
      const { stdout: infoXml } = await execSvn('svn', ['info', '--xml', wcPath])
      const repoRoot = extractTag(infoXml, 'root')
      targetUrl = subPath ? `${repoRoot}/${subPath}` : repoRoot
    }
    const { stdout } = await execSvn('svn', [
      'log', '--xml', '--limit', String(limit), targetUrl
    ])
    return parseSvnLogXml(stdout)
  })
}

/** svn diff — 두 리비전 간 차이 */
export async function diff(
  wcPath: string,
  subPath: string,
  rev1: number,
  rev2: number
): Promise<string> {
  const targetPath = subPath ? `${wcPath}/${subPath}` : wcPath
  return enqueue(wcPath, async () => {
    const { stdout } = await execSvn('svn', [
      'diff', '-r', `${rev1}:${rev2}`, targetPath
    ])
    return stdout
  })
}

/** svn blame --xml — 라인별 작성자 */
export async function blame(
  wcPath: string,
  subPath: string
): Promise<SvnBlameEntry[]> {
  const targetPath = `${wcPath}/${subPath}`
  return enqueue(wcPath, async () => {
    const { stdout } = await execSvn('svn', ['blame', '--xml', targetPath])
    return parseSvnBlameXml(stdout)
  })
}

/** svn status — 변경 파일 목록 */
export async function status(wcPath: string): Promise<SvnStatusEntry[]> {
  return enqueue(wcPath, async () => {
    const { stdout } = await execSvn('svn', ['status', '--xml', wcPath])
    return parseSvnStatusXml(stdout)
  })
}

// ═══ 변경 명령 ═══

/** svn add — 파일/폴더 추가 */
export async function add(wcPath: string, targets: string[]): Promise<void> {
  await enqueue(wcPath, async () => {
    await execSvn('svn', ['add', '--force', ...targets], { cwd: wcPath })
  })
}

/** svn commit — 커밋 */
export async function commit(
  wcPath: string,
  message: string,
  targets?: string[]
): Promise<number> {
  return enqueue(wcPath, async () => {
    const args = ['commit', '-m', message]
    if (targets && targets.length > 0) {
      args.push(...targets)
    } else {
      args.push(wcPath)
    }
    const { stdout, stderr } = await execSvn('svn', args)

    // 로케일 무관 리비전 추출: 커밋 출력 마지막 줄의 숫자. 패턴
    // 영문: "Committed revision 6."  한국어: "커밋된 리비전 6."
    const lastLine = (stdout + '\n' + stderr).trimEnd().split('\n').pop()?.trim() ?? ''
    const match = lastLine.match(/(\d+)\.$/)
    return match ? parseInt(match[1], 10) : 0
  })
}

/** svn mkdir — 폴더 생성 + 커밋 */
export async function mkdir(
  wcPath: string,
  dirPath: string,
  message: string
): Promise<void> {
  const fullPath = `${wcPath}/${dirPath}`
  await enqueue(wcPath, async () => {
    await execSvn('svn', ['mkdir', '--parents', fullPath])
    await execSvn('svn', ['commit', '-m', message, fullPath])
  })
}

/** svn rename — 이름 변경 */
export async function rename(
  wcPath: string,
  oldPath: string,
  newPath: string,
  message: string
): Promise<void> {
  await enqueue(wcPath, async () => {
    await execSvn('svn', ['rename', `${wcPath}/${oldPath}`, `${wcPath}/${newPath}`])
    await execSvn('svn', ['commit', '-m', message, wcPath])
  })
}

/** svn move — 이동 */
export async function move(
  wcPath: string,
  srcPath: string,
  destPath: string,
  message: string
): Promise<void> {
  const normalizedSrc = srcPath.replace(/\\/g, '/')
  const normalizedDest = destPath.replace(/\\/g, '/')
  if (normalizedSrc === normalizedDest) {
    throw new Error('원본과 대상 경로가 동일합니다.')
  }
  await enqueue(wcPath, async () => {
    await execSvn('svn', ['move', '--force', `${wcPath}/${normalizedSrc}`, `${wcPath}/${normalizedDest}`])
    await execSvn('svn', ['commit', '-m', message, wcPath])
  })
}

/** svn delete — 삭제 */
export async function remove(
  wcPath: string,
  targetPath: string,
  message: string
): Promise<void> {
  await enqueue(wcPath, async () => {
    await execSvn('svn', ['delete', `${wcPath}/${targetPath}`])
    await execSvn('svn', ['commit', '-m', message, wcPath])
  })
}

/** svn update — 최신화 */
export async function update(wcPath: string): Promise<number> {
  return enqueue(wcPath, async () => {
    const { stdout } = await execSvn('svn', ['update', wcPath])
    const match = stdout.match(/revision (\d+)/)
    return match ? parseInt(match[1], 10) : 0
  })
}

/** svn revert — 변경 되돌리기 */
export async function revert(wcPath: string, targetPath?: string): Promise<void> {
  await enqueue(wcPath, async () => {
    if (targetPath) {
      await execSvn('svn', ['revert', `${wcPath}/${targetPath}`])
    } else {
      await execSvn('svn', ['revert', '-R', wcPath])
    }
  })
}

// ═══ P2P 인증 포함 명령 (Phase 11) ═══

/** svn checkout (인증 포함) */
export async function checkoutWithAuth(
  svnUrl: string, wcPath: string, username: string, password: string
): Promise<void> {
  await execSvn('svn', [
    'checkout', svnUrl, wcPath,
    '--username', username, '--password', password,
    '--non-interactive', '--no-auth-cache', '--quiet'
  ])
}

/** svn info (인증 포함, 연결 확인용) */
export async function infoWithAuth(
  svnUrl: string, username: string, password: string
): Promise<SvnInfoEntry> {
  const { stdout } = await execSvn('svn', [
    'info', '--xml', svnUrl,
    '--username', username, '--password', password,
    '--non-interactive', '--no-auth-cache'
  ])
  return parseSvnInfoXml(stdout)
}

/** svn update (인증 포함) */
export async function updateWithAuth(
  wcPath: string, username: string, password: string
): Promise<{ updated: boolean }> {
  const { stdout } = await execSvn('svn', [
    'update', wcPath,
    '--username', username, '--password', password,
    '--non-interactive', '--no-auth-cache'
  ])
  const updated = !stdout.includes('At revision')
  return { updated }
}

/** svn resolve — 충돌 해결 */
export async function resolve(
  wcPath: string, filePath: string, accept: string
): Promise<void> {
  await execSvn('svn', [
    'resolve', '--accept', accept, `${wcPath}/${filePath}`
  ])
}

/** svn lock — P2P 파일 잠금 */
export async function svnLock(
  wcPath: string, filePath: string, comment: string = '',
  username?: string, password?: string
): Promise<void> {
  const args = ['lock', `${wcPath}/${filePath}`]
  if (comment) args.push('-m', comment)
  if (username) args.push('--username', username, '--password', password!, '--non-interactive', '--no-auth-cache')
  await execSvn('svn', args)
}

/** svn unlock — P2P 파일 잠금 해제 */
export async function svnUnlock(
  wcPath: string, filePath: string,
  username?: string, password?: string
): Promise<void> {
  const args = ['unlock', `${wcPath}/${filePath}`]
  if (username) args.push('--username', username, '--password', password!, '--non-interactive', '--no-auth-cache')
  await execSvn('svn', args)
}

// ═══ XML 파싱 ═══

export interface SvnListEntry {
  name: string
  kind: 'file' | 'dir'
  size: number
  revision: number
  author: string
  date: string
}

export interface SvnInfoEntry {
  path: string
  kind: 'file' | 'dir'
  url: string
  revision: number
  author: string
  date: string
  size: number
}

export interface SvnLogEntry {
  revision: number
  author: string
  date: string
  message: string
}

export interface SvnBlameEntry {
  lineNumber: number
  revision: number
  author: string
  line: string
}

export interface SvnStatusEntry {
  path: string
  status: 'modified' | 'added' | 'deleted' | 'unversioned' | 'missing' | 'conflicted'
}

/** svn list --xml 파싱 */
function parseSvnListXml(xml: string): SvnListEntry[] {
  const entries: SvnListEntry[] = []
  const entryRegex = /<entry\s+kind="(file|dir)">([\s\S]*?)<\/entry>/g
  let match: RegExpExecArray | null

  while ((match = entryRegex.exec(xml)) !== null) {
    const kind = match[1] as 'file' | 'dir'
    const block = match[2]
    entries.push({
      name: extractTag(block, 'name'),
      kind,
      size: kind === 'file' ? parseInt(extractTag(block, 'size') || '0', 10) : 0,
      revision: parseInt(extractAttr(block, 'commit', 'revision') || '0', 10),
      author: extractTag(block, 'author'),
      date: extractTag(block, 'date')
    })
  }
  return entries
}

/** svn info --xml 파싱 */
function parseSvnInfoXml(xml: string): SvnInfoEntry {
  return {
    path: extractTag(xml, 'relative-url') || extractTag(xml, 'path'),
    kind: (extractAttr(xml, 'entry', 'kind') || 'file') as 'file' | 'dir',
    url: extractTag(xml, 'url'),
    revision: parseInt(extractAttr(xml, 'entry', 'revision') || '0', 10),
    author: extractTag(xml, 'author'),
    date: extractTag(xml, 'date'),
    size: parseInt(extractTag(xml, 'size') || '0', 10)
  }
}

/** svn log --xml 파싱 */
function parseSvnLogXml(xml: string): SvnLogEntry[] {
  const entries: SvnLogEntry[] = []
  const logRegex = /<logentry\s+revision="(\d+)">([\s\S]*?)<\/logentry>/g
  let match: RegExpExecArray | null

  while ((match = logRegex.exec(xml)) !== null) {
    const block = match[2]
    entries.push({
      revision: parseInt(match[1], 10),
      author: extractTag(block, 'author'),
      date: extractTag(block, 'date'),
      message: extractTag(block, 'msg')
    })
  }
  return entries
}

/** svn blame --xml 파싱 */
function parseSvnBlameXml(xml: string): SvnBlameEntry[] {
  const entries: SvnBlameEntry[] = []
  const entryRegex = /<entry\s+line-number="(\d+)">([\s\S]*?)<\/entry>/g
  let match: RegExpExecArray | null

  while ((match = entryRegex.exec(xml)) !== null) {
    const block = match[2]
    entries.push({
      lineNumber: parseInt(match[1], 10),
      revision: parseInt(extractAttr(block, 'commit', 'revision') || '0', 10),
      author: extractTag(block, 'author'),
      line: '' // blame XML에는 줄 내용 없음, 별도 조회 필요
    })
  }
  return entries
}

/** svn status --xml 파싱 */
function parseSvnStatusXml(xml: string): SvnStatusEntry[] {
  const entries: SvnStatusEntry[] = []
  const entryRegex = /<entry\s+path="([^"]+)">([\s\S]*?)<\/entry>/g
  let match: RegExpExecArray | null

  const statusMap: Record<string, SvnStatusEntry['status']> = {
    modified: 'modified',
    added: 'added',
    deleted: 'deleted',
    unversioned: 'unversioned',
    missing: 'missing',
    conflicted: 'conflicted'
  }

  while ((match = entryRegex.exec(xml)) !== null) {
    const path = match[1]
    const block = match[2]
    const itemStatus = extractAttr(block, 'wc-status', 'item') || ''
    if (statusMap[itemStatus]) {
      entries.push({ path, status: statusMap[itemStatus] })
    }
  }
  return entries
}

// ═══ XML 유틸리티 ═══

/** XML 태그 내용 추출: <tag>content</tag> → content */
function extractTag(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))
  return match ? match[1].trim() : ''
}

/** XML 속성 추출: <tag attr="value"> → value */
function extractAttr(xml: string, tag: string, attr: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*\\s${attr}="([^"]*)"[^>]*>`))
  return match ? match[1] : ''
}
