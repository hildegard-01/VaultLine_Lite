import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { invoke } from '@renderer/services/ipcClient'

type SortKey = 'name' | 'repo' | 'size' | 'date'
type SortDir = 'asc' | 'desc'

export function TrashPage(): React.JSX.Element {
  const queryClient = useQueryClient()
  const [restoringId, setRestoringId] = useState<number | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [checked, setChecked] = useState<Set<number>>(new Set())

  const { data: items = [] } = useQuery({
    queryKey: ['trash:list'],
    queryFn: () => invoke('trash:list', {})
  })

  // 정렬
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'name': cmp = (a.filePath.split('/').pop() || '').localeCompare(b.filePath.split('/').pop() || '', 'ko'); break
        case 'repo': cmp = a.repoName.localeCompare(b.repoName, 'ko'); break
        case 'size': cmp = a.originalSize - b.originalSize; break
        case 'date': cmp = new Date(a.deletedAt).getTime() - new Date(b.deletedAt).getTime(); break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [items, sortKey, sortDir])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir(key === 'date' ? 'desc' : 'asc') }
  }
  const sortIndicator = (key: SortKey) => sortKey !== key ? '' : sortDir === 'asc' ? ' ▲' : ' ▼'

  const toggleCheck = (id: number) => {
    const next = new Set(checked)
    next.has(id) ? next.delete(id) : next.add(id)
    setChecked(next)
  }
  const toggleAll = () => {
    if (checked.size === sortedItems.length) setChecked(new Set())
    else setChecked(new Set(sortedItems.map(i => i.id)))
  }
  const allChecked = sortedItems.length > 0 && checked.size === sortedItems.length

  const handleRestore = async (item: typeof items[number]) => {
    if (!window.confirm(`"${item.filePath.split('/').pop()}"을(를) 복원하시겠습니까?`)) return
    setRestoringId(item.id)
    try {
      await invoke('file:restore-deleted', { repoId: item.repoId, trashItemId: item.id, commitMessage: `휴지통에서 복원: ${item.filePath}` })
      queryClient.invalidateQueries({ queryKey: ['trash:list'] })
      queryClient.invalidateQueries({ queryKey: ['file:list', item.repoId] })
    } catch (err) { alert(err instanceof Error ? err.message : '복원 실패') }
    finally { setRestoringId(null) }
  }

  const handlePurge = async (item: typeof items[number]) => {
    if (!window.confirm(`"${item.filePath.split('/').pop()}"을(를) 영구 삭제하시겠습니까?`)) return
    try {
      await invoke('trash:purge', { id: item.id })
      queryClient.invalidateQueries({ queryKey: ['trash:list'] })
    } catch (err) { alert(err instanceof Error ? err.message : '삭제 실패') }
  }

  // 일괄 복원
  const handleBulkRestore = async () => {
    const targets = items.filter(i => checked.has(i.id))
    if (!window.confirm(`${targets.length}개 항목을 복원하시겠습니까?`)) return
    try {
      for (const item of targets) {
        await invoke('file:restore-deleted', { repoId: item.repoId, trashItemId: item.id, commitMessage: `일괄 복원: ${item.filePath}` })
      }
      setChecked(new Set())
      queryClient.invalidateQueries({ queryKey: ['trash:list'] })
      queryClient.invalidateQueries({ queryKey: ['repo:list'] })
    } catch (err) { alert(err instanceof Error ? err.message : '복원 실패') }
  }

  // 일괄 삭제
  const handleBulkPurge = async () => {
    const targets = items.filter(i => checked.has(i.id))
    if (!window.confirm(`${targets.length}개 항목을 영구 삭제하시겠습니까? 되돌릴 수 없습니다.`)) return
    try {
      for (const item of targets) {
        await invoke('trash:purge', { id: item.id })
      }
      setChecked(new Set())
      queryClient.invalidateQueries({ queryKey: ['trash:list'] })
    } catch (err) { alert(err instanceof Error ? err.message : '삭제 실패') }
  }

  const handleEmptyTrash = async () => {
    if (items.length === 0) return
    if (!window.confirm(`휴지통을 비우시겠습니까? ${items.length}개 항목이 영구 삭제됩니다.`)) return
    try {
      await invoke('trash:empty', {})
      setChecked(new Set())
      queryClient.invalidateQueries({ queryKey: ['trash:list'] })
    } catch (err) { alert(err instanceof Error ? err.message : '휴지통 비우기 실패') }
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr)
    return d.toLocaleDateString('ko-KR') + ' ' + d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  }
  function formatSize(bytes: number) {
    if (!bytes) return '—'
    const units = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i]
  }

  return (
    <div className="flex flex-col h-full">
      {/* 툴바 */}
      <div className="h-11 flex items-center justify-between px-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shrink-0">
        {checked.size > 0 ? (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-blue-600">{checked.size}개 선택</span>
            <button onClick={() => setChecked(new Set())}
              className="text-[11px] px-2 py-1 border border-gray-200 dark:border-gray-600 rounded-md hover:bg-gray-50">선택 해제</button>
            <div className="w-px h-5 bg-gray-200 dark:bg-gray-600 mx-1" />
            <button onClick={handleBulkRestore}
              className="text-[11px] px-2.5 py-1 border border-blue-200 text-blue-600 rounded-md hover:bg-blue-50">일괄 복원</button>
            <button onClick={handleBulkPurge}
              className="text-[11px] px-2.5 py-1 border border-red-200 text-red-500 rounded-md hover:bg-red-50">일괄 삭제</button>
          </div>
        ) : (
          <span className="text-sm font-semibold">휴지통</span>
        )}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{items.length}개 항목</span>
          {items.length > 0 && (
            <button onClick={handleEmptyTrash}
              className="text-xs px-3 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50 whitespace-nowrap">모두 비우기</button>
          )}
        </div>
      </div>

      {/* 목록 */}
      <div className="flex-1 overflow-auto">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <div className="text-4xl mb-3">🗑</div>
            <div className="text-sm">휴지통이 비어 있습니다</div>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                <th className="w-9 py-2 text-center">
                  <input type="checkbox" checked={allChecked} onChange={toggleAll} className="accent-navy" />
                </th>
                <th className="py-2 px-4 text-left text-[11px] font-semibold text-gray-400 cursor-pointer select-none hover:text-gray-600"
                  onClick={() => handleSort('name')}>파일명{sortIndicator('name')}</th>
                <th className="py-2 px-3 text-left text-[11px] font-semibold text-gray-400 w-28 cursor-pointer select-none hover:text-gray-600"
                  onClick={() => handleSort('repo')}>저장소{sortIndicator('repo')}</th>
                <th className="py-2 px-3 text-right text-[11px] font-semibold text-gray-400 w-20 cursor-pointer select-none hover:text-gray-600"
                  onClick={() => handleSort('size')}>크기{sortIndicator('size')}</th>
                <th className="py-2 px-3 text-right text-[11px] font-semibold text-gray-400 w-36 cursor-pointer select-none hover:text-gray-600"
                  onClick={() => handleSort('date')}>삭제일{sortIndicator('date')}</th>
                <th className="w-24" />
              </tr>
            </thead>
            <tbody>
              {sortedItems.map(item => (
                <tr key={item.id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td className="py-2.5 text-center">
                    <input type="checkbox" checked={checked.has(item.id)}
                      onChange={() => toggleCheck(item.id)} className="accent-navy" />
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="text-[13px] font-medium">{item.filePath.split('/').pop()}</div>
                    <div className="text-[11px] text-gray-400 truncate">{item.filePath}</div>
                  </td>
                  <td className="py-2.5 px-3 text-xs text-gray-500">{item.repoName}</td>
                  <td className="py-2.5 px-3 text-right text-xs text-gray-500">{formatSize(item.originalSize)}</td>
                  <td className="py-2.5 px-3 text-right text-[11px] text-gray-400">{formatDate(item.deletedAt)}</td>
                  <td className="py-2.5 px-2">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => handleRestore(item)} disabled={restoringId === item.id}
                        className="text-[10px] px-2 py-0.5 rounded border border-blue-200 text-blue-600 hover:bg-blue-50 disabled:opacity-50 whitespace-nowrap shrink-0">
                        {restoringId === item.id ? '복원중' : '복원'}
                      </button>
                      <button onClick={() => handlePurge(item)}
                        className="text-[10px] px-2 py-0.5 rounded border border-red-200 text-red-500 hover:bg-red-50 whitespace-nowrap shrink-0">삭제</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
