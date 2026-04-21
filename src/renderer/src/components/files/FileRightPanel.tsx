import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { invoke } from '@renderer/services/ipcClient'
import { FileIcon } from '@renderer/components/shared/FileIcon'
import { StatusDot } from '@renderer/components/shared/StatusDot'
import type { FileEntry, CommitLogEntry, Tag } from '@shared/types/ipc'

// 단순 diff 텍스트를 라인별로 색상 표시
function DiffViewer({ diff }: { diff: string }) {
  const lines = diff.split('\n')
  return (
    <div className="font-mono text-[10px] leading-relaxed overflow-x-auto">
      {lines.map((line, i) => {
        const cls = line.startsWith('+') && !line.startsWith('+++')
          ? 'bg-green-50 text-green-700'
          : line.startsWith('-') && !line.startsWith('---')
          ? 'bg-red-50 text-red-600'
          : line.startsWith('@@')
          ? 'bg-blue-50 text-blue-600'
          : 'text-gray-500'
        return (
          <div key={i} className={`px-1 whitespace-pre ${cls}`}>{line || ' '}</div>
        )
      })}
    </div>
  )
}

interface FileRightPanelProps {
  file: FileEntry | null
  repoId?: number
  recentCommits?: CommitLogEntry[]
  repoStats?: { fileCount: number; totalSize: number; revisions: number }
  onLockToggle?: (file: FileEntry) => void
  onShare?: (file: FileEntry) => void
  onDelete?: (file: FileEntry) => void
  onMove?: (file: FileEntry) => void
  onPreview?: (file: FileEntry) => void
  onRestoreVersion?: (file: FileEntry, revision: number) => void
  onClearSelection?: () => void
  onTagsChanged?: () => void
  onDetail?: (file: FileEntry) => void
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i]
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—'
  const date = new Date(dateStr)
  const now = new Date()
  const diffMin = Math.floor((now.getTime() - date.getTime()) / 60000)
  if (diffMin < 1) return '방금'
  if (diffMin < 60) return `${diffMin}분 전`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour}시간 전`
  return `${Math.floor(diffHour / 24)}일 전`
}

export function FileRightPanel({
  file, repoId, recentCommits = [], repoStats,
  onLockToggle, onShare, onDelete, onMove, onPreview, onRestoreVersion, onClearSelection, onTagsChanged, onDetail
}: FileRightPanelProps) {

  const [showTagPicker, setShowTagPicker] = useState(false)
  const [showAllCommits, setShowAllCommits] = useState(false)
  const [expandedDiff, setExpandedDiff] = useState<number | null>(null)

  // 전체 커밋 이력 (더보기 클릭 시)
  const { data: allCommits = [] } = useQuery({
    queryKey: ['commit:log:full', repoId, file?.path],
    queryFn: () => invoke('commit:log', { repoId: repoId!, path: file!.path, limit: 200 }),
    enabled: !!repoId && !!file && showAllCommits
  })

  // diff 조회
  const { data: diffText, isFetching: diffLoading } = useQuery({
    queryKey: ['commit:diff', repoId, file?.path, expandedDiff],
    queryFn: () => invoke('commit:diff', {
      repoId: repoId!,
      path: file!.path,
      rev1: expandedDiff! - 1,
      rev2: expandedDiff!
    }),
    enabled: !!repoId && !!file && expandedDiff !== null
  })

  // 파일에 붙은 태그 조회
  const { data: fileTags = [], refetch: refetchFileTags } = useQuery({
    queryKey: ['tag:file-tags', repoId, file?.path],
    queryFn: () => invoke('tag:file-tags', { repoId: repoId!, filePath: file!.path }),
    enabled: !!repoId && !!file
  })

  // 전체 태그 목록
  const { data: allTags = [] } = useQuery({
    queryKey: ['tag:list'],
    queryFn: () => invoke('tag:list'),
    enabled: showTagPicker
  })

  const handleDetachTag = async (tag: Tag) => {
    if (!repoId || !file) return
    try {
      await invoke('tag:detach', { repoId, filePath: file.path, tagId: tag.id })
      refetchFileTags()
      onTagsChanged?.()
    } catch { /* 무시 */ }
  }

  const handleAttachTag = async (tag: Tag) => {
    if (!repoId || !file) return
    try {
      await invoke('tag:attach', { repoId, filePath: file.path, tagId: tag.id })
      refetchFileTags()
      setShowTagPicker(false)
      onTagsChanged?.()
    } catch { /* 무시 */ }
  }

  if (!file) {
    return (
      <aside className="w-[260px] min-w-[260px] border-l border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 overflow-y-auto p-4">
        <h3 className="text-[11px] font-semibold text-gray-400 mb-3">저장소 현황</h3>
        {repoStats ? (
          <div className="grid grid-cols-2 gap-2 mb-4">
            {[
              { label: '파일', value: `${repoStats.fileCount}개` },
              { label: '리비전', value: `r.${repoStats.revisions}` },
              { label: '크기', value: formatSize(repoStats.totalSize) },
              { label: '보호됨', value: '—' }
            ].map(m => (
              <div key={m.label} className="p-2.5 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="text-[10px] text-gray-400">{m.label}</div>
                <div className="text-base font-bold mt-0.5">{m.value}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-400">저장소를 선택하세요</p>
        )}
      </aside>
    )
  }

  const status = file.locked ? 'locked' : 'synced'

  return (
    <aside className="w-[260px] min-w-[260px] border-l border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 overflow-y-auto p-4">
      {/* 저장소 현황으로 돌아가기 */}
      <button
        onClick={onClearSelection}
        className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-blue-500 mb-3 transition"
      >
        ← 저장소 현황
      </button>

      {/* 파일 정보 */}
      <div className="flex items-center gap-2.5 mb-3">
        <FileIcon type={file.type} name={file.name} size={24} />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[13px] truncate">{file.name}</div>
          <div className="text-[11px] text-gray-500 mt-0.5">
            {file.type === 'dir' ? '폴더' : formatSize(file.size)} · {formatDate(file.date)}
          </div>
        </div>
      </div>

      {/* 상태 배지 */}
      <div className="flex gap-1.5 flex-wrap mb-3">
        {file.locked && (
          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-status-locked">🔒 보호 잠금</span>
        )}
        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-green-50 text-status-synced flex items-center gap-1">
          <StatusDot status={status} className="w-1.5 h-1.5" />
          {status === 'locked' ? '보호됨' : '최신'}
        </span>
      </div>

      {/* 빠른 작업 */}
      <div className="grid grid-cols-2 gap-1.5 mb-4">
        {file.type !== 'dir' && (
          <button
            onClick={() => onDetail?.(file)}
            className="py-1.5 text-[11px] font-semibold border border-blue-200 text-blue-600 rounded-md bg-white dark:bg-gray-800 hover:bg-blue-50 transition"
          >
            상세보기
          </button>
        )}
        {file.type !== 'dir' && (
          <button
            onClick={() => onPreview?.(file)}
            className="py-1.5 text-[11px] font-semibold border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 hover:bg-gray-50 transition"
          >
            미리보기
          </button>
        )}
        <button
          onClick={() => onShare?.(file)}
          className="py-1.5 text-[11px] font-semibold border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 hover:bg-gray-50 transition"
        >
          공유
        </button>
        {file.type !== 'dir' && (
          <button
            onClick={() => onLockToggle?.(file)}
            className={`py-1.5 text-[11px] font-semibold border rounded-md bg-white dark:bg-gray-800 hover:bg-gray-50 transition ${
              file.locked ? 'border-purple-200 text-status-locked' : 'border-gray-200 dark:border-gray-600'
            }`}
          >
            {file.locked ? '잠금해제' : '잠금'}
          </button>
        )}
        <button
          onClick={() => onMove?.(file)}
          className="py-1.5 text-[11px] font-semibold border border-blue-200 text-blue-600 rounded-md bg-white dark:bg-gray-800 hover:bg-blue-50 transition"
        >
          이동
        </button>
        <button
          onClick={() => onDelete?.(file)}
          className="py-1.5 text-[11px] font-semibold border border-red-200 text-red-500 rounded-md bg-white dark:bg-gray-800 hover:bg-red-50 transition"
        >
          삭제
        </button>
      </div>

      {/* 태그 */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <h3 className="text-[10px] font-semibold text-gray-400">태그</h3>
          <button
            onClick={() => setShowTagPicker(v => !v)}
            className="text-[10px] text-blue-500 hover:text-blue-700"
          >
            + 추가
          </button>
        </div>

        {/* 태그 피커 */}
        {showTagPicker && (
          <div className="mb-2 p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg">
            {allTags.length === 0 ? (
              <p className="text-[11px] text-gray-400">태그가 없습니다</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {allTags
                  .filter(t => !fileTags.some(ft => ft.id === t.id))
                  .map(tag => (
                    <button
                      key={tag.id}
                      onClick={() => handleAttachTag(tag)}
                      className="px-2 py-0.5 rounded text-[10px] font-medium hover:opacity-80"
                      style={{ backgroundColor: tag.color + '20', color: tag.color, border: `1px solid ${tag.color}40` }}
                    >
                      {tag.name}
                    </button>
                  ))
                }
              </div>
            )}
          </div>
        )}

        {/* 현재 태그 목록 */}
        {fileTags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {fileTags.map(tag => (
              <span
                key={tag.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium"
                style={{ backgroundColor: tag.color + '20', color: tag.color }}
              >
                {tag.name}
                <button
                  onClick={() => handleDetachTag(tag)}
                  className="hover:opacity-60 leading-none"
                >✕</button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-gray-400">태그 없음</p>
        )}
      </div>

      {/* 파일 경로 */}
      <div className="mb-4 p-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600">
        <div className="text-[10px] text-gray-400 mb-0.5">경로</div>
        <div className="text-[11px] text-gray-600 dark:text-gray-300 break-all">{file.path || '/'}</div>
        {file.type !== 'dir' && (
          <div className="flex gap-3 mt-1.5 text-[10px] text-gray-400">
            <span>크기 {formatSize(file.size)}</span>
            <span>수정 {formatDate(file.date)}</span>
          </div>
        )}
      </div>

      {/* 커밋 이력 */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[10px] font-semibold text-gray-400">커밋 이력</h3>
        {recentCommits.length >= 5 && (
          <button
            onClick={() => { setShowAllCommits(v => !v); setExpandedDiff(null) }}
            className="text-[10px] text-blue-500 hover:text-blue-700"
          >
            {showAllCommits ? '접기' : '전체 보기'}
          </button>
        )}
      </div>

      {(() => {
        const commits: CommitLogEntry[] = showAllCommits && allCommits.length > 0 ? allCommits : recentCommits
        if (commits.length === 0) return <p className="text-xs text-gray-400">커밋 이력이 없습니다</p>
        return commits.map((c, i) => (
          <div key={c.revision} className={`${i < commits.length - 1 ? 'border-b border-gray-100 dark:border-gray-700' : ''}`}>
            <div
              className="py-1.5 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 rounded px-1 -mx-1 transition"
              onClick={() => setExpandedDiff(expandedDiff === c.revision ? null : c.revision)}
            >
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-blue-600">r.{c.revision}</span>
                <div className="flex items-center gap-1.5">
                  {c.author && <span className="text-gray-400 text-[10px]">{c.author}</span>}
                  <span className="text-gray-400 text-[11px]">{formatDate(c.date)}</span>
                  {file.type !== 'dir' && (
                    <button
                      onClick={e => { e.stopPropagation(); onRestoreVersion?.(file, c.revision) }}
                      className="text-[10px] px-1.5 py-0.5 rounded border border-orange-200 text-orange-500 hover:bg-orange-50"
                    >
                      복원
                    </button>
                  )}
                </div>
              </div>
              <div className="text-[11px] text-gray-500 mt-0.5 truncate">{c.message}</div>
            </div>

            {/* 인라인 Diff */}
            {expandedDiff === c.revision && (
              <div className="mb-1.5 rounded border border-gray-200 dark:border-gray-600 overflow-hidden">
                {diffLoading ? (
                  <div className="text-[11px] text-gray-400 p-2">불러오는 중...</div>
                ) : diffText ? (
                  <DiffViewer diff={diffText as string} />
                ) : (
                  <div className="text-[11px] text-gray-400 p-2">변경 내용 없음</div>
                )}
              </div>
            )}
          </div>
        ))
      })()}
    </aside>
  )
}
