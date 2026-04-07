import { useState } from 'react'
import { invoke } from '@renderer/services/ipcClient'
import { useQueryClient } from '@tanstack/react-query'

/**
 * JoinModal — 초대 수락 (REQ-031)
 * docvault://join?data={Base64} 링크로부터 정보를 표시하고 수락
 */

interface JoinModalProps {
  linkData: string // Base64 인코딩된 초대 데이터
  onClose: () => void
}

interface InviteInfo {
  host: string
  port: number
  repo: string
  username: string
  password: string
  displayName: string
  token: string
}

export function JoinModal({ linkData, onClose }: JoinModalProps) {
  const queryClient = useQueryClient()
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  let info: InviteInfo | null = null
  try {
    info = JSON.parse(Buffer.from(linkData, 'base64').toString('utf-8'))
  } catch {
    info = null
  }

  const handleAccept = async () => {
    setJoining(true)
    setError(null)
    try {
      await invoke('remote-repo:accept', { linkData })
      setSuccess(true)
      queryClient.invalidateQueries({ queryKey: ['remote-repo:list'] })
    } catch (err) {
      setError(err instanceof Error ? err.message : '연결 실패')
    } finally {
      setJoining(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-[210]"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-[400px] bg-white dark:bg-gray-900 rounded-xl overflow-hidden shadow-2xl">
        <div className="px-5 py-3.5 border-b border-gray-200 dark:border-gray-700 font-bold text-sm">저장소 초대</div>
        <div className="p-5">
          {!info ? (
            <p className="text-[12px] text-red-500">유효하지 않은 초대 링크입니다.</p>
          ) : success ? (
            <div className="text-center py-4">
              <div className="text-2xl mb-2">✅</div>
              <p className="text-[13px] font-semibold">연결 완료!</p>
              <p className="text-[11px] text-gray-500 mt-1">"{info.repo}" 저장소가 사이드바에 추가되었습니다.</p>
            </div>
          ) : (
            <>
              <div className="space-y-2 mb-4">
                {[
                  ['저장소', info.repo],
                  ['호스트', `${info.host}:${info.port}`],
                  ['공유자', info.displayName],
                  ['사용자 ID', info.username]
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between text-[12px]">
                    <span className="text-gray-500">{label}</span>
                    <span className="font-medium">{value}</span>
                  </div>
                ))}
              </div>

              {error && (
                <div className="mb-3 px-3 py-2 rounded-md text-[12px] bg-red-50 text-red-700">{error}</div>
              )}

              <button onClick={handleAccept} disabled={joining}
                className="w-full py-2 text-[12px] font-semibold bg-accent text-white rounded-md hover:bg-accent/90 disabled:opacity-50">
                {joining ? '연결 중…' : '수락하고 연결'}
              </button>
            </>
          )}
        </div>
        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end bg-gray-50 dark:bg-gray-800">
          <button onClick={onClose} className="px-5 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 hover:bg-gray-50">
            {success ? '완료' : '취소'}
          </button>
        </div>
      </div>
    </div>
  )
}
