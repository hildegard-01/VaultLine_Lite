import { readdirSync, statSync, existsSync } from 'fs'
import { join } from 'path'
import { shell, dialog } from 'electron'
import { handleIpc } from './index'
import * as InvitationService from '../services/InvitationService'
import * as RemoteRepoService from '../services/RemoteRepoService'
import * as SyncService from '../services/SyncService'
import * as SvnService from '../services/SvnService'
import { ServerConnectionService } from '../services/server/ServerConnectionService'
import { SvnProxyService } from '../services/server/SvnProxyService'
import { getDatabase } from '../services/DatabaseService'
import type { RemoteFileEntry } from '../../../shared/types/ipc'

/** E170013(소유자 오프라인) 에러를 사용자 친화적 메시지로 변환 */
function translateSvnError(err: unknown, serverShareId?: number | null): Error {
  const msg = err instanceof Error ? err.message : String(err)
  if (msg.includes('E170013')) {
    const relayMsg = serverShareId != null ? SvnProxyService.peekRelayError(serverShareId) : null
    const reason = relayMsg ?? '공유자 앱이 응답하지 않습니다. 공유자의 앱이 실행 중이고 서버에 연결되어 있는지 확인해 주세요.'
    return new Error(reason)
  }
  return err instanceof Error ? err : new Error(msg)
}

/**
 * 초대 + 원격 저장소 IPC 핸들러 (Phase 11.2)
 */

export function registerInvitationHandlers(): void {
  // 초대 생성
  handleIpc('invitation:create', (args) => {
    const { repoId, sharedUserId, expiryMinutes, oneTime } = args as {
      repoId: number; sharedUserId: number; expiryMinutes?: number; oneTime?: boolean
    }
    return InvitationService.createInvitation(repoId, sharedUserId, expiryMinutes, oneTime)
  })

  // 초대 목록
  handleIpc('invitation:list', (args) => {
    const { repoId } = args as { repoId: number }
    return InvitationService.listInvitations(repoId)
  })

  // 초대 검증
  handleIpc('invitation:validate', (args) => {
    const { token } = args as { token: string }
    return InvitationService.validateInvitation(token)
  })

  // 원격 저장소 수락 (게스트 측)
  handleIpc('remote-repo:accept', async (args) => {
    const { linkData } = args as { linkData: string }
    return RemoteRepoService.acceptInvitation(linkData)
  })

  // 원격 저장소 목록 (서버 연결 시 취소된 공유 자동 정리)
  handleIpc('remote-repo:list', async () => {
    if (ServerConnectionService.isAuthenticated()) {
      try {
        const client = ServerConnectionService.getClient()
        const res = await client.get('/shares/received', { params: { status: 'accepted', limit: 200 } })
        // ShareReceivedOut.id = Share.id = server_share_id
        const activeIds = new Set<number>(
          (res.data.items as Array<{ id: number }>).map((r) => r.id)
        )
        const db = getDatabase()
        const serverRepos = db.prepare(
          'SELECT id, server_share_id FROM remote_repos WHERE server_share_id IS NOT NULL'
        ).all() as Array<{ id: number; server_share_id: number }>
        for (const repo of serverRepos) {
          if (!activeIds.has(repo.server_share_id)) {
            RemoteRepoService.disconnect(repo.id)
          }
        }
      } catch { /* 서버 조회 실패 시 기존 목록 유지 */ }
    }
    return RemoteRepoService.listRemoteRepos()
  })

  // 원격 저장소 연결 해제
  handleIpc('remote-repo:disconnect', (args) => {
    const { id } = args as { id: number }
    RemoteRepoService.disconnect(id)
  })

  // 원격 저장소 상태 확인
  handleIpc('remote-repo:status', async (args) => {
    const { id } = args as { id: number }
    return RemoteRepoService.checkStatus(id)
  })

  // 원격 저장소 파일 목록 (로컬 wc_path 직접 읽기)
  handleIpc('remote-repo:file-list', (args) => {
    const { id, subPath } = args as { id: number; subPath?: string }
    const db = getDatabase()
    const repo = db.prepare('SELECT wc_path, file_path FROM remote_repos WHERE id = ?')
      .get(id) as { wc_path: string; file_path: string | null } | undefined
    if (!repo) throw new Error('원격 저장소를 찾을 수 없습니다.')

    // 단일 파일 공유: file_path가 있으면 해당 파일 하나만 반환
    if (repo.file_path) {
      const normalizedPath = repo.file_path.replace(/\\/g, '/')
      const fullPath = join(repo.wc_path, normalizedPath)
      if (!existsSync(fullPath)) return []
      try {
        const st = statSync(fullPath)
        const name = normalizedPath.split('/').pop() || normalizedPath
        return [{
          name,
          path: normalizedPath,
          type: 'file',
          size: st.size,
          modifiedAt: st.mtime.toISOString(),
        }] as RemoteFileEntry[]
      } catch {
        return []
      }
    }

    const baseDir = subPath ? join(repo.wc_path, subPath) : repo.wc_path
    if (!existsSync(baseDir)) return []

    const entries: RemoteFileEntry[] = []
    for (const name of readdirSync(baseDir)) {
      if (name === '.svn') continue
      const fullPath = join(baseDir, name)
      try {
        const st = statSync(fullPath)
        entries.push({
          name,
          path: subPath ? `${subPath}/${name}` : name,
          type: st.isDirectory() ? 'dir' : 'file',
          size: st.isDirectory() ? 0 : st.size,
          modifiedAt: st.mtime.toISOString(),
        })
      } catch { /* 접근 불가 파일 무시 */ }
    }
    return entries
  })

  // 원격 저장소 파일 열기 (shell.openPath)
  handleIpc('remote-repo:file-open', async (args) => {
    const { id, filePath } = args as { id: number; filePath: string }
    const db = getDatabase()
    const repo = db.prepare('SELECT wc_path FROM remote_repos WHERE id = ?')
      .get(id) as { wc_path: string } | undefined
    if (!repo) throw new Error('원격 저장소를 찾을 수 없습니다.')
    const fullPath = join(repo.wc_path, filePath)
    if (!existsSync(fullPath)) throw new Error('파일을 찾을 수 없습니다.')
    await shell.openPath(fullPath)
  })

  // 원격 저장소 동기화 (svn update)
  handleIpc('remote-repo:sync', async (args) => {
    const { id } = args as { id: number }
    const db = getDatabase()
    const repo = db.prepare('SELECT server_share_id FROM remote_repos WHERE id = ?')
      .get(id) as { server_share_id: number | null } | undefined
    try {
      const result = await SyncService.update(id)
      return { updated: result.updated }
    } catch (err) {
      throw translateSvnError(err, repo?.server_share_id ?? null)
    }
  })

  // 원격 파일 SVN 정보 (리비전, 작성자, 날짜)
  handleIpc('remote-repo:file-info', async (args) => {
    const { id, filePath } = args as { id: number; filePath: string }
    const db = getDatabase()
    const repo = db.prepare('SELECT wc_path, username, password_plain FROM remote_repos WHERE id = ?')
      .get(id) as { wc_path: string; username: string; password_plain: string } | undefined
    if (!repo) throw new Error('원격 저장소를 찾을 수 없습니다.')
    return SvnService.infoFileWithAuth(repo.wc_path, filePath, repo.username, repo.password_plain)
  })

  // 원격 파일 버전 이력
  handleIpc('remote-repo:file-log', async (args) => {
    const { id, filePath } = args as { id: number; filePath: string }
    const db = getDatabase()
    const repo = db.prepare('SELECT wc_path, username, password_plain FROM remote_repos WHERE id = ?')
      .get(id) as { wc_path: string; username: string; password_plain: string } | undefined
    if (!repo) throw new Error('원격 저장소를 찾을 수 없습니다.')
    return SvnService.logFileWithAuth(repo.wc_path, filePath, repo.username, repo.password_plain, 20)
  })

  // 원격 파일 리비전 간 Diff
  handleIpc('remote-repo:file-diff', async (args) => {
    const { id, filePath, rev1, rev2 } = args as { id: number; filePath: string; rev1: number; rev2: number }
    const db = getDatabase()
    const repo = db.prepare('SELECT wc_path, username, password_plain FROM remote_repos WHERE id = ?')
      .get(id) as { wc_path: string; username: string; password_plain: string } | undefined
    if (!repo) throw new Error('원격 저장소를 찾을 수 없습니다.')
    return SvnService.diffRevWithAuth(repo.wc_path, filePath, rev1, rev2, repo.username, repo.password_plain)
  })

  // 새 버전 업로드 (파일 선택 → 복사 → svn commit)
  handleIpc('remote-repo:file-upload', async (args) => {
    const { id, filePath, message } = args as { id: number; filePath: string; message: string }
    const db = getDatabase()
    const repo = db.prepare('SELECT wc_path, username, password_plain FROM remote_repos WHERE id = ?')
      .get(id) as { wc_path: string; username: string; password_plain: string } | undefined
    if (!repo) throw new Error('원격 저장소를 찾을 수 없습니다.')

    const { filePaths, canceled } = await dialog.showOpenDialog({
      properties: ['openFile'],
      title: '새 버전 파일 선택',
    })
    if (canceled || filePaths.length === 0) return null

    const newRevision = await SvnService.commitFileNewVersion(
      repo.wc_path, filePath, filePaths[0], message, repo.username, repo.password_plain
    )
    return { revision: newRevision }
  })

  // 수정된 파일 SVN 상태 조회 (M/A/? 등)
  handleIpc('remote-repo:file-status', async (args) => {
    const { id, filePath } = args as { id: number; filePath: string }
    const db = getDatabase()
    const repo = db.prepare('SELECT wc_path FROM remote_repos WHERE id = ?')
      .get(id) as { wc_path: string } | undefined
    if (!repo) throw new Error('원격 저장소를 찾을 수 없습니다.')
    const entry = await SvnService.statusFileWithAuth(repo.wc_path, filePath)
    return entry ? { status: entry.status } : { status: 'clean' }
  })

  // 수정된 파일 커밋
  handleIpc('remote-repo:file-commit', async (args) => {
    const { id, filePath, message } = args as { id: number; filePath: string; message: string }
    const db = getDatabase()
    const repo = db.prepare('SELECT wc_path, username, password_plain, server_share_id FROM remote_repos WHERE id = ?')
      .get(id) as { wc_path: string; username: string; password_plain: string; server_share_id: number | null } | undefined
    if (!repo) throw new Error('원격 저장소를 찾을 수 없습니다.')
    if (!message.trim()) throw new Error('커밋 메시지를 입력하세요.')
    try {
      const revision = await SvnService.commitWithAuth(
        repo.wc_path, message.trim(), [filePath], repo.username, repo.password_plain
      )
      return { revision }
    } catch (err) {
      throw translateSvnError(err, repo.server_share_id)
    }
  })

  // 수정된 파일 변경 폐기 (svn revert)
  handleIpc('remote-repo:file-revert', async (args) => {
    const { id, filePath } = args as { id: number; filePath: string }
    const db = getDatabase()
    const repo = db.prepare('SELECT wc_path FROM remote_repos WHERE id = ?')
      .get(id) as { wc_path: string } | undefined
    if (!repo) throw new Error('원격 저장소를 찾을 수 없습니다.')
    await SvnService.revert(repo.wc_path, filePath)
  })

  // WC 전체 파일 상태+리비전 일괄 조회
  handleIpc('remote-repo:wc-status', async (args) => {
    const { id } = args as { id: number }
    const db = getDatabase()
    const repo = db.prepare('SELECT wc_path FROM remote_repos WHERE id = ?')
      .get(id) as { wc_path: string } | undefined
    if (!repo) throw new Error('원격 저장소를 찾을 수 없습니다.')
    return SvnService.wcStatusVerbose(repo.wc_path)
  })

  // WC 전체 일괄 커밋
  handleIpc('remote-repo:batch-commit', async (args) => {
    const { id, message } = args as { id: number; message: string }
    const db = getDatabase()
    const repo = db.prepare('SELECT wc_path, username, password_plain, server_share_id FROM remote_repos WHERE id = ?')
      .get(id) as { wc_path: string; username: string; password_plain: string; server_share_id: number | null } | undefined
    if (!repo) throw new Error('원격 저장소를 찾을 수 없습니다.')
    if (!message.trim()) throw new Error('커밋 메시지를 입력하세요.')
    try {
      const revision = await SvnService.batchCommitWithAuth(repo.wc_path, message.trim(), repo.username, repo.password_plain)
      return { revision }
    } catch (err) {
      throw translateSvnError(err, repo.server_share_id)
    }
  })

  // WC 전체 변경 폐기
  handleIpc('remote-repo:batch-revert', async (args) => {
    const { id } = args as { id: number }
    const db = getDatabase()
    const repo = db.prepare('SELECT wc_path FROM remote_repos WHERE id = ?')
      .get(id) as { wc_path: string } | undefined
    if (!repo) throw new Error('원격 저장소를 찾을 수 없습니다.')
    await SvnService.revert(repo.wc_path) // targetPath 없음 = svn revert -R
  })
}
