import { join } from 'path'
import { mkdirSync, existsSync, rmSync, readdirSync, copyFileSync } from 'fs'
import { getDatabase, getAppDataDir } from './DatabaseService'
import * as SvnService from './SvnService'
import { DEFAULT_REPOS_DIR, DEFAULT_WORKCOPIES_DIR } from '@shared/constants'
import type { Repository, CreateRepoRequest, ImportRepoRequest } from '@shared/types/ipc'

/**
 * RepoService — 저장소 CRUD
 *
 * 역할:
 * - 저장소 생성 (svnadmin create + checkout + DB 등록)
 * - 기존 폴더 가져오기 (create + import + checkout)
 * - 저장소 삭제 (DB + 파일시스템)
 * - 저장소 목록/설정 조회·수정
 */

/** 저장소 루트 디렉토리 */
function getReposDir(): string {
  const dir = join(getAppDataDir(), DEFAULT_REPOS_DIR)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/** Working Copy 루트 디렉토리 */
function getWorkcopiesDir(): string {
  const dir = join(getAppDataDir(), DEFAULT_WORKCOPIES_DIR)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/** 안전한 디렉토리명 생성 (특수문자 제거) */
function sanitizeName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_').trim()
}

/** 저장소 목록 조회 */
export function listRepos(): Repository[] {
  const db = getDatabase()
  return db.prepare(`
    SELECT id, name, svn_path as svnPath, wc_path as wcPath, description,
           icon, display_order as displayOrder, created_at as createdAt,
           last_accessed as lastAccessed, status
    FROM repositories
    WHERE status = 'active'
    ORDER BY display_order, name
  `).all() as Repository[]
}

/** 저장소 생성 */
export async function createRepo(req: CreateRepoRequest): Promise<Repository> {
  const db = getDatabase()
  const dirName = sanitizeName(req.name)
  const svnPath = join(getReposDir(), dirName)
  const wcPath = join(getWorkcopiesDir(), dirName)

  // 중복 검사
  if (existsSync(svnPath)) {
    throw new Error(`이미 존재하는 저장소 경로입니다: ${dirName}`)
  }

  const existing = db.prepare('SELECT id FROM repositories WHERE name = ?').get(req.name)
  if (existing) {
    throw new Error(`이미 존재하는 저장소 이름입니다: ${req.name}`)
  }

  // 1. SVN 저장소 생성
  await SvnService.createRepo(svnPath)

  // 2. Working Copy 체크아웃
  await SvnService.checkout(svnPath, wcPath)

  // 3. DB 등록
  const result = db.prepare(`
    INSERT INTO repositories (name, svn_path, wc_path, description)
    VALUES (?, ?, ?, ?)
  `).run(req.name, svnPath, wcPath, req.description || '')

  const repoId = result.lastInsertRowid as number

  // 4. repo_settings 기본값 생성
  db.prepare(`
    INSERT INTO repo_settings (repo_id, folder_template)
    VALUES (?, ?)
  `).run(repoId, req.folderTemplate || 'empty')

  // 5. 초기 폴더 구조 생성 (선택)
  if (req.folderTemplate && req.folderTemplate !== 'empty') {
    await createInitialFolders(wcPath, req.folderTemplate, req.customFolders)
  }

  return getRepo(repoId)!
}

/** 기존 폴더 가져오기 (import) */
export async function importRepo(req: ImportRepoRequest): Promise<Repository> {
  const db = getDatabase()
  const dirName = sanitizeName(req.name)
  const svnPath = join(getReposDir(), dirName)
  const wcPath = join(getWorkcopiesDir(), dirName)

  if (!existsSync(req.sourcePath)) {
    throw new Error(`원본 폴더를 찾을 수 없습니다: ${req.sourcePath}`)
  }

  // 1. SVN 저장소 생성
  await SvnService.createRepo(svnPath)

  // 2. 빈 Working Copy 체크아웃
  await SvnService.checkout(svnPath, wcPath)

  // 3. 원본 파일 복사
  copyDirRecursive(req.sourcePath, wcPath)

  // 4. svn add + commit
  await SvnService.add(wcPath, ['.'])
  await SvnService.commit(wcPath, `기존 폴더 가져오기: ${req.name} 초기 커밋`)

  // 5. DB 등록
  const result = db.prepare(`
    INSERT INTO repositories (name, svn_path, wc_path, description)
    VALUES (?, ?, ?, ?)
  `).run(req.name, svnPath, wcPath, req.description || '')

  const repoId = result.lastInsertRowid as number
  db.prepare('INSERT INTO repo_settings (repo_id) VALUES (?)').run(repoId)

  return getRepo(repoId)!
}

/** 저장소 삭제 */
export function deleteRepo(id: number): void {
  const db = getDatabase()
  const repo = getRepo(id)
  if (!repo) throw new Error('저장소를 찾을 수 없습니다.')

  // 트랜잭션으로 DB 정리
  const cleanup = db.transaction(() => {
    // 종속 데이터 삭제 (CASCADE가 처리하지만 명시적으로)
    db.prepare('DELETE FROM file_tags WHERE repo_id = ?').run(id)
    db.prepare('DELETE FROM bookmarks WHERE repo_id = ?').run(id)
    db.prepare('DELETE FROM trash_items WHERE repo_id = ?').run(id)
    db.prepare('DELETE FROM file_locks WHERE repo_id = ?').run(id)
    db.prepare('DELETE FROM shares WHERE repo_id = ?').run(id)
    db.prepare('DELETE FROM search_metadata WHERE repo_id = ?').run(id)
    db.prepare('DELETE FROM preview_cache WHERE repo_id = ?').run(id)
    db.prepare('DELETE FROM activity_log WHERE repo_id = ?').run(id)
    db.prepare('DELETE FROM shared_users WHERE repo_id = ?').run(id)
    db.prepare('DELETE FROM svn_locks WHERE repo_id = ? AND repo_type = ?').run(id, 'local')
    db.prepare('DELETE FROM repo_settings WHERE repo_id = ?').run(id)
    db.prepare('DELETE FROM repositories WHERE id = ?').run(id)
  })
  cleanup()

  // 파일시스템 삭제
  if (existsSync(repo.wcPath)) {
    rmSync(repo.wcPath, { recursive: true, force: true })
  }
  if (existsSync(repo.svnPath)) {
    rmSync(repo.svnPath, { recursive: true, force: true })
  }
}

/** 저장소 설정 수정 */
export function updateRepo(id: number, updates: Partial<Repository>): Repository {
  const db = getDatabase()
  const repo = getRepo(id)
  if (!repo) throw new Error('저장소를 찾을 수 없습니다.')

  if (updates.name !== undefined) {
    db.prepare('UPDATE repositories SET name = ? WHERE id = ?').run(updates.name, id)
  }
  if (updates.description !== undefined) {
    db.prepare('UPDATE repositories SET description = ? WHERE id = ?').run(updates.description, id)
  }
  if (updates.icon !== undefined) {
    db.prepare('UPDATE repositories SET icon = ? WHERE id = ?').run(updates.icon, id)
  }
  if (updates.displayOrder !== undefined) {
    db.prepare('UPDATE repositories SET display_order = ? WHERE id = ?').run(updates.displayOrder, id)
  }

  // last_accessed 갱신
  db.prepare('UPDATE repositories SET last_accessed = CURRENT_TIMESTAMP WHERE id = ?').run(id)

  return getRepo(id)!
}

/** 저장소 통계 */
export async function getRepoStats(id: number): Promise<{ fileCount: number; totalSize: number; revisions: number }> {
  const repo = getRepo(id)
  if (!repo) throw new Error('저장소를 찾을 수 없습니다.')

  // 파일 목록으로 수 + 크기 계산
  const entries = await SvnService.list(repo.wcPath)
  let fileCount = 0
  let totalSize = 0
  for (const entry of entries) {
    if (entry.kind === 'file') {
      fileCount++
      totalSize += entry.size
    }
  }

  // 최신 리비전
  const logs = await SvnService.log(repo.wcPath, '', 1)
  const revisions = logs.length > 0 ? logs[0].revision : 0

  return { fileCount, totalSize, revisions }
}

/** ID로 저장소 조회 */
function getRepo(id: number): Repository | undefined {
  const db = getDatabase()
  return db.prepare(`
    SELECT id, name, svn_path as svnPath, wc_path as wcPath, description,
           icon, display_order as displayOrder, created_at as createdAt,
           last_accessed as lastAccessed, status
    FROM repositories WHERE id = ?
  `).get(id) as Repository | undefined
}

/** 초기 폴더 구조 생성 */
async function createInitialFolders(
  wcPath: string,
  template: string,
  customFolders?: string[]
): Promise<void> {
  const folders: string[] = []

  switch (template) {
    case 'business':
      folders.push('01_진행중', '02_완료', '03_참고자료')
      break
    case 'project':
      folders.push('docs', 'design', 'reports')
      break
    case 'custom':
      if (customFolders) folders.push(...customFolders)
      break
  }

  if (folders.length > 0) {
    for (const folder of folders) {
      await SvnService.mkdir(wcPath, folder, `초기 폴더 생성: ${folder}`)
    }
  }
}

/** 디렉토리 재귀 복사 (.svn 제외) */
function copyDirRecursive(src: string, dest: string): void {
  const entries = readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === '.svn') continue
    const srcPath = join(src, entry.name)
    const destPath = join(dest, entry.name)
    if (entry.isDirectory()) {
      mkdirSync(destPath, { recursive: true })
      copyDirRecursive(srcPath, destPath)
    } else {
      copyFileSync(srcPath, destPath)
    }
  }
}
