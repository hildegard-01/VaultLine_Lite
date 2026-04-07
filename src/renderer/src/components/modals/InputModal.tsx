import { useState, useEffect, useRef } from 'react'

interface InputModalProps {
  title: string
  placeholder?: string
  defaultValue?: string
  onConfirm: (value: string) => Promise<void> | void
  onClose: () => void
}

export function InputModal({ title, placeholder = '', defaultValue = '', onConfirm, onClose }: InputModalProps) {
  const [value, setValue] = useState(defaultValue)
  const [processing, setProcessing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const handleSubmit = async () => {
    if (!value.trim() || processing) return
    setProcessing(true)
    try {
      await onConfirm(value.trim())
    } finally {
      setProcessing(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit()
    if (e.key === 'Escape' && !processing) onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-[200]" onMouseDown={e => { if (e.target === e.currentTarget && !processing) onClose() }}>
      <div className="w-[360px] bg-white dark:bg-gray-900 rounded-xl overflow-hidden shadow-2xl">
        <div className="px-5 py-3.5 border-b border-gray-200 dark:border-gray-700 font-bold text-sm">{title}</div>
        <div className="p-5">
          <input
            ref={inputRef}
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={processing}
            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-accent/40 bg-white dark:bg-gray-800 disabled:opacity-50"
            placeholder={placeholder}
          />
        </div>
        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 bg-gray-50 dark:bg-gray-800">
          <button onClick={onClose} disabled={processing} className="px-4 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 hover:bg-gray-50 disabled:opacity-40">취소</button>
          <button onClick={handleSubmit} disabled={!value.trim() || processing} className="px-4 py-1.5 text-xs font-semibold bg-navy text-white rounded-md hover:bg-navy-dark disabled:opacity-40 disabled:cursor-wait flex items-center gap-1.5">
            {processing && (
              <svg className="w-3 h-3 animate-spin" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity="0.3" />
                <path d="M8 2a6 6 0 0 1 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            )}
            {processing ? '처리 중...' : '확인'}
          </button>
        </div>
      </div>
    </div>
  )
}
