import { useState } from 'react'
import { invoke } from '@renderer/services/ipcClient'
import type { ConflictEntry } from '@shared/types/ipc'

/**
 * ConflictModal — 충돌 해결 UI (REQ-034)
 */

interface ConflictModalProps {
  remoteRepoId: number
  conflicts: ConflictEntry[]
  onClose: () => void
  onResolved: () => void
}

export function ConflictModal({ remoteRepoId, conflicts, onClose, onResolved }: ConflictModalProps) {
  const [resolving, setResolving] = useState<string | null>(null)
  const [resolved, setResolved] = useState<Set<string>>(new Set())

  const handleResolve = async (filePath: string, resolution: 'mine' | 'theirs') => {
    setResolving(filePath)
    try {
      await invoke('sync:resolve-conflict', { remoteRepoId, filePath, resolution })
      setResolved(prev => new Set(prev).add(filePath))

      // 모두 해결되면 콜백
      if (resolved.size + 1 === conflicts.length) {
        onResolved()
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '충돌 해결 실패')
    } finally {
      setResolving(null)
    }
  }

  const allResolved = resolved.size === conflicts.length

  return (
    <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-[210]"
      onMouseDown={e => { if (e.target === e.currentTarget && allResolved) onClose() }}>
      <div className="w-[480px] bg-white dark:bg-gray-900 rounded-xl overflow-hidden shadow-2xl">
        <div className="px-5 py-3.5 border-b border-gray-200 dark:border-gray-700 font-bold text-sm">
          충돌 해결 ({resolved.size}/{conflicts.length})
        </div>
        <div className="p-5 max-h-[400px] overflow-y-auto">
          {conflicts.length === 0 ? (
            <p className="text-[12px] text-gray-400 text-center py-6">충돌이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {conflicts.map(c => {
                const isResolved = resolved.has(c.filePath)
                const isResolving = resolving === c.filePath
                return (
                  <div key={c.filePath} className={`p-3 rounded-lg border ${
                    isResolved ? 'bg-green-50 border-green-200' : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                  }`}>
                    <div className="text-[12px] font-medium mb-2">
                      {isResolved && <span className="text-green-600 mr-1">✓</span>}
                      {c.filePath}
                    </div>
                    {!isResolved && (
                      <div className="flex gap-2">
                        <button onClick={() => handleResolve(c.filePath, 'mine')} disabled={isResolving}
                          className="px-3 py-1 text-[11px] font-semibold border border-blue-300 text-blue-600 rounded-md hover:bg-blue-50 disabled:opacity-50">
                          {isResolving ? '처리 중…' : '내 것 유지'}
                        </button>
                        <button onClick={() => handleResolve(c.filePath, 'theirs')} disabled={isResolving}
                          className="px-3 py-1 text-[11px] font-semibold border border-orange-300 text-orange-600 rounded-md hover:bg-orange-50 disabled:opacity-50">
                          상대 것 수락
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end bg-gray-50 dark:bg-gray-800">
          <button onClick={onClose} disabled={!allResolved && conflicts.length > 0}
            className="px-5 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 hover:bg-gray-50 disabled:opacity-50">
            {allResolved ? '완료' : `${conflicts.length - resolved.size}개 남음`}
          </button>
        </div>
      </div>
    </div>
  )
}
