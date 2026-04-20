import { useQuery } from '@tanstack/react-query'
import { invoke } from '@renderer/services/ipcClient'
import { useMode } from '@renderer/hooks/useMode'

/**
 * SharedWithMe — 사이드바 "공유받은 문서" 섹션
 *
 * 역할:
 * - 서버에서 내가 접근 가능한 저장소 목록 표시
 * - 소유자 온라인 상태 표시
 * - 커넥티드 모드에서만 렌더링 (Sidebar에서 조건부 렌더링)
 */

interface ServerRepo {
  id: number
  name: string
  ownerUsername: string
  ownerOnline: boolean
  totalFiles: number
}

export function SharedWithMe(): React.JSX.Element {
  const { user } = useMode()
  const { data, isLoading } = useQuery({
    queryKey: ['server:repo:list'],
    queryFn: () => invoke('server:repo:list' as any, { skip: 0, limit: 50 }),
    refetchInterval: 30_000
  })

  // 내가 소유하지 않은 저장소만 표시 (공유받은 문서)
  const allRepos = (data as { items: ServerRepo[] } | undefined)?.items ?? []
  const repos = user ? allRepos.filter(r => r.ownerUsername !== user.username) : []

  return (
    <section className="p-3">
      <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 3.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM2 7a5 5 0 1 1 10 0A5 5 0 0 1 2 7ZM13.5 13.5a.75.75 0 0 1 0-1.5h.01a.75.75 0 0 1 0 1.5H13.5Z" />
        </svg>
        공유받은 문서
      </h3>

      {isLoading ? (
        <p className="text-[11px] text-gray-400">불러오는 중...</p>
      ) : repos.length === 0 ? (
        <p className="text-[11px] text-gray-400">공유된 저장소가 없습니다</p>
      ) : (
        repos.map((repo) => (
          <div
            key={repo.id}
            className="flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
            title={`소유자: ${repo.ownerUsername}`}
          >
            {/* 온라인 상태 */}
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                repo.ownerOnline ? 'bg-green-400' : 'bg-gray-300'
              }`}
              title={repo.ownerOnline ? '소유자 온라인' : '소유자 오프라인'}
            />
            <span className="truncate flex-1 text-gray-600 dark:text-gray-300">{repo.name}</span>
            <span className="text-[10px] text-gray-400 shrink-0">{repo.totalFiles}개</span>
          </div>
        ))
      )}
    </section>
  )
}
