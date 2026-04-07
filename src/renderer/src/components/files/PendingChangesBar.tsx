import { useState } from 'react'
import type { PendingChange } from '@shared/types/ipc'

/**
 * PendingChangesBar — 미커밋 변경 파일 표시 (REQ-007, REQ-038)
 *
 * 역할:
 * - 접이식 패널: 요약 바 + 펼치면 파일별 목록
 * - 파일별 개별 커밋/폐기 + 전체 일괄 커밋/폐기
 */

interface PendingChangesBarProps {
  pendingChanges: PendingChange[]
  onCommitAll: () => void
  onDiscardAll: () => void
  onCommitFile?: (filePath: string) => void
  onDiscardFile?: (filePath: string) => void
}

const STATUS_LABEL: Record<string, string> = {
  modified: '수정됨',
  added: '추가됨',
  deleted: '삭제됨'
}

const STATUS_COLOR: Record<string, string> = {
  modified: 'text-orange-500',
  added: 'text-blue-500',
  deleted: 'text-red-400'
}

export function PendingChangesBar({
  pendingChanges, onCommitAll, onDiscardAll, onCommitFile, onDiscardFile
}: PendingChangesBarProps) {
  const [expanded, setExpanded] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState<string | null>(null) // filePath 또는 'all'

  if (pendingChanges.length === 0) return null

  const handleDiscardFile = (filePath: string) => {
    if (confirmDiscard === filePath) {
      onDiscardFile?.(filePath)
      setConfirmDiscard(null)
    } else {
      setConfirmDiscard(filePath)
      setTimeout(() => setConfirmDiscard(null), 3000)
    }
  }

  const handleDiscardAll = () => {
    if (confirmDiscard === 'all') {
      onDiscardAll()
      setConfirmDiscard(null)
    } else {
      setConfirmDiscard('all')
      setTimeout(() => setConfirmDiscard(null), 3000)
    }
  }

  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-700 shrink-0">
      {/* 요약 바 */}
      <div className="h-10 flex items-center px-4 gap-3">
        <button
          onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-1.5"
        >
          <span className={`text-[10px] transition-transform ${expanded ? 'rotate-90' : ''}`}>▶</span>
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-orange-100 dark:bg-orange-900/40 text-status-modified">
            {pendingChanges.length}개 변경됨
          </span>
        </button>
        <div className="flex-1" />
        <button
          onClick={onCommitAll}
          className="px-3 py-1 bg-blue-600 text-white text-[11px] font-semibold rounded-md hover:bg-blue-700 transition"
        >
          일괄 커밋
        </button>
        <button
          onClick={handleDiscardAll}
          className={`px-3 py-1 border text-[11px] rounded-md transition ${
            confirmDiscard === 'all'
              ? 'border-red-400 bg-red-50 text-red-600 font-semibold'
              : 'border-gray-300 dark:border-gray-600 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          {confirmDiscard === 'all' ? '정말 전체 폐기?' : '전체 폐기'}
        </button>
      </div>

      {/* 펼침: 파일별 목록 */}
      {expanded && (
        <div className="px-4 pb-3 space-y-1 max-h-[200px] overflow-y-auto">
          {pendingChanges.map(p => (
            <div key={p.filePath} className="flex items-center gap-2 py-1.5 px-2 bg-white dark:bg-gray-800 rounded-md text-[12px]">
              <span className={`text-[10px] font-semibold w-12 shrink-0 ${STATUS_COLOR[p.changeType] || 'text-gray-400'}`}>
                {STATUS_LABEL[p.changeType] || p.changeType}
              </span>
              <span className="truncate flex-1 font-mono text-gray-700 dark:text-gray-300" title={p.filePath}>
                {p.filePath}
              </span>
              {onCommitFile && (
                <button
                  onClick={() => onCommitFile(p.filePath)}
                  className="px-2 py-0.5 text-[10px] font-semibold border border-blue-200 text-blue-600 rounded hover:bg-blue-50 shrink-0"
                >
                  커밋
                </button>
              )}
              {onDiscardFile && (
                <button
                  onClick={() => handleDiscardFile(p.filePath)}
                  className={`px-2 py-0.5 text-[10px] font-semibold border rounded shrink-0 ${
                    confirmDiscard === p.filePath
                      ? 'border-red-400 bg-red-50 text-red-600'
                      : 'border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200'
                  }`}
                >
                  {confirmDiscard === p.filePath ? '확인' : '폐기'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
