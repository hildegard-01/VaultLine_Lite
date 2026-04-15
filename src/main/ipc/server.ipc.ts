import { handleIpc } from './index'
import * as ModeManager from '../services/server/ModeManager'
import * as ServerConnectionService from '../services/server/ServerConnectionService'
import * as PresenceService from '../services/server/PresenceService'
import * as FileProxyService from '../services/server/FileProxyService'
import * as ServerShareService from '../services/server/ServerShareService'
import * as ServerInviteService from '../services/server/ServerInviteService'
import * as ServerNotificationService from '../services/server/ServerNotificationService'
import * as ServerApprovalProxy from '../services/server/ServerApprovalProxy'
import * as ServerAdminProxy from '../services/server/ServerAdminProxy'
import { flushQueue as flushSyncQueue } from '../services/server/RepoSyncService'
import { flushQueue as flushMetaQueue } from '../services/server/MetadataSyncService'

/**
 * server.ipc.ts — 서버 연동 IPC 핸들러
 *
 * 역할:
 * - Renderer ↔ Main Process 서버 관련 채널 등록
 *
 * 채널 목록 (CLAUDE.md §9):
 * [연결]
 * - server:connect, server:disconnect, server:status, server:isConnected
 * [공유]
 * - server:share:create, server:share:list, server:share:update, server:share:delete
 * [저장소/초대]
 * - server:repo:list, server:repo:register, server:repo:sync-all
 * [알림]
 * - server:notification:list, server:notification:unread-count
 * - server:notification:mark-read, server:notification:mark-all-read
 * - server:notification:delete
 * [승인]
 * - server:approval:create, server:approval:list, server:approval:get
 * - server:approval:approve, server:approval:reject
 * - server:approval:rules:list, server:approval:rules:create, server:approval:rules:delete
 * [관리자]
 * - server:admin:dashboard, server:admin:system, server:admin:online-users
 * - server:admin:force-logout, server:admin:users:list
 * - server:admin:users:create, server:admin:users:update, server:admin:users:delete
 */

export function registerServerHandlers(): void {
  // 서버 로그인
  handleIpc('server:connect', async (args) => {
    const { serverUrl, username, password } = args as {
      serverUrl: string
      username: string
      password: string
    }

    if (!serverUrl || !username || !password) {
      throw new Error('서버 URL, 아이디, 비밀번호를 모두 입력하세요.')
    }

    const result = await ServerConnectionService.login(serverUrl, username, password)

    if (!result.success) {
      throw new Error(result.error ?? '서버 연결에 실패했습니다.')
    }

    // 로그인 성공 → heartbeat + 파일프록시 시작 + 저장소 등록 + 큐 플러시
    PresenceService.start()
    FileProxyService.connect()
    ServerInviteService.syncLocalReposToServer().catch(() => {})
    flushSyncQueue().catch(() => {})
    flushMetaQueue().catch(() => {})

    return ModeManager.getStatus()
  })

  // 서버 연결 해제
  handleIpc('server:disconnect', async () => {
    PresenceService.stop()
    FileProxyService.disconnect()
    await ServerConnectionService.logout()
    return { mode: 'offline' }
  })

  // 현재 모드/연결 상태 조회
  handleIpc('server:status', () => {
    return ModeManager.getStatus()
  })

  // 커넥티드 여부만 반환 (가벼운 폴링용)
  handleIpc('server:isConnected', () => {
    return ModeManager.isConnected()
  })

  // ─── 공유 ───
  handleIpc('server:share:create', (args) => {
    return ServerShareService.createShare(args as Parameters<typeof ServerShareService.createShare>[0])
  })
  handleIpc('server:share:list', (args) => {
    const { skip, limit } = (args ?? {}) as { skip?: number; limit?: number }
    return ServerShareService.listShares(skip, limit)
  })
  handleIpc('server:share:update', (args) => {
    const { shareId, params } = args as { shareId: number; params: Parameters<typeof ServerShareService.updateShare>[1] }
    return ServerShareService.updateShare(shareId, params)
  })
  handleIpc('server:share:delete', (args) => {
    return ServerShareService.deleteShare((args as { shareId: number }).shareId)
  })

  // ─── 저장소/초대 ───
  handleIpc('server:repo:list', (args) => {
    const { type, skip, limit } = (args ?? {}) as { type?: 'personal' | 'team'; skip?: number; limit?: number }
    return ServerInviteService.listServerRepos(type, skip, limit)
  })
  handleIpc('server:repo:register', (args) => {
    return ServerInviteService.registerRepoToServer(args as Parameters<typeof ServerInviteService.registerRepoToServer>[0])
  })
  handleIpc('server:repo:sync-all', () => {
    return ServerInviteService.syncLocalReposToServer()
  })

  // ─── 알림 ───
  handleIpc('server:notification:list', (args) => {
    const { unreadOnly, skip, limit } = (args ?? {}) as { unreadOnly?: boolean; skip?: number; limit?: number }
    return ServerNotificationService.listNotifications(unreadOnly, skip, limit)
  })
  handleIpc('server:notification:unread-count', () => {
    return ServerNotificationService.getUnreadCount()
  })
  handleIpc('server:notification:mark-read', (args) => {
    return ServerNotificationService.markRead((args as { notifId: number }).notifId)
  })
  handleIpc('server:notification:mark-all-read', () => {
    return ServerNotificationService.markAllRead()
  })
  handleIpc('server:notification:delete', (args) => {
    return ServerNotificationService.deleteNotification((args as { notifId: number }).notifId)
  })

  // ─── 승인 ───
  handleIpc('server:approval:create', (args) => {
    return ServerApprovalProxy.createApproval(args as Parameters<typeof ServerApprovalProxy.createApproval>[0])
  })
  handleIpc('server:approval:list', (args) => {
    const { statusFilter, skip, limit } = (args ?? {}) as { statusFilter?: 'pending' | 'approved' | 'rejected'; skip?: number; limit?: number }
    return ServerApprovalProxy.listApprovals(statusFilter, skip, limit)
  })
  handleIpc('server:approval:get', (args) => {
    return ServerApprovalProxy.getApproval((args as { approvalId: number }).approvalId)
  })
  handleIpc('server:approval:approve', (args) => {
    const { approvalId, comment } = args as { approvalId: number; comment?: string }
    return ServerApprovalProxy.approve(approvalId, comment)
  })
  handleIpc('server:approval:reject', (args) => {
    const { approvalId, comment } = args as { approvalId: number; comment?: string }
    return ServerApprovalProxy.reject(approvalId, comment)
  })
  handleIpc('server:approval:rules:list', () => {
    return ServerApprovalProxy.listRules()
  })
  handleIpc('server:approval:rules:create', (args) => {
    return ServerApprovalProxy.createRule(args as Parameters<typeof ServerApprovalProxy.createRule>[0])
  })
  handleIpc('server:approval:rules:delete', (args) => {
    return ServerApprovalProxy.deleteRule((args as { ruleId: number }).ruleId)
  })

  // ─── 관리자 ───
  handleIpc('server:admin:dashboard', () => {
    return ServerAdminProxy.getDashboard()
  })
  handleIpc('server:admin:system', () => {
    return ServerAdminProxy.getSystemStatus()
  })
  handleIpc('server:admin:online-users', () => {
    return ServerAdminProxy.getOnlineUsers()
  })
  handleIpc('server:admin:force-logout', (args) => {
    return ServerAdminProxy.forceLogout((args as { userId: number }).userId)
  })
  handleIpc('server:admin:users:list', (args) => {
    const { skip, limit } = (args ?? {}) as { skip?: number; limit?: number }
    return ServerAdminProxy.listUsers(skip, limit)
  })
  handleIpc('server:admin:users:create', (args) => {
    return ServerAdminProxy.createUser(args as Parameters<typeof ServerAdminProxy.createUser>[0])
  })
  handleIpc('server:admin:users:update', (args) => {
    const { userId, params } = args as { userId: number; params: Parameters<typeof ServerAdminProxy.updateUser>[1] }
    return ServerAdminProxy.updateUser(userId, params)
  })
  handleIpc('server:admin:users:delete', (args) => {
    return ServerAdminProxy.deleteUser((args as { userId: number }).userId)
  })
}
