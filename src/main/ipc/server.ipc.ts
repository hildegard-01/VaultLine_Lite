/**
 * 서버 관련 IPC 핸들러
 * server:connect, server:disconnect, server:status, server:isConnected
 * server:share-create, server:share-list, server:share-revoke, server:share-leave
 * server:user-list
 */

import { handleIpc } from './index'
import { modeManager } from '../services/server/ModeManager'
import { ServerConnectionService } from '../services/server/ServerConnectionService'
import { RepoSyncService } from '../services/server/RepoSyncService'
import { ServerShareService } from '../services/server/ServerShareService'
import { ServerNotificationService } from '../services/server/ServerNotificationService'
import { ServerAdminProxy } from '../services/server/ServerAdminProxy'
import { ServerApprovalProxy } from '../services/server/ServerApprovalProxy'
import { getAppSettings } from '../services/SettingsService'
import { saveSession, clearSession } from '../services/SessionService'

export function registerServerHandlers(): void {
  // 서버 연결
  handleIpc('server:connect', async (args: unknown) => {
    const { url, username, password } = args as { url: string; username: string; password: string }
    const success = await modeManager.connect(url, username, password)
    if (success) {
      // 큐에 쌓인 동기화 데이터 일괄 push
      await RepoSyncService.flushQueue()

      // 자동 로그인 활성화 시 세션 저장
      const appSettings = getAppSettings()
      if (appSettings.autoLoginDays > 0) {
        saveSession({
          refreshToken: ServerConnectionService.getRefreshToken(),
          serverUrl: url.trim(),
          username: username.trim(),
          savedAt: new Date().toISOString(),
          autoLoginDays: appSettings.autoLoginDays,
        })
      }
    }
    return {
      connected: success,
      mode: modeManager.getMode(),
      user: success ? ServerConnectionService.getUserInfo() : null,
    }
  })

  // 서버 연결 해제
  handleIpc('server:disconnect', async () => {
    await modeManager.disconnect()
    clearSession()
    return { mode: 'offline' }
  })

  // 서버 상태 조회
  handleIpc('server:status', () => {
    return {
      mode: modeManager.getMode(),
      connected: modeManager.isConnected(),
      serverUrl: modeManager.getServerUrl(),
      user: modeManager.isConnected() ? ServerConnectionService.getUserInfo() : null,
    }
  })

  // 커넥티드 여부
  handleIpc('server:isConnected', () => {
    return modeManager.isConnected()
  })

  // 서버 공유 생성
  handleIpc('server:share-create', async (args: unknown) => {
    const { repoId, filePath, recipientIds, permission, expiresAt } = args as {
      repoId: number
      filePath: string
      recipientIds: number[]
      permission: 'r' | 'rw'
      expiresAt?: string
    }
    return ServerShareService.createShare(repoId, filePath, permission, recipientIds, expiresAt)
  })

  // 서버 공유 목록 (보낸/받은 분리)
  handleIpc('server:share-list', async () => {
    return ServerShareService.listShares()
  })

  // 나에게 공유된 목록 (수신자 측)
  handleIpc('server:share-received', async (args: unknown) => {
    const { status } = (args ?? {}) as { status?: 'pending' | 'accepted' | 'rejected' }
    return ServerShareService.listReceivedShares(status)
  })

  // 공유 수락 (수신자 측)
  handleIpc('server:share-accept', async (args: unknown) => {
    const { id } = args as { id: number }
    return ServerShareService.acceptShare(id)
  })

  // 공유 거절 (수신자 측)
  handleIpc('server:share-reject', async (args: unknown) => {
    const { id } = args as { id: number }
    return ServerShareService.rejectShare(id)
  })

  // 서버 공유 취소 (공유 생성자 측)
  handleIpc('server:share-revoke', async (args: unknown) => {
    const { id } = args as { id: number }
    await ServerShareService.revokeShare(id)
  })

  // 서버 공유 해제 (수신자 측)
  handleIpc('server:share-leave', async (args: unknown) => {
    const { id } = args as { id: number }
    await ServerShareService.leaveShare(id)
  })

  // 서버 사용자 목록 (공유 대상 선택용)
  handleIpc('server:user-list', async () => {
    return ServerShareService.getUserList()
  })

  // ── 관리자: 사용자 관리 ──
  handleIpc('admin:user-list', async (args: unknown) => {
    const { skip, limit, search } = (args ?? {}) as { skip?: number; limit?: number; search?: string }
    return ServerAdminProxy.listUsers(skip, limit, search)
  })

  handleIpc('admin:user-create', async (args: unknown) => {
    return ServerAdminProxy.createUser(args as any)
  })

  handleIpc('admin:user-update', async (args: unknown) => {
    const { userId, ...body } = args as { userId: number; [key: string]: any }
    return ServerAdminProxy.updateUser(userId, body)
  })

  handleIpc('admin:user-delete', async (args: unknown) => {
    const { userId } = args as { userId: number }
    await ServerAdminProxy.deleteUser(userId)
  })

  handleIpc('admin:user-reset-password', async (args: unknown) => {
    const { userId } = args as { userId: number }
    return ServerAdminProxy.resetPassword(userId)
  })

  handleIpc('admin:user-force-logout', async (args: unknown) => {
    const { userId } = args as { userId: number }
    await ServerAdminProxy.forceLogout(userId)
  })

  // ── 관리자: 공유 관리 ──
  handleIpc('admin:share-list', async (args: unknown) => {
    const { skip, limit } = (args ?? {}) as { skip?: number; limit?: number }
    return ServerAdminProxy.listAllShares(skip, limit)
  })

  handleIpc('admin:share-delete', async (args: unknown) => {
    const { shareId } = args as { shareId: number }
    await ServerAdminProxy.forceDeleteShare(shareId)
  })

  // ── 관리자: 시스템 설정 ──
  handleIpc('admin:server-system', async () => {
    return ServerAdminProxy.getSystemStatus()
  })

  // ── 승인 워크플로우 ──
  handleIpc('approval:list', async (args: unknown) => {
    const { statusFilter } = (args ?? {}) as { statusFilter?: string }
    return ServerApprovalProxy.listApprovals(statusFilter)
  })

  handleIpc('approval:create', async (args: unknown) => {
    const { repoId, filePath, revision, message, reviewerIds } = args as {
      repoId: number; filePath: string; revision: number; message: string; reviewerIds: number[]
    }
    return ServerApprovalProxy.createApproval(repoId, filePath, revision, message, reviewerIds)
  })

  handleIpc('approval:approve', async (args: unknown) => {
    const { id, comment } = args as { id: number; comment?: string }
    return ServerApprovalProxy.approve(id, comment)
  })

  handleIpc('approval:reject', async (args: unknown) => {
    const { id, comment } = args as { id: number; comment?: string }
    return ServerApprovalProxy.reject(id, comment)
  })

  // ── 내 계정 ──
  handleIpc('user:my-profile', async () => {
    return ServerConnectionService.getMyProfile()
  })

  handleIpc('user:update-profile', async (args: unknown) => {
    const { displayName, email } = args as { displayName?: string; email?: string }
    await ServerConnectionService.updateMyProfile({ displayName, email })
  })

  handleIpc('user:change-password', async (args: unknown) => {
    const { currentPassword, newPassword } = args as { currentPassword: string; newPassword: string }
    await ServerConnectionService.changePassword(currentPassword, newPassword)
  })

  // ── 알림 ──
  handleIpc('server:notification:unread-count', async () => {
    return ServerNotificationService.getUnreadCount()
  })

  handleIpc('server:notification:list', async (args: unknown) => {
    const { limit } = (args ?? {}) as { limit?: number }
    return ServerNotificationService.getNotifications(limit)
  })

  handleIpc('server:notification:mark-read', async (args: unknown) => {
    const { notifId } = args as { notifId: number }
    await ServerNotificationService.markRead(notifId)
  })

  handleIpc('server:notification:mark-all-read', async () => {
    await ServerNotificationService.markAllRead()
  })
}
