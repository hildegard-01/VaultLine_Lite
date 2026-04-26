import { watch } from 'chokidar'
import type { FSWatcher } from 'chokidar'
import { basename } from 'path'
import { BrowserWindow } from 'electron'
import { getDatabase } from './DatabaseService'
import * as SvnService from './SvnService'
import { applyAutoTags } from './TagService'
import { FILE_WATCH_DEBOUNCE_MS, AUTO_COMMIT_DELAY_MS } from '@shared/constants'
import type { PendingChange, Repository } from '@shared/types/ipc'

/**
 * FileWatcherService — 더블클릭 편집 파일 감시 (REQ-007)
 *
 * 역할:
 * - 더블클릭으로 열린 파일을 chokidar로 감시
 * - 변경 감지 시 Pending Changes 목록 관리
 * - Main → Renderer IPC 이벤트 전송 ('watcher:changed')
 * - 자동 커밋 모드 지원 (설정 가능 지연)
 * - 일괄 커밋/폐기 지원
 */

// 감시 중인 파일 정보
interface WatchEntry {
  repoId: number
  filePath: string      // 저장소 상대 경로
  fullPath: string      // WC 절대 경로
  wcPath: string        // 저장소 WC 루트 경로
}

// 감시 중인 파일과 Pending 변경 목록
const _watchEntries = new Map<string, WatchEntry>() // fullPath → WatchEntry
const _pendingChanges = new Map<string, PendingChange>() // fullPath → PendingChange
let _watcher: FSWatcher | null = null
let _autoCommitTimers = new Map<string, ReturnType<typeof setTimeout>>()

/** 저장소 조회 헬퍼 */
function getRepoById(repoId: number): Repository {
  const db = getDatabase()
  const repo = db.prepare(`
    SELECT id, name, svn_path as svnPath, wc_path as wcPath
    FROM repositories WHERE id = ? AND status = 'active'
  `).get(repoId) as Repository | undefined
  if (!repo) throw new Error('저장소를 찾을 수 없습니다.')
  return repo
}

/** Main → Renderer 이벤트 전송 */
function notifyRenderer(channel: string, data?: unknown): void {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, data)
    }
  }
}

/** chokidar 감시자 초기화 (lazy) */
function ensureWatcher(): FSWatcher {
  if (_watcher) return _watcher

  _watcher = watch([], {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: FILE_WATCH_DEBOUNCE_MS,
      pollInterval: 500
    },
    // .svn 폴더 무시
    ignored: /(^|[/\\])\.svn([/\\]|$)/
  })

  _watcher.on('change', (changedPath: string) => {
    handleFileChange(changedPath)
  })

  return _watcher
}

/** 파일 변경 감지 핸들러 */
function handleFileChange(fullPath: string): void {
  // 정규화
  const normalizedPath = fullPath.replace(/\\/g, '/')
  const entry = findWatchEntry(normalizedPath)
  if (!entry) return

  // 이미 Pending이면 시간만 갱신
  const pending: PendingChange = {
    repoId: entry.repoId,
    filePath: entry.filePath,
    fileName: basename(entry.filePath),
    changeType: 'modified',
    detectedAt: new Date().toISOString()
  }
  _pendingChanges.set(fullPath, pending)

  // Renderer에 알림
  notifyRenderer('watcher:changed', getPendingList())

  // 자동 커밋 모드 처리
  handleAutoCommit(fullPath, entry)
}

/** 자동 커밋 (설정에 따라) */
function handleAutoCommit(fullPath: string, entry: WatchEntry): void {
  const db = getDatabase()
  const setting = db.prepare(
    "SELECT value FROM app_settings WHERE key = 'autoCommit'"
  ).get() as { value: string } | undefined

  if (setting?.value !== '1' && setting?.value !== 'true') return

  // 기존 타이머 취소
  const existingTimer = _autoCommitTimers.get(fullPath)
  if (existingTimer) clearTimeout(existingTimer)

  // 지연 후 자동 커밋
  const delaySetting = db.prepare(
    "SELECT value FROM app_settings WHERE key = 'autoCommitDelay'"
  ).get() as { value: string } | undefined
  const delay = delaySetting ? Number(delaySetting.value) * 1000 : AUTO_COMMIT_DELAY_MS

  const timer = setTimeout(async () => {
    _autoCommitTimers.delete(fullPath)
    try {
      await commitPendingFiles(entry.repoId, [entry.filePath], `자동 커밋: ${basename(entry.filePath)}`)
    } catch {
      // 자동 커밋 실패는 무시 (사용자가 수동으로 처리)
    }
  }, delay)

  _autoCommitTimers.set(fullPath, timer)
}

/** WatchEntry 검색 (경로 정규화 대응) */
function findWatchEntry(normalizedPath: string): WatchEntry | undefined {
  for (const [key, entry] of _watchEntries) {
    if (key.replace(/\\/g, '/') === normalizedPath || key === normalizedPath) {
      return entry
    }
  }
  return undefined
}

// ─── 외부 API ───

/** 파일 감시 시작 (더블클릭 편집 시 호출) */
export function startWatching(repoId: number, filePath: string): void {
  const repo = getRepoById(repoId)
  const { join } = require('path')
  const fullPath = join(repo.wcPath, filePath)

  // 이미 감시 중이면 무시
  if (_watchEntries.has(fullPath)) return

  const entry: WatchEntry = {
    repoId,
    filePath,
    fullPath,
    wcPath: repo.wcPath
  }
  _watchEntries.set(fullPath, entry)

  const watcher = ensureWatcher()
  watcher.add(fullPath)
}

/** 특정 파일 감시 중지 */
export function stopWatching(fullPath: string): void {
  _watchEntries.delete(fullPath)
  _pendingChanges.delete(fullPath)

  const timer = _autoCommitTimers.get(fullPath)
  if (timer) {
    clearTimeout(timer)
    _autoCommitTimers.delete(fullPath)
  }

  if (_watcher) {
    _watcher.unwatch(fullPath)
  }

  notifyRenderer('watcher:changed', getPendingList())
}

/** Pending Changes 목록 반환 */
export function getPendingList(): PendingChange[] {
  return Array.from(_pendingChanges.values())
}

/** 미커밋 변경 있는지 확인 */
export function hasPendingChanges(): boolean {
  return _pendingChanges.size > 0
}

/** 선택한 파일들 커밋 */
export async function commitPendingFiles(
  repoId: number,
  filePaths: string[],
  commitMessage: string
): Promise<{ revision: number }> {
  const repo = getRepoById(repoId)
  const { join } = require('path')

  const wcPaths = filePaths.map(fp => join(repo.wcPath, fp))

  // SVN 커밋
  const revision = await SvnService.commit(repo.wcPath, commitMessage, wcPaths)

  // 활동 로그
  const db = getDatabase()
  for (const fp of filePaths) {
    db.prepare(`
      INSERT INTO activity_log (repo_id, action, file_path, revision, detail, created_at)
      VALUES (?, 'file.commit', ?, ?, '더블클릭 편집 커밋', CURRENT_TIMESTAMP)
    `).run(repoId, fp, revision)
  }

  // 자동 태그 규칙 적용
  for (const fp of filePaths) {
    applyAutoTags(repoId, fp)
  }

  // Pending에서 제거 + 감시 중지
  for (const fp of filePaths) {
    const fullPath = join(repo.wcPath, fp)
    _pendingChanges.delete(fullPath)
    stopWatching(fullPath)
  }

  notifyRenderer('watcher:changed', getPendingList())
  return { revision }
}

/** 선택한 파일들 변경 폐기 (svn revert) */
export async function discardPendingFiles(
  repoId: number,
  filePaths: string[]
): Promise<void> {
  const repo = getRepoById(repoId)
  const { join } = require('path')

  for (const fp of filePaths) {
    await SvnService.revert(repo.wcPath, fp)
    const fullPath = join(repo.wcPath, fp)
    _pendingChanges.delete(fullPath)
    stopWatching(fullPath)
  }

  notifyRenderer('watcher:changed', getPendingList())
}

/** 전체 감시 정리 (앱 종료 시) */
export async function closeAll(): Promise<void> {
  // 자동 커밋 타이머 모두 취소
  for (const timer of _autoCommitTimers.values()) {
    clearTimeout(timer)
  }
  _autoCommitTimers.clear()

  // chokidar 종료
  if (_watcher) {
    await _watcher.close()
    _watcher = null
  }

  _watchEntries.clear()
  _pendingChanges.clear()
}
