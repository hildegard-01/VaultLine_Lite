import { BrowserWindow } from 'electron'
import { getAxiosInstance } from './ServerConnectionService'
import * as ModeManager from './ModeManager'

/**
 * ServerNotificationService — 서버 알림 수신 및 관리
 *
 * 역할:
 * - FileProxyService의 WebSocket에서 수신한 notification 이벤트를 Renderer로 전달
 * - 알림 목록/미읽음 수 조회 (GET /notifications)
 * - 읽음 처리 (PUT /notifications/{id}/read)
 * - 전체 읽음 처리 (PUT /notifications/read-all)
 * - 알림 삭제 (DELETE /notifications/{id})
 *
 * 구성:
 * - dispatchToRenderer(): WebSocket 수신 알림 → Renderer IPC 전달
 * - listNotifications(): 알림 목록
 * - getUnreadCount(): 미읽음 수
 * - markRead(): 읽음 처리
 * - markAllRead(): 전체 읽음 처리
 * - deleteNotification(): 알림 삭제
 */

export interface NotificationItem {
  id: number
  kind: 'share' | 'approval' | 'mention' | 'system'
  title: string
  message: string | null
  link: string | null
  isRead: boolean
  createdAt: string
}

/**
 * WebSocket 수신 알림을 Renderer로 전달
 * FileProxyService의 _handleMessage에서 type==='notification'일 때 호출
 */
export function dispatchToRenderer(payload: Record<string, unknown>): void {
  const windows = BrowserWindow.getAllWindows()
  if (windows.length === 0) return

  windows[0].webContents.send('server:notification', payload)
}

/** 알림 목록 조회 */
export async function listNotifications(
  unreadOnly = false,
  skip = 0,
  limit = 50
): Promise<NotificationItem[]> {
  if (!ModeManager.isConnected()) return []

  const instance = getAxiosInstance()
  const response = await instance.get<unknown[]>('/notifications', {
    params: { unread_only: unreadOnly, skip, limit }
  })

  return response.data.map(_mapNotification)
}

/** 미읽음 알림 수 조회 */
export async function getUnreadCount(): Promise<number> {
  if (!ModeManager.isConnected()) return 0

  const instance = getAxiosInstance()
  const response = await instance.get<{ unread_count: number }>('/notifications/unread-count')
  return response.data.unread_count
}

/** 읽음 처리 */
export async function markRead(notifId: number): Promise<void> {
  if (!ModeManager.isConnected()) return

  const instance = getAxiosInstance()
  await instance.put(`/notifications/${notifId}/read`)
}

/** 전체 읽음 처리 */
export async function markAllRead(): Promise<void> {
  if (!ModeManager.isConnected()) return

  const instance = getAxiosInstance()
  await instance.put('/notifications/read-all')
}

/** 알림 삭제 */
export async function deleteNotification(notifId: number): Promise<void> {
  if (!ModeManager.isConnected()) return

  const instance = getAxiosInstance()
  await instance.delete(`/notifications/${notifId}`)
}

/** 서버 응답 → 내부 타입 변환 */
function _mapNotification(n: unknown): NotificationItem {
  const d = n as Record<string, unknown>
  return {
    id: d.id as number,
    kind: d.kind as NotificationItem['kind'],
    title: d.title as string,
    message: (d.message as string | null) ?? null,
    link: (d.link as string | null) ?? null,
    isRead: d.is_read as boolean,
    createdAt: d.created_at as string
  }
}
