import { useState, useCallback, useMemo } from 'react'
import { StatusDot } from '@renderer/components/shared/StatusDot'
import { FileIcon } from '@renderer/components/shared/FileIcon'
import type { FileEntry } from '@shared/types/ipc'

/**
 * FileTable — 파일 테이블 (Phase 9 드래그앤드롭 보강)
 *
 * 역할:
 * - 파일/폴더 목록 표시 (체크박스, 상태, 아이콘, 크기, 수정일)
 * - 행 드래그 시작 → OUT (앱→외부) 또는 MOVE (앱 내부) 지원
 * - 폴더 행에 드롭 → 파일 이동 (svn move)
 */

interface FileTableProps {
  files: FileEntry[]
  selectedFile: FileEntry | null
  onSelect: (file: FileEntry) => void
  onDoubleClick: (file: FileEntry) => void
  onDragExport?: (file: FileEntry) => void
  onMoveToFolder?: (srcFile: FileEntry, destFolder: FileEntry) => void
  onBookmarkToggle?: (file: FileEntry) => void
  bookmarkedPaths?: Set<string>
  fileTagsMap?: Map<string, Array<{ name: string; color: string }>>
  modifiedPaths?: Set<string>
  checkedPaths?: Set<string>
  onCheckedChange?: (paths: Set<string>) => void
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i]
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—'
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return '방금'
  if (diffMin < 60) return `${diffMin}분 전`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour}시간 전`
  const diffDay = Math.floor(diffHour / 24)
  if (diffDay < 7) return `${diffDay}일 전`
  return date.toLocaleDateString('ko-KR')
}

type SortKey = 'name' | 'size' | 'date'
type SortDir = 'asc' | 'desc'

export function FileTable({ files, selectedFile, onSelect, onDoubleClick, onDragExport, onMoveToFolder, onBookmarkToggle, bookmarkedPaths = new Set(), fileTagsMap = new Map(), modifiedPaths = new Set(), checkedPaths, onCheckedChange }: FileTableProps) {
  // 외부 제어 또는 내부 상태
  const [internalChecked, setInternalChecked] = useState<Set<string>>(new Set())
  const checked = checkedPaths ?? internalChecked
  const setChecked = onCheckedChange ?? setInternalChecked

  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  // 정렬: 폴더 항상 먼저, 그 안에서 sortKey 기준
  const sortedFiles = useMemo(() => {
    const sorted = [...files].sort((a, b) => {
      // 폴더 우선
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1

      let cmp = 0
      switch (sortKey) {
        case 'name':
          cmp = a.name.localeCompare(b.name, 'ko')
          break
        case 'size':
          cmp = a.size - b.size
          break
        case 'date':
          cmp = new Date(a.date).getTime() - new Date(b.date).getTime()
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [files, sortKey, sortDir])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return ''
    return sortDir === 'asc' ? ' ▲' : ' ▼'
  }

  const toggleCheck = (path: string) => {
    const next = new Set(checked)
    next.has(path) ? next.delete(path) : next.add(path)
    setChecked(next)
  }

  const toggleAll = () => {
    if (checked.size === sortedFiles.length) {
      setChecked(new Set())
    } else {
      setChecked(new Set(sortedFiles.map(f => f.path)))
    }
  }
  const allChecked = sortedFiles.length > 0 && checked.size === sortedFiles.length

  const getStatus = (file: FileEntry): string => {
    if (file.locked) return 'locked'
    if (modifiedPaths.has(file.path)) return 'modified'
    return 'synced'
  }

  // 드래그 시작 — OUT (앱→외부) 또는 내부 이동
  const handleDragStart = useCallback((e: React.DragEvent, file: FileEntry) => {
    // 커스텀 데이터로 파일 정보 전달 (앱 내 이동용)
    e.dataTransfer.setData('application/vaultline-file', JSON.stringify({
      path: file.path,
      name: file.name,
      type: file.type
    }))
    e.dataTransfer.effectAllowed = 'copyMove'

    // Electron OUT 드래그 (Main Process에서 startDrag 호출)
    if (file.type === 'file' && onDragExport) {
      onDragExport(file)
    }
  }, [onDragExport])

  // 폴더 행에 드래그 오버
  const handleDragOver = useCallback((e: React.DragEvent, file: FileEntry) => {
    if (file.type !== 'dir') return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropTarget(file.path)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDropTarget(null)
  }, [])

  // 폴더 행에 드롭 → 파일 이동
  const handleDrop = useCallback((e: React.DragEvent, destFolder: FileEntry) => {
    e.preventDefault()
    setDropTarget(null)
    if (destFolder.type !== 'dir') return

    const data = e.dataTransfer.getData('application/vaultline-file')
    if (!data) return

    try {
      const srcFile = JSON.parse(data) as { path: string; name: string; type: string }
      // 자기 자신이나 같은 폴더로의 이동 방지
      if (srcFile.path === destFolder.path) return
      if (onMoveToFolder) {
        onMoveToFolder(srcFile as FileEntry, destFolder)
      }
    } catch { /* 파싱 실패 무시 */ }
  }, [onMoveToFolder])

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
            <th className="w-9 py-2 text-center">
              <input type="checkbox" checked={allChecked} onChange={toggleAll} className="accent-navy" />
            </th>
            <th className="w-3 py-2" />
            <th className="py-2 px-2 text-left text-[11px] font-semibold text-gray-400 cursor-pointer select-none hover:text-gray-600" onClick={() => handleSort('name')}>이름{sortIndicator('name')}</th>
            <th className="py-2 px-3 text-right text-[11px] font-semibold text-gray-400 w-20 cursor-pointer select-none hover:text-gray-600" onClick={() => handleSort('size')}>크기{sortIndicator('size')}</th>
            <th className="py-2 px-3 text-right text-[11px] font-semibold text-gray-400 w-24 cursor-pointer select-none hover:text-gray-600" onClick={() => handleSort('date')}>수정일{sortIndicator('date')}</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {sortedFiles.map(file => {
            const isSelected = selectedFile?.path === file.path
            const isDropTarget = dropTarget === file.path
            return (
              <tr
                key={file.path}
                draggable
                onClick={() => onSelect(file)}
                onDoubleClick={() => onDoubleClick(file)}
                onDragStart={(e) => handleDragStart(e, file)}
                onDragOver={(e) => handleDragOver(e, file)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, file)}
                className={`border-b border-gray-100 dark:border-gray-700 cursor-pointer transition-colors
                  ${isDropTarget ? 'bg-blue-100 dark:bg-blue-900/40 ring-2 ring-blue-400 ring-inset' : ''}
                  ${isSelected && !isDropTarget ? 'bg-blue-50 dark:bg-blue-900/20' : ''}
                  ${!isSelected && !isDropTarget ? 'hover:bg-gray-50 dark:hover:bg-gray-800' : ''}`}
              >
                <td className="py-2 text-center">
                  <input
                    type="checkbox"
                    checked={checked.has(file.path)}
                    onChange={() => toggleCheck(file.path)}
                    onClick={e => e.stopPropagation()}
                    className="accent-navy"
                  />
                </td>
                <td className="py-2">
                  <StatusDot status={getStatus(file)} />
                </td>
                <td className="py-2 px-2">
                  <div className="flex items-center gap-2">
                    <FileIcon type={file.type} name={file.name} size={18} />
                    <span className="font-medium text-[13px]">{file.name}</span>
                    {file.locked && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-status-locked font-medium">보호됨</span>
                    )}
                    {(() => {
                      const tags = fileTagsMap.get(file.path)
                      if (!tags || tags.length === 0) return null
                      const first = tags[0]
                      return (
                        <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded font-medium"
                          style={{ backgroundColor: first.color + '20', color: first.color }}>
                          {first.name}{tags.length > 1 && <span className="opacity-60"> +{tags.length - 1}</span>}
                        </span>
                      )
                    })()}
                  </div>
                </td>
                <td className="py-2 px-3 text-right text-xs text-gray-500">
                  {file.type === 'dir' ? '—' : formatSize(file.size)}
                </td>
                <td className="py-2 px-3 text-right text-xs text-gray-500">
                  {formatDate(file.date)}
                </td>
                <td className="py-2 px-1 text-center">
                  <svg
                    className={`w-3.5 h-3.5 cursor-pointer transition ${bookmarkedPaths.has(file.path) ? 'text-yellow-400' : 'text-gray-300 hover:text-yellow-400'}`}
                    viewBox="0 0 14 14"
                    fill={bookmarkedPaths.has(file.path) ? 'currentColor' : 'none'}
                    onClick={(e) => { e.stopPropagation(); onBookmarkToggle?.(file) }}
                  >
                    <path d="M7 1l1.76 3.58 3.97.58-2.86 2.78.65 3.95L7 10.04 3.48 11.89l.65-3.95L1.27 5.16l3.97-.58L7 1z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round"/>
                  </svg>
                </td>
              </tr>
            )
          })}
          {files.length === 0 && (
            <tr>
              <td colSpan={6} className="py-16 text-center text-sm text-gray-400">
                파일이 없습니다. 파일을 업로드하거나 드래그해 주세요.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
