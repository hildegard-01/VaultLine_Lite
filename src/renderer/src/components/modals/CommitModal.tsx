import { useState } from 'react'
import { FileIcon } from '@renderer/components/shared/FileIcon'

interface CommitFile {
  name: string
  type: 'file' | 'dir'
  size: string
  status: 'NEW' | 'UPDATE' | 'MODIFIED'
  checked: boolean
}

interface CommitModalProps {
  files: CommitFile[]
  defaultMessage?: string
  currentRevision?: number
  onCommit: (message: string, selectedFiles: string[]) => void
  onClose: () => void
}

export function CommitModal({ files, defaultMessage = '', currentRevision, onCommit, onClose }: CommitModalProps) {
  const [title, setTitle] = useState(defaultMessage)
  const [description, setDescription] = useState('')
  const [checkedFiles, setCheckedFiles] = useState<Set<string>>(new Set(files.map(f => f.name)))

  const toggleFile = (name: string) => {
    setCheckedFiles(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  const [committing, setCommitting] = useState(false)

  const handleCommit = async () => {
    if (committing) return
    setCommitting(true)
    try {
      const msg = description ? `${title}\n\n${description}` : title
      await onCommit(msg, Array.from(checkedFiles))
    } finally {
      setCommitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-[200]" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-[520px] bg-white dark:bg-gray-900 rounded-xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <span className="font-bold text-sm">커밋</span>
          {currentRevision && <span className="text-xs text-gray-400">현재 r.{currentRevision}</span>}
        </div>

        {/* Body */}
        <div className="p-5">
          {/* File list */}
          <div className="text-[11px] font-semibold text-gray-400 mb-2">변경 파일</div>
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden mb-4">
            {files.map((f, i) => (
              <div key={f.name} className={`flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 ${i < files.length - 1 ? 'border-b border-gray-200 dark:border-gray-700' : ''}`}>
                <input type="checkbox" checked={checkedFiles.has(f.name)} onChange={() => toggleFile(f.name)} className="accent-navy" />
                <FileIcon type={f.type} name={f.name} size={16} />
                <span className="flex-1 text-xs font-medium truncate">{f.name}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${f.status === 'NEW' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>
                  {f.status}
                </span>
                <span className="text-[11px] text-gray-400">{f.size}</span>
              </div>
            ))}
          </div>

          {/* Commit message */}
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-[11px] font-semibold text-gray-400">커밋 메시지</span>
            <span className="text-[10px] text-gray-400">Shift+Enter로 줄바꿈</span>
          </div>
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full px-3 py-2.5 text-[13px] font-semibold border-none outline-none bg-white dark:bg-gray-900"
              placeholder="요약 (제목)"
            />
            <hr className="border-gray-200 dark:border-gray-700" />
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2.5 text-xs border-none outline-none bg-white dark:bg-gray-900 text-gray-500 resize-y"
              placeholder="상세 설명 (선택사항)"
            />
          </div>
          <div className="text-[10px] text-gray-400 mt-1">첫 줄은 요약(제목), 아래는 상세 설명</div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 bg-gray-50 dark:bg-gray-800">
          <button onClick={onClose} className="px-5 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 hover:bg-gray-50">취소</button>
          <button onClick={handleCommit} disabled={!title.trim() || committing} className="px-5 py-1.5 text-xs font-semibold bg-navy text-white rounded-md hover:bg-navy-dark disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5">
            {committing && (
              <svg className="w-3 h-3 animate-spin" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity="0.3" />
                <path d="M8 2a6 6 0 0 1 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            )}
            {committing ? '커밋 중...' : '커밋'}
          </button>
        </div>
      </div>
    </div>
  )
}
