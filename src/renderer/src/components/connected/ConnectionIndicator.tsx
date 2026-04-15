/**
 * ConnectionIndicator — 서버 연결 상태 표시 점
 *
 * 역할: 헤더에 표시되는 🟢/🔴 연결 상태 아이콘
 */

interface ConnectionIndicatorProps {
  connected: boolean
  serverUrl: string | null
}

export function ConnectionIndicator({ connected, serverUrl }: ConnectionIndicatorProps): React.JSX.Element {
  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1 rounded-md"
      title={connected ? `서버 연결됨: ${serverUrl}` : '오프라인 모드'}
    >
      <span
        className={`w-2 h-2 rounded-full shrink-0 ${
          connected ? 'bg-green-400 shadow-[0_0_4px_rgba(74,222,128,0.7)]' : 'bg-red-400'
        }`}
      />
      <span className="text-[10px] text-white/60 hidden xl:inline">
        {connected ? '연결됨' : '오프라인'}
      </span>
    </div>
  )
}
