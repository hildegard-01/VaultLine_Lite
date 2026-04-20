import { APP_NAME } from '@shared/constants'
import { useMode } from '@renderer/hooks/useMode'
import { ConnectionIndicator } from '@renderer/components/connected/ConnectionIndicator'
import { NotificationBell } from '@renderer/components/connected/NotificationBell'
import { UserAvatar } from '@renderer/components/connected/UserAvatar'

interface HeaderProps {
  onOpenSettings?: () => void
  onOpenServerSettings?: () => void
  onOpenSearch?: () => void
  repoName?: string
  currentPath?: string
  onNavigate?: (path: string) => void
}

export function Header({ onOpenSettings, onOpenServerSettings, onOpenSearch, repoName, currentPath, onNavigate }: HeaderProps): React.JSX.Element {
  const { connected, user, serverUrl, refresh } = useMode()

  // 브레드크럼 세그먼트 구성
  const segments: Array<{ label: string; path: string }> = []
  if (repoName) {
    segments.push({ label: repoName, path: '' })
    if (currentPath) {
      const parts = currentPath.split('/')
      let accum = ''
      for (const part of parts) {
        accum = accum ? `${accum}/${part}` : part
        segments.push({ label: part, path: accum })
      }
    }
  }

  return (
    <header className="h-12 bg-navy text-white flex items-center px-4 gap-3 shrink-0 z-50">
      {/* Logo */}
      <div className="flex items-center gap-2 font-bold text-accent cursor-pointer">
        <div className="w-6 h-6 rounded bg-gradient-to-br from-accent to-accent-dark flex items-center justify-center text-white text-xs font-extrabold">V</div>
        <span className="text-sm">{APP_NAME}</span>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 ml-4 text-xs text-white/50 min-w-0 overflow-hidden">
        {segments.length === 0 ? (
          <>
            <span className="text-white/70">저장소</span>
            <span>/</span>
            <span className="text-white/40">선택하세요</span>
          </>
        ) : (
          segments.map((seg, i) => (
            <span key={seg.path} className="flex items-center gap-1 min-w-0">
              {i > 0 && <span className="text-white/30 shrink-0">/</span>}
              {i < segments.length - 1 ? (
                <button
                  onClick={() => onNavigate?.(seg.path)}
                  className="text-white/70 hover:text-white/90 truncate"
                >
                  {seg.label}
                </button>
              ) : (
                <span className="text-white font-medium truncate">{seg.label}</span>
              )}
            </span>
          ))
        )}
      </div>

      <div className="flex-1" />

      {/* 커넥티드 전용: 알림벨 + 사용자 아바타 */}
      {connected && <NotificationBell />}
      {connected && user && <UserAvatar user={user} onDisconnected={refresh} />}

      {/* 연결 상태 표시 */}
      <ConnectionIndicator connected={connected} serverUrl={serverUrl} onClick={onOpenServerSettings} />

      {/* Search */}
      <button
        onClick={onOpenSearch}
        className="flex items-center gap-2 px-3 py-1.5 text-xs bg-white/[0.08] rounded-lg hover:bg-white/[0.15] transition"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 18 18"><circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.4"/><path d="M12 12L15.5 15.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
        <span className="opacity-60">검색</span>
        <kbd className="text-[10px] opacity-40 ml-1">Ctrl+K</kbd>
      </button>

      {/* Settings */}
      <button
        onClick={onOpenSettings}
        className="p-1.5 rounded-lg hover:bg-white/[0.12] transition"
        title="설정"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </svg>
      </button>
    </header>
  )
}
