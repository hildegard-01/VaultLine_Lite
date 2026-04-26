/**
 * ServerShareService — 서버 공유 링크 프록시
 *
 * 서버 API 경로 (VaultLine_Server 기준):
 *   GET  /users                  — 사용자 목록 (items: UserOut[])
 *   POST /shares                 — 공유 생성
 *   GET  /shares                 — 내가 만든 공유 목록
 *   GET  /shares/received        — 나에게 공유된 목록 (status 필터)
 *   DELETE /shares/{id}          — 공유 삭제 (소유자)
 *   DELETE /shares/{id}/recipient — 공유 해제 (수신자)
 *   POST /shares/{id}/accept     — 공유 수락
 *   POST /shares/{id}/reject     — 공유 거절
 */

import { randomBytes } from 'crypto'
import { ServerConnectionService } from './ServerConnectionService'
import { modeManager } from './ModeManager'
import { wsService } from './WsService'
import { SvnProxyService } from './SvnProxyService'
import { getDatabase } from '../DatabaseService'
import * as SharedUserService from '../SharedUserService'
import * as SvnServeService from '../SvnServeService'
import { addFromServerShare, disconnect as disconnectRemoteRepo, listRemoteRepos } from '../RemoteRepoService'
import type { ServerShareItem, ServerReceivedShareItem, ServerUser, ShareRecipientItem } from '../../../shared/types/ipc'

/** 세션 내 로컬 repoId → 서버 repoId 캐시 */
const _repoIdCache = new Map<number, number>()

export const ServerShareService = {
  /** 서버에 등록된 사용자 목록 조회 (자기 자신 제외) */
  async getUserList(): Promise<ServerUser[]> {
    if (!modeManager.isConnected()) return []
    const client = ServerConnectionService.getClient()
    const res = await client.get('/users')
    const items: Array<{ id: number; username: string; display_name: string | null; is_online?: boolean }> =
      res.data.items ?? []
    const me = ServerConnectionService.getUserInfo()
    return items
      .filter(u => u.id !== me.userId)
      .map(u => ({
        id: u.id,
        username: u.username,
        displayName: u.display_name ?? u.username,
        isOnline: u.is_online ?? false,
      }))
  },

  /**
   * 파일 공유 생성 (소유자 측)
   * 1. SVN 사용자 생성 → svnserve 시작 → 서버에 공유 등록
   * 2. 서버에서 share_id 받은 후 shared_users.server_share_id 업데이트
   */
  async createShare(
    repoId: number,
    filePath: string,
    permission: 'r' | 'rw',
    recipientIds: number[],
    expiresAt?: string
  ): Promise<ServerShareItem> {
    if (!modeManager.isConnected()) throw new Error('서버에 연결되지 않았습니다.')
    const serverRepoId = await _resolveServerRepoId(repoId)

    // SVN 사용자 생성 (공유 전용 랜덤 계정)
    const svnUsername = `share_${randomBytes(4).toString('hex')}`
    const svnPassword = randomBytes(8).toString('hex')
    const svnUser = SharedUserService.createUser(repoId, svnUsername, '서버공유', svnPassword, permission, filePath || undefined)

    // svnserve 시작 (이미 실행 중이면 현재 상태 반환)
    const svnStatus = await SvnServeService.start(repoId)
    const ip = SvnServeService.getLocalIpAddress()
    const svnserveUrl = `svn://${ip}:${svnStatus.port}`

    try {
      const client = ServerConnectionService.getClient()
      const res = await client.post('/shares', {
        repo_id: serverRepoId,
        file_path: filePath || null,
        permission,
        recipient_user_ids: recipientIds,
        expires_at: expiresAt || null,
        svnserve_url: svnserveUrl,
        svn_username: svnUsername,
        svn_password_plain: svnPassword,
      })

      // 서버에서 받은 share_id를 shared_users에 저장
      const shareId: number = res.data.id
      const db = getDatabase()
      db.prepare('UPDATE shared_users SET server_share_id = ? WHERE id = ?')
        .run(shareId, svnUser.id)

      // WS provider 등록 (이미 연결된 경우)
      wsService.send({ type: 'svn_register_provider', share_ids: [shareId] })

      return _toShareItem(res.data)
    } catch (err) {
      // 실패 시 생성한 SVN 사용자 롤백
      try { SharedUserService.deleteUser(svnUser.id) } catch { /* 무시 */ }
      throw err
    }
  },

  /** 내가 만든 공유 목록 */
  async listShares(): Promise<{ sent: ServerShareItem[]; received: ServerShareItem[] }> {
    if (!modeManager.isConnected()) return { sent: [], received: [] }
    const client = ServerConnectionService.getClient()
    const sentRes = await client.get('/shares')
    const sent: ServerShareItem[] = (sentRes.data.items ?? []).map(_toShareItem)
    return { sent, received: [] }
  },

  /** 나에게 공유된 목록 (status: pending/accepted/rejected) */
  async listReceivedShares(status?: 'pending' | 'accepted' | 'rejected'): Promise<ServerReceivedShareItem[]> {
    if (!modeManager.isConnected()) return []
    const client = ServerConnectionService.getClient()
    const params = status ? { status } : {}
    const res = await client.get('/shares/received', { params })
    return (res.data.items ?? []).map((r: any): ServerReceivedShareItem => ({
      id: r.id,
      repoId: r.repo_id,
      filePath: r.file_path ?? null,
      permission: r.permission ?? 'r',
      expiresAt: r.expires_at ?? null,
      isActive: r.is_active ?? true,
      createdAt: r.created_at ?? '',
      ownerUserId: r.created_by ?? 0,
      ownerDisplayName: r.creator_name ?? null,
      myStatus: r.my_status ?? 'pending',
      respondedAt: r.responded_at ?? null,
    }))
  },

  /**
   * 공유 수락 (수신자 측)
   * 서버에서 svnserve 접속 정보를 받아 로컬 remote_repo로 등록.
   * SVN 체크아웃 실패 시 서버 상태를 롤백(reject)하고 에러를 throw한다.
   */
  async acceptShare(shareId: number): Promise<{ status: string }> {
    if (!modeManager.isConnected()) throw new Error('서버에 연결되지 않았습니다.')
    const client = ServerConnectionService.getClient()
    const res = await client.post(`/shares/${shareId}/accept`)
    const data = res.data

    // svnserve 접속 정보가 있으면 릴레이 프록시 경유 원격 저장소 등록
    if (data.svn_username && data.svn_password_plain) {
      const permission: 'r' | 'rw' = data.permission === 'rw' ? 'rw' : 'r'
      const displayName = data.creator_name
        ? `${data.creator_name}의 공유`
        : `공유 저장소 #${shareId}`

      let proxyStarted = false
      try {
        const proxyPort = await SvnProxyService.startProxy(shareId)
        proxyStarted = true
        const checkoutUrl = `svn://127.0.0.1:${proxyPort}`

        await addFromServerShare({
          svnserveUrl: checkoutUrl,
          svnUsername: data.svn_username,
          svnPasswordPlain: data.svn_password_plain,
          permission,
          ownerName: data.creator_name ?? null,
          serverShareId: shareId,
          displayName,
          filePath: data.file_path ?? undefined,
        })
      } catch (err) {
        // 프록시 정리
        if (proxyStarted) SvnProxyService.stopProxy(shareId)
        // 서버 상태 롤백 — pending으로 복원 (거절이 아님)
        try { await client.post(`/shares/${shareId}/undo-accept`) } catch { /* 롤백 실패 무시 */ }
        // 소유자가 svn_relay_error로 보낸 이유가 있으면 우선 사용
        const relayReason = SvnProxyService.getAndClearError(shareId)
        const reason = relayReason || (err instanceof Error ? err.message : String(err))
        throw new Error(`공유 저장소 연결 실패: ${reason}`)
      }
    }

    return { status: data.status ?? 'accepted' }
  },

  /** 공유 거절 (수신자 측) */
  async rejectShare(shareId: number): Promise<{ status: string }> {
    if (!modeManager.isConnected()) throw new Error('서버에 연결되지 않았습니다.')
    const client = ServerConnectionService.getClient()
    const res = await client.post(`/shares/${shareId}/reject`)
    return { status: res.data.status ?? 'rejected' }
  },

  /**
   * 공유 삭제 (소유자 측)
   * SVN 사용자 삭제 → (사용자 없으면 svnserve 중지) → 서버 공유 삭제
   */
  async revokeShare(shareId: number): Promise<void> {
    if (!modeManager.isConnected()) throw new Error('서버에 연결되지 않았습니다.')

    const db = getDatabase()
    const svnUser = db.prepare(
      'SELECT id, repo_id FROM shared_users WHERE server_share_id = ?'
    ).get(shareId) as { id: number; repo_id: number } | undefined

    if (svnUser) {
      SharedUserService.deleteUser(svnUser.id)
      // 해당 저장소에 남은 공유 사용자가 없으면 svnserve 중지
      const remaining = db.prepare(
        'SELECT COUNT(*) as cnt FROM shared_users WHERE repo_id = ? AND is_active = 1'
      ).get(svnUser.repo_id) as { cnt: number }
      if (remaining.cnt === 0) {
        SvnServeService.stop(svnUser.repo_id)
      }
    }

    // 수신자 측 프록시 중지 (자신이 수신자인 경우)
    SvnProxyService.stopProxy(shareId)

    const client = ServerConnectionService.getClient()
    await client.delete(`/shares/${shareId}`)
  },

  /** 공유 해제 (수신자 측) — ShareRecipient 레코드 삭제 */
  async leaveShare(shareId: number): Promise<void> {
    if (!modeManager.isConnected()) throw new Error('서버에 연결되지 않았습니다.')
    const client = ServerConnectionService.getClient()
    await client.delete(`/shares/${shareId}/recipient`)
  },

  /**
   * 서버에서 WS share_revoked 수신 시 호출 — 해당 remote_repo 정리
   */
  handleShareRevoked(shareId: number): void {
    const repos = listRemoteRepos()
    const target = repos.find(r => r.serverShareId === shareId)
    if (target) {
      try { disconnectRemoteRepo(target.id) } catch { /* 무시 */ }
    }
  },
}

/**
 * 로컬 repoId → 서버 repos_registry.id 변환
 * 캐시 HIT → 즉시 반환 / MISS → GET /repos 조회 후 없으면 POST /repos 등록
 */
async function _resolveServerRepoId(localRepoId: number): Promise<number> {
  if (_repoIdCache.has(localRepoId)) return _repoIdCache.get(localRepoId)!

  const db = getDatabase()
  const row = db.prepare('SELECT name, description FROM repositories WHERE id = ?').get(localRepoId) as
    | { name: string; description: string }
    | undefined
  if (!row) throw new Error(`로컬 저장소 ID ${localRepoId}를 찾을 수 없습니다.`)

  const client = ServerConnectionService.getClient()

  // 서버 저장소 목록에서 이름 일치 항목 탐색
  const listRes = await client.get('/repos')
  const found = (listRes.data.items ?? []).find((r: any) => r.name === row.name)
  if (found) {
    _repoIdCache.set(localRepoId, found.id)
    return found.id
  }

  // 없으면 등록
  const regRes = await client.post('/repos', {
    name: row.name,
    description: row.description || '',
    type: 'personal',
  })
  const serverId: number = regRes.data.id
  _repoIdCache.set(localRepoId, serverId)
  return serverId
}

/** 서버 ShareOut → 클라이언트 ServerShareItem 변환 */
function _toShareItem(s: any): ServerShareItem {
  const recipients: ShareRecipientItem[] = Array.isArray(s.recipients)
    ? s.recipients.map((r: any) => ({
        userId: r.user_id,
        username: r.username ?? '',
        displayName: r.username ?? '',
        status: (r.status as 'pending' | 'accepted' | 'rejected') ?? 'pending',
        accessedAt: r.accessed_at ?? null,
      }))
    : []

  return {
    id: s.id,
    repoId: s.repo_id,
    repoName: s.repo_name ?? null,
    filePath: s.file_path ?? null,
    permission: s.permission ?? 'r',
    shareType: 'user',
    expiresAt: s.expires_at ?? null,
    isActive: s.is_active ?? true,
    accessCount: s.download_count ?? 0,
    createdAt: s.created_at ?? '',
    ownerUserId: s.created_by ?? 0,
    ownerUsername: s.creator_name ?? '',
    ownerDisplayName: s.creator_name ?? '',
    recipients,
    shareUrl: s.share_token
      ? `${ServerConnectionService.getBaseUrl()}/shares/${s.share_token}`
      : undefined,
  }
}
