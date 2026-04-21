import { join, basename } from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { copyFileSync, mkdirSync, statSync, readdirSync, existsSync } from 'fs'
import { getDatabase } from './DatabaseService'
import * as SvnService from './SvnService'
import { getSvnPath, getSvnEnv, toFileUrl } from './SvnPathHelper'
import type { Repository } from '@shared/types/ipc'
import { TRASH_DEFAULT_RETENTION_DAYS } from '@shared/constants'

const execFileAsync = promisify(execFile)

/**
 * FileManageService — 파일 CRUD + 복원
 *
 * 역할:
 * - 폴더 생성, 이름 변경, 이동, 삭제
 * - 삭제 시 휴지통 등록
 * - 이전 버전 복원 (svn merge -r REV:REV-1)
 * - 삭제된 파일 복원 (svn copy -r)
 */

function getRepoById(repoId: number): Repository {
  const db = getDatabase()
  const repo = db.prepare(`
    SELECT id, name, svn_path as svnPath, wc_path as wcPath
    FROM repositories WHERE id = ? AND status = 'active'
  `).get(repoId) as Repository | undefined
  if (!repo) throw new Error('저장소를 찾을 수 없습니다.')
  return repo
}

function logActivity(repoId: number, action: string, filePath?: string, revision?: number, detail?: string): void {
  const db = getDatabase()
  db.prepare(`
    INSERT INTO activity_log (repo_id, action, file_path, revision, detail, created_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(repoId, action, filePath || null, revision || null, detail || null)
}

/** 보호잠금 확인 — 잠긴 파일이면 에러 */
function checkProtectionLock(repoId: number, filePath: string): void {
  const db = getDatabase()
  const lock = db.prepare(
    'SELECT reason FROM file_locks WHERE repo_id = ? AND file_path = ?'
  ).get(repoId, filePath) as { reason: string } | undefined

  if (lock) {
    throw new Error(`보호 잠금 파일입니다: ${lock.reason || '잠금됨'}`)
  }
}

/** 폴더 생성 */
export async function createFolder(
  repoId: number,
  path: string,
  commitMessage: string
): Promise<void> {
  const repo = getRepoById(repoId)
  await SvnService.mkdir(repo.wcPath, path, commitMessage)
  logActivity(repoId, 'file.commit', path, undefined, '폴더 생성')
}

/** 이름 변경 */
export async function renameFile(
  repoId: number,
  oldPath: string,
  newName: string,
  commitMessage: string
): Promise<void> {
  const repo = getRepoById(repoId)
  checkProtectionLock(repoId, oldPath)

  const parentDir = oldPath.includes('/') ? oldPath.substring(0, oldPath.lastIndexOf('/')) : ''
  const newPath = parentDir ? `${parentDir}/${newName}` : newName

  await SvnService.rename(repo.wcPath, oldPath, newPath, commitMessage)

  // 태그/즐겨찾기 경로 갱신
  updatePathReferences(repoId, oldPath, newPath)
  logActivity(repoId, 'file.rename', newPath, undefined, `${oldPath} → ${newPath}`)
}

/** 파일/폴더 이동 */
export async function moveFile(
  repoId: number,
  srcPath: string,
  destPath: string,
  commitMessage: string
): Promise<void> {
  const repo = getRepoById(repoId)
  console.log(`[FileManage] 이동 요청: repoId=${repoId} src="${srcPath}" dest="${destPath}" wcPath="${repo.wcPath}"`)
  checkProtectionLock(repoId, srcPath)

  await SvnService.move(repo.wcPath, srcPath, destPath, commitMessage)

  updatePathReferences(repoId, srcPath, destPath)
  logActivity(repoId, 'file.move', destPath, undefined, `${srcPath} → ${destPath}`)
}

/** 파일/폴더 삭제 → 휴지통 */
export async function deleteFile(
  repoId: number,
  path: string,
  commitMessage: string
): Promise<void> {
  const repo = getRepoById(repoId)
  checkProtectionLock(repoId, path)

  // 현재 리비전 확인 (복원 시 필요)
  const fileInfo = await SvnService.info(repo.wcPath, path)
  const revision = fileInfo.revision

  // SVN 삭제 + 커밋
  await SvnService.remove(repo.wcPath, path, commitMessage)

  // 휴지통에 등록
  const db = getDatabase()
  const repoSettings = db.prepare(
    'SELECT trash_retention_days FROM repo_settings WHERE repo_id = ?'
  ).get(repoId) as { trash_retention_days: number } | undefined
  const retentionDays = repoSettings?.trash_retention_days || TRASH_DEFAULT_RETENTION_DAYS

  db.prepare(`
    INSERT INTO trash_items (repo_id, file_path, deleted_revision, original_size, expires_at)
    VALUES (?, ?, ?, ?, datetime('now', '+' || ? || ' days'))
  `).run(repoId, path, revision, fileInfo.size, retentionDays)

  // 태그/즐겨찾기 정리
  cleanupPathReferences(repoId, path)
  logActivity(repoId, 'file.delete', path, revision)
}

/** 이전 버전 복원 (svn merge -r REV:REV-1 → 새 리비전 생성) */
export async function restoreVersion(
  repoId: number,
  path: string,
  targetRevision: number,
  commitMessage: string
): Promise<{ revision: number }> {
  const repo = getRepoById(repoId)

  // svn merge로 특정 리비전의 내용을 현재로 가져오기
  const wcFilePath = `${repo.wcPath}/${path}`
  await SvnService.update(repo.wcPath)

  // svn merge -r HEAD:targetRevision 으로 되돌리기
  await execFileAsync(getSvnPath('svn'), [
    'merge', '-r', `HEAD:${targetRevision}`, wcFilePath
  ], { env: getSvnEnv(), windowsHide: true })

  const revision = await SvnService.commit(repo.wcPath, commitMessage, [wcFilePath])

  logActivity(repoId, 'file.restore', path, revision, `r${targetRevision}로 복원`)
  return { revision }
}

/** 삭제된 파일 복원 (svn copy -r REV URL WC_PATH) */
export async function restoreDeleted(
  repoId: number,
  trashItemId: number,
  commitMessage: string
): Promise<{ revision: number }> {
  const db = getDatabase()
  const repo = getRepoById(repoId)

  const trashItem = db.prepare(
    'SELECT file_path, deleted_revision FROM trash_items WHERE id = ? AND repo_id = ?'
  ).get(trashItemId, repoId) as { file_path: string; deleted_revision: number } | undefined

  if (!trashItem) throw new Error('휴지통 항목을 찾을 수 없습니다.')

  // svn copy -r {revision} {URL}/{path} {WC}/{path}
  const repoUrl = toFileUrl(repo.svnPath)
  const srcUrl = `${repoUrl}/${trashItem.file_path}@${trashItem.deleted_revision}`
  const destPath = join(repo.wcPath, trashItem.file_path)

  await execFileAsync(getSvnPath('svn'), [
    'copy', '-r', String(trashItem.deleted_revision), srcUrl, destPath
  ], { env: getSvnEnv(), windowsHide: true })

  const revision = await SvnService.commit(repo.wcPath, commitMessage, [destPath])

  // 휴지통에서 제거
  db.prepare('DELETE FROM trash_items WHERE id = ?').run(trashItemId)

  logActivity(repoId, 'file.undelete', trashItem.file_path, revision)
  return { revision }
}

/** 경로 참조 갱신 (이름 변경/이동 시) */
function updatePathReferences(repoId: number, oldPath: string, newPath: string): void {
  const db = getDatabase()
  // 태그
  db.prepare('UPDATE file_tags SET file_path = ? WHERE repo_id = ? AND file_path = ?')
    .run(newPath, repoId, oldPath)
  // 즐겨찾기
  db.prepare('UPDATE bookmarks SET file_path = ? WHERE repo_id = ? AND file_path = ?')
    .run(newPath, repoId, oldPath)
  // 보호잠금
  db.prepare('UPDATE file_locks SET file_path = ? WHERE repo_id = ? AND file_path = ?')
    .run(newPath, repoId, oldPath)
  // 하위 경로도 갱신 (폴더 이동 시)
  db.prepare(`UPDATE file_tags SET file_path = ? || substr(file_path, ?)
    WHERE repo_id = ? AND file_path LIKE ? || '/%'`)
    .run(newPath, oldPath.length + 1, repoId, oldPath)
  db.prepare(`UPDATE bookmarks SET file_path = ? || substr(file_path, ?)
    WHERE repo_id = ? AND file_path LIKE ? || '/%'`)
    .run(newPath, oldPath.length + 1, repoId, oldPath)
}

/** 경로 참조 정리 (삭제 시) */
function cleanupPathReferences(repoId: number, path: string): void {
  const db = getDatabase()
  // 정확히 일치하는 항목 + 하위 경로 항목 모두 삭제
  db.prepare("DELETE FROM file_tags WHERE repo_id = ? AND (file_path = ? OR file_path LIKE ? || '/%')")
    .run(repoId, path, path)
  db.prepare("DELETE FROM bookmarks WHERE repo_id = ? AND (file_path = ? OR file_path LIKE ? || '/%')")
    .run(repoId, path, path)
  db.prepare("DELETE FROM file_locks WHERE repo_id = ? AND (file_path = ? OR file_path LIKE ? || '/%')")
    .run(repoId, path, path)
}

/** 일괄 이동 (같은 저장소 내) — move()가 내부에서 개별 커밋 */
export async function bulkMove(
  repoId: number,
  srcPaths: string[],
  destFolder: string,
  commitMessage: string
): Promise<{ moved: number }> {
  const repo = getRepoById(repoId)
  let moved = 0

  for (const srcPath of srcPaths) {
    checkProtectionLock(repoId, srcPath)
    const fileName = basename(srcPath)
    const destPath = destFolder ? `${destFolder}/${fileName}` : fileName
    const msg = moved === 0 ? commitMessage : `${commitMessage} (${moved + 1}/${srcPaths.length})`

    await SvnService.move(repo.wcPath, srcPath, destPath, msg)
    updatePathReferences(repoId, srcPath, destPath)
    moved++
  }

  logActivity(repoId, 'file.move', destFolder, undefined, `${moved}개 파일 이동`)
  return { moved }
}

/** 저장소 간 파일 이동 (복사 → svn add → 커밋 → 원본 삭제) */
export async function crossRepoMove(
  srcRepoId: number,
  destRepoId: number,
  srcPaths: string[],
  destFolder: string,
  commitMessage: string
): Promise<{ moved: number }> {
  const srcRepo = getRepoById(srcRepoId)
  const destRepo = getRepoById(destRepoId)
  let moved = 0

  // 대상 저장소 최신화
  await SvnService.update(destRepo.wcPath)

  const addedRelPaths: string[] = []

  for (const srcPath of srcPaths) {
    checkProtectionLock(srcRepoId, srcPath)
    const fileName = basename(srcPath)
    const srcAbsPath = join(srcRepo.wcPath, srcPath)
    const destRelPath = destFolder ? `${destFolder}/${fileName}` : fileName
    const destAbsPath = join(destRepo.wcPath, destRelPath)

    // 대상 경로의 부모 디렉토리 확인
    const destDir = join(destRepo.wcPath, destFolder || '')
    if (!existsSync(destDir)) {
      mkdirSync(destDir, { recursive: true })
    }

    // 파일/폴더 복사 (작업복사본 → 작업복사본)
    const stat = statSync(srcAbsPath)
    if (stat.isDirectory()) {
      copyDirRecursive(srcAbsPath, destAbsPath)
    } else {
      copyFileSync(srcAbsPath, destAbsPath)
    }

    // svn add — 상대 경로 사용 (cwd가 wcPath이므로)
    addedRelPaths.push(destRelPath)
    moved++
  }

  // svn add (상대 경로)
  await SvnService.add(destRepo.wcPath, addedRelPaths)

  // 대상 저장소 커밋 (절대 경로)
  const addedAbsPaths = addedRelPaths.map(p => join(destRepo.wcPath, p))
  await SvnService.commit(destRepo.wcPath, commitMessage, addedAbsPaths)
  logActivity(destRepoId, 'file.upload', destFolder, undefined, `${moved}개 파일 (${srcRepo.name}에서 이동)`)

  // 원본 저장소에서 삭제 — remove()가 내부에서 개별 커밋
  for (const srcPath of srcPaths) {
    const deleteMsg = `${destRepo.name}으로 이동됨`
    await SvnService.remove(srcRepo.wcPath, srcPath, deleteMsg)
    cleanupPathReferences(srcRepoId, srcPath)
  }
  logActivity(srcRepoId, 'file.move', undefined, undefined, `${moved}개 파일 → ${destRepo.name}`)

  return { moved }
}

/** 디렉토리 재귀 복사 */
function copyDirRecursive(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true })
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    if (entry.name === '.svn') continue
    const srcChild = join(src, entry.name)
    const destChild = join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDirRecursive(srcChild, destChild)
    } else {
      copyFileSync(srcChild, destChild)
    }
  }
}
