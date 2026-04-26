import { useState, useEffect, useRef } from 'react'
import { invoke } from '@renderer/services/ipcClient'
import { FileIcon } from '@renderer/components/shared/FileIcon'
import type { SearchResult } from '@shared/types/ipc'

/**
 * SearchModal — 검색 (Ctrl+K)
 * 검색 타입: 전체 / 파일명 / 커밋 메시지
 * FTS5 검색 실패 시 LIKE 폴백
 */

interface SearchModalProps {
  onClose: () => void
  onSelect: (result: SearchResult) => void
}

type SearchType = 'filename' | 'commit' | 'content'

const SEARCH_TYPES: Array<{ value: SearchType | ''; label: string }> = [
  { value: '', label: '전체' },
  { value: 'filename', label: '파일명' },
  { value: 'commit', label: '커밋' }
]

export function SearchModal({ onClose, onSelect }: SearchModalProps) {
  const [query, setQuery] = useState('')
  const [searchType, setSearchType] = useState<SearchType | ''>('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (query.trim().length < 1) {
      setResults([])
      return
    }
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const type = searchType || undefined
        if (type) {
          const data = await invoke('search:query', { query: query.trim(), type })
          setResults(data)
        } else {
          const data = await invoke('search:global', { query: query.trim() })
          setResults(data)
        }
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [query, searchType])

  // Escape 키로 닫기
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 bg-black/30 flex items-start justify-center pt-[15vh] z-[200]" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-[560px] bg-white dark:bg-gray-900 rounded-xl overflow-hidden shadow-2xl">
        {/* 검색 입력 */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" viewBox="0 0 18 18">
            <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M12 12L15.5 15.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="flex-1 text-sm outline-none bg-transparent"
            placeholder="검색어 입력 (1글자 이상)..."
          />
          <kbd className="text-[10px] text-gray-400 border border-gray-200 dark:border-gray-600 px-1.5 py-0.5 rounded">ESC</kbd>
        </div>

        {/* 검색 타입 탭 */}
        <div className="flex gap-1 px-4 py-2 border-b border-gray-100 dark:border-gray-700">
          {SEARCH_TYPES.map(t => (
            <button
              key={t.value}
              onClick={() => setSearchType(t.value as SearchType | '')}
              className={`px-2.5 py-0.5 text-[11px] rounded-md transition ${
                searchType === t.value
                  ? 'bg-navy text-white font-semibold'
                  : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* 결과 */}
        <div className="max-h-[400px] overflow-y-auto">
          {loading && (
            <div className="py-8 text-center text-sm text-gray-400">검색 중...</div>
          )}
          {!loading && query.trim().length >= 1 && results.length === 0 && (
            <div className="py-8 text-center text-sm text-gray-400">검색 결과가 없습니다</div>
          )}
          {!loading && results.map((r, i) => {
            const typeLabel = r.matchType === 'filename' ? '파일명' : r.matchType === 'commit' ? '커밋' : '내용'
            const typeColor = r.matchType === 'filename' ? 'bg-blue-100 text-blue-600' : r.matchType === 'commit' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'
            const fileName = r.filePath.split('/').pop() ?? r.filePath
            return (
              <div
                key={i}
                onClick={() => onSelect(r)}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 dark:hover:bg-gray-800 cursor-pointer border-b border-gray-100 dark:border-gray-700 last:border-b-0"
              >
                <FileIcon type="file" name={r.filePath} size={16} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium truncate">{fileName}</span>
                    {r.remoteRepoId && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold shrink-0 bg-teal-100 text-teal-700">공유</span>
                    )}
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold shrink-0 ${typeColor}`}>{typeLabel}</span>
                  </div>
                  {r.snippet && !r.remoteRepoId && (
                    <div className="text-[11px] text-gray-400 truncate mt-0.5" dangerouslySetInnerHTML={{ __html: r.snippet }} />
                  )}
                  <div className="text-[10px] text-gray-300 mt-0.5">
                    {r.repoName}
                    {r.ownerName && ` · ${r.ownerName}`}
                    {r.revision > 0 && ` · r.${r.revision}`}
                  </div>
                </div>
              </div>
            )
          })}
          {!loading && query.trim().length < 1 && (
            <div className="py-8 text-center text-sm text-gray-400">검색어를 입력하세요</div>
          )}
        </div>
      </div>
    </div>
  )
}
