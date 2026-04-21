import { useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { invoke } from '@renderer/services/ipcClient'
import { FileIcon } from '@renderer/components/shared/FileIcon'
import { CreateRepoModal } from '@renderer/components/modals/CreateRepoModal'
import type { Repository, Tag } from '@shared/types/ipc'

interface SidebarProps {
  collapsed?: boolean
}

export function Sidebar({ collapsed = false }: SidebarProps) {
  const navigate = useNavigate()
  const { repoId } = useParams<{ repoId: string }>()
  const location = useLocation()
  const queryClient = useQueryClient()
  const [showCreateRepo, setShowCreateRepo] = useState(false)
  const [showTagInput, setShowTagInput] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState('#1565C0')

  const { data: repos = [] } = useQuery({
    queryKey: ['repo:list'],
    queryFn: () => invoke('repo:list')
  })

  const { data: bookmarks = [] } = useQuery({
    queryKey: ['bookmark:list'],
    queryFn: () => invoke('bookmark:list')
  })

  const { data: tags = [] } = useQuery({
    queryKey: ['tag:list'],
    queryFn: () => invoke('tag:list')
  })

  const handleDeleteRepo = async (repo: Repository) => {
    if (!window.confirm(`"${repo.name}" 저장소를 삭제하시겠습니까?\n\n저장소의 모든 파일과 이력이 영구 삭제됩니다.`)) return
    try {
      await invoke('repo:delete', { id: repo.id })
      queryClient.invalidateQueries({ queryKey: ['repo:list'] })
      if (String(repo.id) === repoId) navigate('/')
    } catch (err) {
      alert(err instanceof Error ? err.message : '저장소 삭제 실패')
    }
  }

  const handleCreateRepo = async (name: string, description: string, template: string) => {
    try {
      const repo = await invoke('repo:create', {
        name,
        description,
        folderTemplate: template as 'empty' | 'business' | 'project'
      })
      queryClient.invalidateQueries({ queryKey: ['repo:list'] })
      setShowCreateRepo(false)
      navigate(`/repo/${repo.id}`)
    } catch (err) {
      alert(err instanceof Error ? err.message : '저장소 생성 실패')
    }
  }

  const activeRepoId = repoId ? Number(repoId) : null

  if (collapsed) {
    return (
      <aside className="h-full bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col items-center py-3 gap-2">
        {repos.map((repo: Repository) => (
          <button
            key={repo.id}
            onClick={() => navigate(`/repo/${repo.id}`)}
            className={`w-9 h-9 rounded-lg flex items-center justify-center transition
              ${activeRepoId === repo.id ? 'bg-blue-100 dark:bg-blue-900/30' : 'hover:bg-gray-200 dark:hover:bg-gray-700'}`}
            title={repo.name}
          >
            <FileIcon type="folder" size={18} />
          </button>
        ))}
        <button
          onClick={() => setShowCreateRepo(true)}
          className="w-9 h-9 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center text-gray-400 text-lg"
          title="새 저장소"
        >+</button>
        {showCreateRepo && <CreateRepoModal onClose={() => setShowCreateRepo(false)} onCreate={handleCreateRepo} />}
      </aside>
    )
  }

  return (
    <aside className="h-full bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col text-sm overflow-y-auto">
      {/* 즐겨찾기 */}
      <section className="p-3">
        <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">즐겨찾기</h3>
        {bookmarks.length === 0 ? (
          <p className="text-xs text-gray-400">즐겨찾기가 없습니다</p>
        ) : (
          bookmarks.map((b: any) => {
            // 파일의 부모 경로 계산 (해당 위치로 이동)
            const parts = (b.filePath as string).split('/')
            const fileName = parts.pop() || b.filePath
            const parentPath = parts.join('/')
            return (
              <div
                key={b.id}
                onClick={() => {
                  // 같은 저장소에 있어도 강제 이동하기 위해 replace 사용
                  if (String(b.repoId) === repoId) {
                    // 이미 같은 저장소 → 직접 이벤트 발행
                    window.dispatchEvent(new CustomEvent('vaultline:navigate-to', {
                      detail: { path: parentPath, selectFile: b.filePath }
                    }))
                  } else {
                    navigate(`/repo/${b.repoId}`, { state: { navigateTo: parentPath, selectFile: b.filePath, ts: Date.now() } })
                  }
                }}
                className="group flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 text-xs text-gray-600 dark:text-gray-300"
                title={b.filePath}
              >
                <svg className="w-3 h-3 text-yellow-400 shrink-0" viewBox="0 0 14 14" fill="currentColor"><path d="M7 1l1.76 3.58 3.97.58-2.86 2.78.65 3.95L7 10.04 3.48 11.89l.65-3.95L1.27 5.16l3.97-.58L7 1z" strokeLinejoin="round"/></svg>
                <span className="truncate flex-1">{fileName}</span>
                <button
                  onClick={async (e) => {
                    e.stopPropagation()
                    try {
                      await invoke('bookmark:toggle', { repoId: b.repoId, filePath: b.filePath })
                      queryClient.invalidateQueries({ queryKey: ['bookmark:list'] })
                    } catch { /* 무시 */ }
                  }}
                  className="text-gray-300 hover:text-red-400 text-[10px] shrink-0 opacity-0 group-hover:opacity-100"
                  title="즐겨찾기 해제"
                >✕</button>
              </div>
            )
          })
        )}
      </section>

      <hr className="border-gray-200 dark:border-gray-700 mx-3" />

      {/* 저장소 */}
      <section className="p-3 flex-1">
        <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">내 저장소</h3>
        {repos.map((repo: Repository) => (
          <div
            key={repo.id}
            onClick={() => {
              if (String(repo.id) === repoId) {
                // 같은 저장소 클릭 → 루트 폴더로 리셋
                window.dispatchEvent(new CustomEvent('vaultline:navigate-to', { detail: { path: '', selectFile: null } }))
              } else {
                navigate(`/repo/${repo.id}`)
              }
            }}
            className={`group flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-xs transition
              ${activeRepoId === repo.id
                ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 font-semibold'
                : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}
          >
            <FileIcon type="folder" size={16} />
            <span className="truncate flex-1">{repo.name}</span>
            <button
              onClick={e => { e.stopPropagation(); handleDeleteRepo(repo) }}
              className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition text-base leading-none shrink-0"
              title="저장소 삭제"
            >✕</button>
          </div>
        ))}
        {repos.length === 0 && (
          <p className="text-xs text-gray-400">저장소를 생성해 주세요</p>
        )}
        <button
          onClick={() => setShowCreateRepo(true)}
          className="flex items-center gap-2 px-2 py-1.5 mt-1 rounded text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-200 dark:hover:bg-gray-700 w-full"
        >
          <span className="text-base leading-none">+</span>
          <span>새 저장소</span>
        </button>
      </section>

      <hr className="border-gray-200 dark:border-gray-700 mx-3" />

      {/* 태그 */}
      <section className="p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">태그</h3>
          <button
            onClick={() => { setShowTagInput(v => !v); setNewTagName(''); setNewTagColor('#1565C0') }}
            className={`text-[10px] ${showTagInput ? 'text-gray-400 hover:text-gray-600' : 'text-blue-500 hover:text-blue-700'}`}
          >{showTagInput ? '취소' : '+ 추가'}</button>
        </div>
        {showTagInput && (
          <div className="mb-2 space-y-1.5">
            <div className="flex items-center gap-1">
              <input
                value={newTagName}
                onChange={e => setNewTagName(e.target.value)}
                placeholder="태그 이름"
                className="flex-1 min-w-0 px-2 py-1 text-[11px] border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
                onKeyDown={async (e) => {
                  if (e.key === 'Enter' && newTagName.trim()) {
                    try {
                      await invoke('tag:create', { name: newTagName.trim(), color: newTagColor })
                      setNewTagName(''); setNewTagColor('#1565C0'); setShowTagInput(false)
                      queryClient.invalidateQueries({ queryKey: ['tag:list'] })
                    } catch (err) { alert(err instanceof Error ? err.message : '태그 생성 실패') }
                  }
                  if (e.key === 'Escape') { setShowTagInput(false); setNewTagName('') }
                }}
                autoFocus
              />
              <button
                onClick={async () => {
                  if (!newTagName.trim()) return
                  try {
                    await invoke('tag:create', { name: newTagName.trim(), color: newTagColor })
                    setNewTagName(''); setNewTagColor('#1565C0'); setShowTagInput(false)
                    queryClient.invalidateQueries({ queryKey: ['tag:list'] })
                  } catch (err) { alert(err instanceof Error ? err.message : '태그 생성 실패') }
                }}
                className="px-2 py-1 text-[10px] font-semibold bg-navy text-white rounded hover:bg-navy-dark whitespace-nowrap shrink-0"
              >확인</button>
            </div>
            <div className="flex items-center gap-1 px-0.5">
              {['#1565C0','#2E7D32','#E65100','#6A1B9A','#C62828','#00838F','#4E342E','#37474F'].map(c => (
                <button key={c} onClick={() => setNewTagColor(c)}
                  className={`w-4 h-4 rounded-full border-2 transition ${newTagColor === c ? 'border-gray-800 dark:border-white scale-110' : 'border-transparent hover:scale-110'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        )}
        <TagList tags={tags} queryClient={queryClient} />
      </section>

      {/* 휴지통 */}
      <TrashButton active={location.pathname === '/trash'} onClick={() => navigate('/trash')} />

      {/* 디스크 사용량 */}
      <DiskUsageSection />

      {/* 저장소 생성 모달 */}
      {showCreateRepo && <CreateRepoModal onClose={() => setShowCreateRepo(false)} onCreate={handleCreateRepo} />}
    </aside>
  )
}

function TagList({ tags, queryClient }: { tags: Tag[]; queryClient: any }) {
  const [expanded, setExpanded] = useState(false)
  const [search, setSearch] = useState('')
  const MAX_VISIBLE = 5

  const filtered = search
    ? tags.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
    : tags
  const visible = expanded ? filtered : filtered.slice(0, MAX_VISIBLE)
  const hasMore = filtered.length > MAX_VISIBLE

  const handleTagClick = (tag: Tag) => {
    window.dispatchEvent(new CustomEvent('vaultline:tag-filter', { detail: { tagId: tag.id, tagName: tag.name, tagColor: tag.color } }))
  }

  const handleDelete = async (e: React.MouseEvent, tag: Tag) => {
    e.stopPropagation()
    if (!window.confirm(`"${tag.name}" 태그를 삭제하시겠습니까?`)) return
    try {
      await invoke('tag:delete', { id: tag.id })
      queryClient.invalidateQueries({ queryKey: ['tag:list'] })
      window.dispatchEvent(new CustomEvent('vaultline:tags-changed'))
    } catch { /* 무시 */ }
  }

  return (
    <>
      {tags.length > MAX_VISIBLE && (
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="태그 검색..."
          className="w-full px-2 py-1 mb-1 text-[11px] border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
        />
      )}
      {visible.map((tag: Tag) => (
        <div
          key={tag.id}
          onClick={() => handleTagClick(tag)}
          className="group flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 text-xs text-gray-600 dark:text-gray-300"
        >
          <div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: tag.color }} />
          <span className="truncate flex-1">{tag.name}</span>
          <button
            onClick={(e) => handleDelete(e, tag)}
            className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 text-[10px] shrink-0"
          >✕</button>
        </div>
      ))}
      {hasMore && !search && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="text-[10px] text-gray-400 hover:text-blue-500 px-2 py-0.5"
        >
          {expanded ? '접기' : `더보기 (${filtered.length - MAX_VISIBLE}개)`}
        </button>
      )}
      {tags.length === 0 && (
        <p className="text-xs text-gray-400">태그가 없습니다</p>
      )}
    </>
  )
}

function TrashButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  const { data: trashItems = [] } = useQuery({
    queryKey: ['trash:list'],
    queryFn: () => invoke('trash:list', {})
  })

  return (
    <section className="px-3 pb-2">
      <button
        onClick={onClick}
        className={`flex items-center gap-2 px-2 py-1 rounded text-xs w-full transition
          ${active
            ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 font-semibold'
            : 'text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
      >
        <span>🗑</span>
        <span>휴지통</span>
        {trashItems.length > 0 && (
          <span className="ml-auto px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-red-100 text-red-500">
            {trashItems.length}
          </span>
        )}
      </button>
    </section>
  )
}

function DiskUsageSection() {
  const { data: disk } = useQuery({
    queryKey: ['settings:disk-usage'],
    queryFn: () => invoke('settings:disk-usage'),
    refetchInterval: 60000 // 1분마다 갱신
  })

  function formatSize(bytes: number): string {
    if (bytes === 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i]
  }

  const usedPct = disk && disk.total > 0 ? Math.min((disk.used / disk.total) * 100, 100) : 0
  const barColor = usedPct > 90 ? 'bg-red-500' : usedPct > 70 ? 'bg-orange-400' : 'bg-accent'

  return (
    <section className="p-3 border-t border-gray-200 dark:border-gray-700 mt-auto">
      <div className="text-[10px] text-gray-400 mb-1">저장소 사용량</div>
      <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${usedPct}%` }} />
      </div>
      <div className="text-[10px] text-gray-400 mt-1">
        {disk ? `${formatSize(disk.used)} 사용` : '계산 중...'}
      </div>
    </section>
  )
}
