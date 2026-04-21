import { useState, useEffect } from 'react'
import { invoke } from '@renderer/services/ipcClient'
import type { FileEntry } from '@shared/types/ipc'

interface PreviewModalProps {
  file: FileEntry
  repoId: number
  onClose: () => void
}

const EXT_MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', bmp: 'image/bmp',
}

export function PreviewModal({ file, repoId, onClose }: PreviewModalProps) {
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'ready'; type: string; base64?: string; text?: string; mime?: string }
  >({ status: 'loading' })

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const { cachePath, type } = await invoke('preview:generate', { repoId, path: file.path })
        if (cancelled) return

        const { data } = await invoke('preview:read-file', { filePath: cachePath })
        if (cancelled) return

        if (type === 'text') {
          const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0))
          const text = new TextDecoder('utf-8').decode(bytes)
          setState({ status: 'ready', type, text })
        } else if (type === 'image') {
          const ext = file.name.split('.').pop()?.toLowerCase() || ''
          const mime = EXT_MIME[ext] || 'image/png'
          setState({ status: 'ready', type, base64: data, mime })
        } else {
          // pdf
          setState({ status: 'ready', type, base64: data, mime: 'application/pdf' })
        }
      } catch (err: any) {
        if (!cancelled) {
          setState({ status: 'error', message: err?.message || '미리보기 실패' })
        }
      }
    }

    load()
    return () => { cancelled = true }
  }, [repoId, file.path, file.name])

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

          {state.status === 'ready' && state.type === 'image' && state.base64 && (
            <div className="flex items-center justify-center p-4 min-h-64">
              <img
                src={`data:${state.mime};base64,${state.base64}`}
                alt={file.name}
                className="max-w-full max-h-[72vh] object-contain rounded shadow"
              />
            </div>
          )}

          {state.status === 'ready' && state.type === 'pdf' && state.base64 && (
            <iframe
              src={`data:application/pdf;base64,${state.base64}`}
              className="w-full h-[72vh] border-0"
              title={file.name}
            />
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
