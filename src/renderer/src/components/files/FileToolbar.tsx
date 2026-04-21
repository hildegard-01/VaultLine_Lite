import { useState, useCallback } from 'react'

interface FileToolbarProps {
  itemCount: number
  checkedCount: number
  onUpload: () => Promise<void> | void
  onNewFolder: () => Promise<void> | void
  onLockRules?: () => void
  onBulkDelete?: () => void
  onBulkMove?: () => void
  onBulkLock?: () => void
  onBulkShare?: () => void
  onClearChecked?: () => void
}

export function FileToolbar({
  itemCount, checkedCount, onUpload, onNewFolder, onLockRules,
  onBulkDelete, onBulkMove, onBulkLock, onBulkShare, onClearChecked
}: FileToolbarProps) {
  const [uploading, setUploading] = useState(false)
  const [creatingFolder, setCreatingFolder] = useState(false)

  const handleUpload = useCallback(async () => {
    if (uploading) return
    setUploading(true)
    try { await onUpload() } finally { setUploading(false) }
  }, [onUpload, uploading])

  const handleNewFolder = useCallback(async () => {
    if (creatingFolder) return
    setCreatingFolder(true)
    try { await onNewFolder() } finally { setCreatingFolder(false) }
  }, [onNewFolder, creatingFolder])

  return (
    <div className="h-11 flex items-center px-4 gap-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shrink-0">
      {checkedCount > 0 ? (
        /* 일괄 작업 모드 */
        <>
          <span className="text-xs font-semibold text-blue-600">{checkedCount}개 선택</span>
          <button onClick={onClearChecked}
            className="text-[11px] px-2 py-1 border border-gray-200 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700">
            선택 해제
          </button>
          <div className="w-px h-5 bg-gray-200 dark:bg-gray-600 mx-1" />
          {onBulkMove && (
            <button onClick={onBulkMove}
              className="text-[11px] px-2.5 py-1 border border-blue-200 text-blue-600 rounded-md hover:bg-blue-50">
              이동
            </button>
          )}
          {onBulkDelete && (
            <button onClick={onBulkDelete}
              className="text-[11px] px-2.5 py-1 border border-red-200 text-red-500 rounded-md hover:bg-red-50">
              삭제
            </button>
          )}
          {onBulkLock && (
            <button onClick={onBulkLock}
              className="text-[11px] px-2.5 py-1 border border-purple-200 text-purple-600 rounded-md hover:bg-purple-50">
              잠금
            </button>
          )}
          {onBulkShare && (
            <button onClick={onBulkShare}
              className="text-[11px] px-2.5 py-1 border border-green-200 text-green-600 rounded-md hover:bg-green-50">
              공유
            </button>
          )}
        </>
      ) : (
        /* 기본 모드 */
        <>
          <button onClick={handleUpload} disabled={uploading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-navy text-white text-xs font-semibold rounded-md hover:bg-navy-dark transition disabled:opacity-50 disabled:cursor-wait">
            {uploading ? (
              <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity="0.3" />
                <path d="M8 2a6 6 0 0 1 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16"><path d="M8 10V2M8 2L5 5M8 2L11 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><path d="M2 10v3c0 .55.45 1 1 1h10c.55 0 1-.45 1-1v-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
            )}
            {uploading ? '처리 중...' : '업로드'}
          </button>
          <button onClick={handleNewFolder} disabled={creatingFolder}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 dark:border-gray-600 text-xs rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition disabled:opacity-50 disabled:cursor-wait">
            {creatingFolder ? (
              <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity="0.3" />
                <path d="M8 2a6 6 0 0 1 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16"><path d="M1 4c0-.55.45-1 1-1h4l1.5 1.5H14c.55 0 1 .45 1 1v7c0 .55-.45 1-1 1H2c-.55 0-1-.45-1-1V4z" stroke="currentColor" strokeWidth="1.2" fill="none"/><path d="M8 7.5v3.5M6.25 9.25h3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
            )}
            {creatingFolder ? '생성 중...' : '새 폴더'}
          </button>
          {onLockRules && (
            <button onClick={onLockRules}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 dark:border-gray-600 text-xs rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16">
                <rect x="4" y="7" width="8" height="7" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                <path d="M6 7V5a2 2 0 1 1 4 0v2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
              잠금 규칙
            </button>
          )}
        </>
      )}
      <div className="flex-1" />
      <span className="text-xs text-gray-400">{itemCount}개 항목</span>
    </div>
  )
}
