import { useState } from 'react'

interface CreateRepoModalProps {
  onClose: () => void
  onCreate: (name: string, description: string, template: string) => Promise<void> | void
}

const TEMPLATES = [
  { id: 'empty', label: '빈 저장소', desc: '폴더 없이 시작' },
  { id: 'business', label: '업무용', desc: '01_진행중 / 02_완료 / 03_참고자료' },
  { id: 'project', label: '프로젝트', desc: 'docs / design / reports' }
]

export function CreateRepoModal({ onClose, onCreate }: CreateRepoModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [template, setTemplate] = useState('empty')
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('저장소 이름을 입력하세요.')
      return
    }
    if (/[<>:"/\\|?*]/.test(trimmed)) {
      setError('이름에 특수문자를 사용할 수 없습니다.')
      return
    }
    if (creating) return
    setCreating(true)
    try {
      await onCreate(trimmed, description.trim(), template)
    } catch {
      setCreating(false)
    }
  }

  // backdrop 클릭으로만 닫기 (드래그 시 오닫힘 방지)
  const handleBackdropMouseDown = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-[200]" onMouseDown={handleBackdropMouseDown}>
      <div className="w-[440px] bg-white dark:bg-gray-900 rounded-xl overflow-hidden shadow-2xl">
        <div className="px-5 py-3.5 border-b border-gray-200 dark:border-gray-700 font-bold text-sm">
          새 저장소 만들기
        </div>
        <div className="p-5 space-y-4">
          {/* 이름 */}
          <div>
            <label className="text-[11px] font-semibold text-gray-400 block mb-1">저장소 이름</label>
            <input
              value={name}
              onChange={e => { setName(e.target.value); setError('') }}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-accent/40 bg-white dark:bg-gray-800"
              placeholder="예: 업무문서, 프로젝트A"
              autoFocus
            />
            {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
          </div>

          {/* 설명 */}
          <div>
            <label className="text-[11px] font-semibold text-gray-400 block mb-1">설명 (선택)</label>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg outline-none focus:ring-2 focus:ring-accent/40 bg-white dark:bg-gray-800"
              placeholder="저장소에 대한 간단한 설명"
            />
          </div>

          {/* 폴더 템플릿 */}
          <div>
            <label className="text-[11px] font-semibold text-gray-400 block mb-2">초기 폴더 구조</label>
            <div className="space-y-1.5">
              {TEMPLATES.map(t => (
                <label
                  key={t.id}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition
                    ${template === t.id
                      ? 'border-accent bg-accent/5'
                      : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                >
                  <input
                    type="radio"
                    name="template"
                    value={t.id}
                    checked={template === t.id}
                    onChange={() => setTemplate(t.id)}
                    className="accent-accent"
                  />
                  <div>
                    <div className="text-xs font-semibold">{t.label}</div>
                    <div className="text-[11px] text-gray-400">{t.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 bg-gray-50 dark:bg-gray-800">
          <button onClick={onClose} className="px-5 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 hover:bg-gray-50">
            취소
          </button>
          <button onClick={handleCreate} disabled={creating} className="px-5 py-1.5 text-xs font-semibold bg-navy text-white rounded-md hover:bg-navy-dark disabled:opacity-50 disabled:cursor-wait flex items-center gap-1.5">
            {creating && (
              <svg className="w-3 h-3 animate-spin" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity="0.3" />
                <path d="M8 2a6 6 0 0 1 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            )}
            {creating ? '생성 중...' : '생성'}
          </button>
        </div>
      </div>
    </div>
  )
}
