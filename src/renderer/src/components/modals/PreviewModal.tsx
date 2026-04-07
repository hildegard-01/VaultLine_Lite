import { useState, useEffect } from 'react'
import { invoke } from '@renderer/services/ipcClient'
import type { FileEntry } from '@shared/types/ipc'

interface PreviewModalProps {
  file: FileEntry
  repoId: number
  onClose: () => void
}

/** 로컬 파일 경로 → vaultline-preview:// URL (한글 경로 인코딩) */
function toPreviewUrl(absPath: string): string {
  const normalized = absPath.replace(/\\/g, '/')
  // 각 경로 세그먼트를 인코딩
  const encoded = normalized.split('/').map(seg => encodeURIComponent(seg)).join('/')
  return `vaultline-preview://${encoded}`
}

export function PreviewModal({ file, repoId, onClose }: PreviewModalProps) {
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'ready'; type: string; url?: string; text?: string }
  >({ status: 'loading' })

  useEffect(() => {
    let cancelled = false

    invoke('preview:generate', { repoId, path: file.path })
      .then(async ({ cachePath, type }) => {
        if (cancelled) return

        console.log('[Preview] type:', type, 'cachePath:', cachePath)

        if (type === 'text') {
          try {
            const { data } = await invoke('preview:read-file', { filePath: cachePath })
            const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0))
            const text = new TextDecoder('utf-8').decode(bytes)
            if (!cancelled) setState({ status: 'ready', type, text })
          } catch {
            if (!cancelled) setState({ status: 'ready', type, text: '(텍스트를 불러올 수 없습니다)' })
          }
        } else {
          const url = toPreviewUrl(cachePath)
          console.log('[Preview] url:', url)
          if (!cancelled) setState({ status: 'ready', type, url })
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('[Preview] error:', err)
          setState({ status: 'error', message: err?.message || String(err) || '미리보기 실패' })
        }
      })

    return () => { cancelled = true }
  }, [repoId, file.path])

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[300]"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-[760px] max-h-[88vh] bg-white dark:bg-gray-900 rounded-xl overflow-hidden shadow-2xl flex flex-col">
        {/* 헤더 */}
        <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between shrink-0">
          <span className="font-semibold text-sm truncate">{file.name}</span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none ml-4">✕</button>
        </div>

        {/* 미리보기 영역 */}
        <div className="flex-1 overflow-auto bg-gray-100 dark:bg-gray-800 min-h-0">
          {state.status === 'loading' && (
            <div className="flex items-center justify-center h-64 text-sm text-gray-400">미리보기 생성 중...</div>
          )}

          {state.status === 'error' && (
            <div className="flex flex-col items-center justify-center h-64 gap-2">
              <div className="text-3xl">📄</div>
              <div className="text-sm text-gray-500 text-center px-8">{state.message}</div>
            </div>
          )}

          {state.status === 'ready' && state.type === 'image' && state.url && (
            <div className="flex items-center justify-center p-4 min-h-64">
              <img src={state.url} alt={file.name} className="max-w-full max-h-[72vh] object-contain rounded shadow" />
            </div>
          )}

          {state.status === 'ready' && state.type === 'pdf' && state.url && (
            <iframe src={state.url} className="w-full h-[72vh] border-0" title={file.name} />
          )}

          {state.status === 'ready' && state.type === 'text' && (
            <pre className="p-4 text-xs font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words overflow-auto max-h-[72vh]">
              {state.text ?? '(내용을 불러올 수 없습니다)'}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}
