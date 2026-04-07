import { useState } from 'react'
import { invoke } from '@renderer/services/ipcClient'

/**
 * InvitationModal — 초대 링크 생성 (REQ-030)
 */

interface InvitationModalProps {
  repoId: number
  sharedUserId: number
  onClose: () => void
}

export function InvitationModal({ repoId, sharedUserId, onClose }: InvitationModalProps) {
  const [link, setLink] = useState<string | null>(null)
  const [oneTime, setOneTime] = useState(false)
  const [expiryHours, setExpiryHours] = useState(24)
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCreate = async () => {
    setCreating(true)
    try {
      const result = await invoke('invitation:create', {
        repoId, sharedUserId, expiryMinutes: expiryHours * 60, oneTime
      })
      setLink(result.link)
    } catch (err) {
      alert(err instanceof Error ? err.message : '초대 링크 생성 실패')
    } finally {
      setCreating(false)
    }
  }

  const handleCopy = async () => {
    if (!link) return
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-[210]"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-[420px] bg-white dark:bg-gray-900 rounded-xl overflow-hidden shadow-2xl">
        <div className="px-5 py-3.5 border-b border-gray-200 dark:border-gray-700 font-bold text-sm">초대 링크 생성</div>
        <div className="p-5">
          {!link ? (
            <>
              <div className="space-y-3 mb-4">
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 block mb-1">만료 시간</label>
                  <select value={expiryHours} onChange={e => setExpiryHours(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 text-[12px] border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900">
                    <option value={1}>1시간</option>
                    <option value={6}>6시간</option>
                    <option value={24}>24시간</option>
                    <option value={168}>7일</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 text-[12px]">
                  <input type="checkbox" checked={oneTime} onChange={e => setOneTime(e.target.checked)} className="accent-navy" />
                  일회용 (한 번 사용 후 만료)
                </label>
              </div>
              <button onClick={handleCreate} disabled={creating}
                className="w-full py-2 text-[12px] font-semibold bg-navy text-white rounded-md hover:bg-navy-dark disabled:opacity-50">
                {creating ? '생성 중…' : '초대 링크 생성'}
              </button>
            </>
          ) : (
            <>
              <p className="text-[12px] text-gray-500 mb-2">초대 링크가 생성되었습니다. 상대방에게 전달하세요.</p>
              <div className="p-2.5 bg-gray-50 dark:bg-gray-800 rounded-lg mb-3">
                <div className="text-[11px] font-mono text-blue-700 dark:text-blue-300 break-all select-all">
                  {link}
                </div>
              </div>
              <button onClick={handleCopy}
                className={`w-full py-2 text-[12px] font-semibold rounded-md transition ${
                  copied ? 'bg-green-600 text-white' : 'bg-navy text-white hover:bg-navy-dark'
                }`}>
                {copied ? '복사됨!' : '클립보드에 복사'}
              </button>
            </>
          )}
        </div>
        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end bg-gray-50 dark:bg-gray-800">
          <button onClick={onClose} className="px-5 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 hover:bg-gray-50">닫기</button>
        </div>
      </div>
    </div>
  )
}
