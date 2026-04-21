import { join, basename, dirname } from 'path'
import { copyFileSync, existsSync } from 'fs'
import { getDatabase } from './DatabaseService'
import * as SvnService from './SvnService'
import { getLockStatus, applyAutoLockRules } from './LockService'
import type { Repository, CommitLogEntry, CommitLogRequest } from '@shared/types/ipc'

/**
 * CommitService — 커밋/이력/Diff 서비스
 *
 * 역할:
 * - 파일 업로드 + SVN 커밋 (단일/다중)
 * - 기존 파일 새 버전 업로드
 * - 커밋 이력 조회 (svn log)
 * - Diff 조회 (svn diff)
 * - 변경 되돌리기 (svn revert)
 */

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

/** 활동 로그 기록 */
function logActivity(repoId: number, action: string, filePath?: string, revision?: number, detail?: string): void {
  const db = getDatabase()
  db.prepare(`
    INSERT INTO activity_log (repo_id, action, file_path, revision, detail, created_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(repoId, action, filePath || null, revision || null, detail || null)
}

/**
 * 파일 업로드 + 커밋
 * 외부 파일을 WC에 복사 → svn add → svn commit
 */
export async function uploadAndCommit(
  repoId: number,
  targetPath: string,
  filePaths: string[],
  commitMessage: string
): Promise<{ revision: number }> {
  const repo = getRepoById(repoId)
  const wcDestDir = targetPath ? join(repo.wcPath, targetPath) : repo.wcPath

  // 대상 디렉토리 존재 확인
  if (!existsSync(wcDestDir)) {
    throw new Error(`대상 경로를 찾을 수 없습니다: ${targetPath}`)
  }

  // 대상 폴더에 보호잠금이 걸려 있으면 업로드 차단
  if (targetPath) {
    const lockInfo = getLockStatus(repoId, targetPath)
    if (lockInfo?.locked) {
      throw new Error(`보호 잠금 폴더입니다: ${lockInfo.reason || '잠금됨'}`)
    }
  }

  const addedFiles: string[] = []

  for (const srcPath of filePaths) {
    if (!existsSync(srcPath)) {
      throw new Error(`파일을 찾을 수 없습니다: ${srcPath}`)
    }
    const fileName = basename(srcPath)
    const destPath = join(wcDestDir, fileName)

    // 기존 파일이면 보호잠금 검사
    const relPath = targetPath ? `${targetPath}/${fileName}` : fileName
    const fileLock = getLockStatus(repoId, relPath)
    if (fileLock?.locked) {
      throw new Error(`보호 잠금 파일입니다 (${fileName}): ${fileLock.reason || '잠금됨'}`)
    }

    // WC에 복사
    copyFileSync(srcPath, destPath)
    addedFiles.push(destPath)
  }

  // svn add — 이미 버전 관리 중인 파일 에러만 무시, 그 외 에러는 전파
  for (const f of addedFiles) {
    try {
      await SvnService.add(repo.wcPath, [f])
    } catch (e) {
      const msg = (e as Error).message || ''
      if (!msg.includes('already under version control') && !msg.includes('이미 버전 관리')) {
        throw new Error(`파일 추가 실패 (${f}): ${msg}`)
      }
    }
  }

  // svn commit
  const finalRevision = await SvnService.commit(repo.wcPath, commitMessage, addedFiles)

  if (finalRevision === 0) {
    throw new Error('파일 내용이 기존과 동일하여 새 버전이 생성되지 않았습니다.')
  }

  // 활동 로그
  for (const filePath of filePaths) {
    const relPath = targetPath ? `${targetPath}/${basename(filePath)}` : basename(filePath)
    logActivity(repoId, 'file.upload', relPath, finalRevision)
  }

  // 검색 인덱스 갱신 (파일명 + 커밋 메시지)
  updateSearchIndex(repoId, filePaths.map(f => basename(f)), targetPath, finalRevision, commitMessage)

  // 자동 잠금 규칙 적용 (커밋 완료 후)
  for (const srcPath of filePaths) {
    const relPath = targetPath ? `${targetPath}/${basename(srcPath)}` : basename(srcPath)
    applyAutoLockRules(repoId, relPath)
  }

  // 서버 동기화 hook (커넥티드 모드일 때만)
  try {
    const { RepoSyncService } = require('./server/RepoSyncService')
    RepoSyncService.pushCommit({
      repoId, revision: finalRevision, author: 'local',
      message: commitMessage, date: new Date().toISOString(),
      changedFiles: filePaths.map(f => ({ action: 'A', path: targetPath ? `${targetPath}/${basename(f)}` : basename(f), size: 0 })),
      fileTreeSnapshot: [],
    })
  } catch { /* 서버 미연결 시 무시 */ }

  return { revision: finalRevision }
}

/**
 * 새 버전 업로드 (기존 파일 덮어쓰기)
 * 이미 WC에 존재하는 파일을 새 내용으로 교체 + 커밋
 */
export async function uploadNewVersion(
  repoId: number,
  filePath: string,
  srcPath: string,
  commitMessage: string
): Promise<{ revision: number }> {
  const repo = getRepoById(repoId)
  const wcFilePath = join(repo.wcPath, filePath)

  if (!existsSync(wcFilePath)) {
    throw new Error(`대상 파일을 찾을 수 없습니다: ${filePath}`)
  }

  // 보호잠금 검사
  const lockInfo = getLockStatus(repoId, filePath)
  if (lockInfo?.locked) {
    throw new Error(`보호 잠금 파일입니다: ${lockInfo.reason || '잠금됨'}`)
  }

  // 파일 덮어쓰기
  copyFileSync(srcPath, wcFilePath)

  // svn commit (이미 버전 관리 중이므로 add 불필요)
  const revision = await SvnService.commit(repo.wcPath, commitMessage, [wcFilePath])

  logActivity(repoId, 'file.commit', filePath, revision)
  updateSearchIndex(repoId, [basename(filePath)], dirname(filePath), revision, commitMessage)

  // 자동 잠금 규칙 적용
  applyAutoLockRules(repoId, filePath)

  return { revision }
}

/** 커밋 이력 조회 */
export async function getCommitLog(req: CommitLogRequest): Promise<CommitLogEntry[]> {
  const repo = getRepoById(req.repoId)
  const entries = await SvnService.log(repo.wcPath, req.path || '', req.limit || 50, repo.svnPath)

  return entries.map((e) => ({
    revision: e.revision,
    author: e.author,
    date: e.date,
    message: e.message
  }))
}

/** Diff 조회 (두 리비전 간 차이) */
export async function getDiff(
  repoId: number,
  path: string,
  rev1: number,
  rev2: number
): Promise<string> {
  const repo = getRepoById(repoId)
  return await SvnService.diff(repo.wcPath, path, rev1, rev2)
}

/** 변경 되돌리기 (svn revert) */
export async function discardChanges(repoId: number, path?: string): Promise<void> {
  const repo = getRepoById(repoId)
  await SvnService.revert(repo.wcPath, path)
}

/** 검색 인덱스 갱신 (파일명 + 커밋 메시지) */
function updateSearchIndex(
  repoId: number,
  fileNames: string[],
  dirPath: string,
  revision: number,
  commitMessage: string
): void {
  const db = getDatabase()

  const upsertMeta = db.prepare(`
    INSERT INTO search_metadata (repo_id, file_path, revision, file_name, commit_message, indexed_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(repo_id, file_path) DO UPDATE SET
      revision = excluded.revision,
      file_name = excluded.file_name,
      commit_message = excluded.commit_message,
      indexed_at = CURRENT_TIMESTAMP
  `)

  const upsertIndex = db.prepare(`
    INSERT INTO search_index (repo_id, file_path, revision, file_name, commit_message, content_text)
    VALUES (?, ?, ?, ?, ?, '')
  `)

  const update = db.transaction(() => {
    for (const fileName of fileNames) {
      const filePath = dirPath ? `${dirPath}/${fileName}` : fileName
      upsertMeta.run(repoId, filePath, revision, fileName, commitMessage)

      // FTS5에는 UPSERT가 없으므로 DELETE → INSERT
      try {
        db.prepare('DELETE FROM search_index WHERE repo_id = ? AND file_path = ?').run(repoId, filePath)
        upsertIndex.run(repoId, filePath, revision, fileName, commitMessage)
      } catch (e) {
        console.error('[Search] FTS5 인덱싱 실패:', filePath, e)
      }
    }
  })
  update()
}
