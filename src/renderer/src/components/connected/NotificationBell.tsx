import { useState, useEffect } from 'react'
import { invoke } from '@renderer/services/ipcClient'

/**
 * NotificationBell — 헤더 알림 벨 아이콘
 *
 * 역할:
 * - 미읽음 알림 수 배지 표시
 * - 클릭 시 알림 드롭다운 토글
 * - server:notification 이벤트 수신 시 카운트 갱신
 */

interface NotificationItem {
  id: number
  kind: string
  title: string
  message: string | null
  link: string | null
  isRead: boolean
  createdAt: string
}

export function NotificationBell(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(false)

  const fetchUnreadCount = async (): Promise<void> => {
    try {
      const count = await invoke('server:notification:unread-count' as any)
      setUnreadCount(count as number)
    } catch {
      setUnreadCount(0)
    }
  }

  const fetchNotifications = async (): Promise<void> => {
    setLoading(true)
    try {
      const items = await invoke('server:notification:list' as any, { unreadOnly: false, skip: 0, limit: 20 })
      setNotifications(items as NotificationItem[])
    } catch {
      setNotifications([])
    } finally {
      setLoading(false)
    }
  }

  // 초기 로드 + 알림 이벤트 수신 시 갱신
  useEffect(() => {
    fetchUnreadCount()

    const handler = (): void => { fetchUnreadCount() }
    window.addEventListener('vaultline:notification-received', handler)
    return () => window.removeEventListener('vaultline:notification-received', handler)
  }, [])

  const handleOpen = (): void => {
    setOpen(v => !v)
    if (!open) fetchNotifications()
  }

  const handleMarkRead = async (id: number): Promise<void> => {
    try {
      await invoke('server:notification:mark-read' as any, { notifId: id })
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n))
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch { /* 무시 */ }
  }

  const handleMarkAllRead = async (): Promise<void> => {
    try {
      await invoke('server:notification:mark-all-read' as any)
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })))
      setUnreadCount(0)
    } catch { /* 무시 */ }
  }

  const kindLabel: Record<string, string> = {
    share: '공유', approval: '승인', mention: '멘션', system: '시스템'
  }

  return (
    <div className="relative">
      <button
        onClick={handleOpen}
        className="relative p-1.5 rounded-lg hover:bg-white/[0.12] transition"
        title="알림"
      >
        {/* 벨 아이콘 */}
        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
        </svg>

        {/* 미읽음 배지 */}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* 드롭다운 */}
      {open && (
        <>
          <div className="fixed inset-0 z-[150]" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 w-80 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 z-[160] overflow-hidden">
            {/* 헤더 */}
            <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <span className="text-sm font-semibold">알림</span>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-[10px] text-blue-500 hover:text-blue-700"
                >
                  전체 읽음
                </button>
              )}
            </div>

            {/* 목록 */}
            <div className="max-h-80 overflow-y-auto">
              {loading ? (
                <div className="py-8 text-center text-xs text-gray-400">불러오는 중...</div>
              ) : notifications.length === 0 ? (
                <div className="py-8 text-center text-xs text-gray-400">알림이 없습니다</div>
              ) : (
                notifications.map(n => (
                  <div
                    key={n.id}
                    onClick={() => { if (!n.isRead) handleMarkRead(n.id) }}
                    className={`px-4 py-3 border-b border-gray-50 dark:border-gray-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition ${
                      n.isRead ? 'opacity-60' : ''
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {!n.isRead && (
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-[9px] px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 font-medium">
                            {kindLabel[n.kind] ?? n.kind}
                          </span>
                        </div>
                        <p className="text-xs font-medium text-gray-800 dark:text-gray-200 leading-tight">{n.title}</p>
                        {n.message && (
                          <p className="text-[11px] text-gray-500 mt-0.5 truncate">{n.message}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
