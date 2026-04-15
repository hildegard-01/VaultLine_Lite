import { useState, useEffect, useCallback } from 'react'

/**
 * useMode — 오프라인/커넥티드 모드 상태 훅
 *
 * 역할:
 * - IPC server:status를 폴링하여 현재 모드 반환
 * - connected, user, isAdmin, serverUrl 상태 제공
 * - server:notification IPC 이벤트 수신 → onNotification 콜백
 *
 * 구성:
 * - connected: 커넥티드 모드 여부
 * - user: 현재 로그인 사용자 정보
 * - isAdmin: 관리자 여부
 * - serverUrl: 서버 URL
 * - refresh(): 수동 상태 갱신
 */

export interface ModeUser {
  id: number
  username: string
  role: string
}

export interface ModeState {
  connected: boolean
  user: ModeUser | null
  isAdmin: boolean
  serverUrl: string | null
  refresh: () => void
}

const POLL_INTERVAL_MS = 10_000 // 10초 폴링

export function useMode(): ModeState {
  const [connected, setConnected] = useState(false)
  const [user, setUser] = useState<ModeUser | null>(null)
  const [serverUrl, setServerUrl] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const status = await (window.api.invoke as Function)('server:status') as {
        success: boolean
        data: { mode: string; user: ModeUser | null; serverUrl: string | null }
      }
      if (status.success && status.data) {
        setConnected(status.data.mode === 'connected')
        setUser(status.data.user)
        setServerUrl(status.data.serverUrl)
      }
    } catch {
      // 폴링 실패 무시
    }
  }, [])

  useEffect(() => {
    fetchStatus()
    const timer = setInterval(fetchStatus, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [fetchStatus])

  // 서버 알림 이벤트 수신 → 미읽음 카운트 갱신 트리거
  useEffect(() => {
    const handler = (): void => {
      window.dispatchEvent(new CustomEvent('vaultline:notification-received'))
    }
    const unsubscribe = window.api.on('server:notification', handler)
    return () => {
      unsubscribe()
    }
  }, [])

  return {
    connected,
    user,
    isAdmin: user?.role === 'admin',
    serverUrl,
    refresh: fetchStatus
  }
}
