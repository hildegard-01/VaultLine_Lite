import { useState } from 'react'
import { invoke } from '@renderer/services/ipcClient'

interface ModeUser {
  id: number
  username: string
  role: string
}

/**
 * UserAvatar — 헤더 사용자 아바타 + 드롭다운 메뉴
 *
 * 역할:
 * - 로그인 사용자 이니셜 아바타 표시
 * - 드롭다운: 사용자명, 로그아웃 버튼
 */

interface UserAvatarProps {
  user: ModeUser
  onDisconnected: () => void
}

export function UserAvatar({ user, onDisconnected }: UserAvatarProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const initial = user.username.charAt(0).toUpperCase()

  const handleLogout = async (): Promise<void> => {
    if (!window.confirm('서버 연결을 해제하시겠습니까?\n로컬 기능은 계속 사용할 수 있습니다.')) return
    setLoading(true)
    try {
      await invoke('server:disconnect' as any)
      onDisconnected()
    } catch (err) {
      alert(err instanceof Error ? err.message : '연결 해제 실패')
    } finally {
      setLoading(false)
      setOpen(false)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 p-1 rounded-lg hover:bg-white/[0.12] transition"
        title={user.username}
      >
        {/* 이니셜 아바타 */}
        <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center text-white text-xs font-bold shrink-0">
          {initial}
        </div>
        {/* 역할 배지 */}
        {user.role === 'admin' && (
          <span className="text-[9px] px-1 py-0.5 rounded bg-yellow-500/20 text-yellow-300 font-semibold hidden xl:inline">
            관리자
          </span>
        )}
      </button>

      {/* 드롭다운 */}
      {open && (
        <>
          <div className="fixed inset-0 z-[150]" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 w-48 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 z-[160] overflow-hidden">
            {/* 사용자 정보 */}
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-white text-sm font-bold">
                  {initial}
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">{user.username}</p>
                  <p className="text-[10px] text-gray-400">{user.role === 'admin' ? '관리자' : '사용자'}</p>
                </div>
              </div>
            </div>

            {/* 메뉴 */}
            <div className="py-1">
              <button
                onClick={handleLogout}
                disabled={loading}
                className="w-full text-left px-4 py-2 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition disabled:opacity-50"
              >
                {loading ? '연결 해제 중...' : '서버 연결 해제'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
