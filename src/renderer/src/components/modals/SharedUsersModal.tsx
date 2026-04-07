import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { invoke } from '@renderer/services/ipcClient'
import type { SharedUser } from '@shared/types/ipc'

/**
 * SharedUsersModal — 공유 사용자 관리 (REQ-028, REQ-029)
 */

interface SharedUsersModalProps {
  repoId: number
  onClose: () => void
  onCreateInvitation?: (userId: number) => void
}

export function SharedUsersModal({ repoId, onClose, onCreateInvitation }: SharedUsersModalProps) {
  const queryClient = useQueryClient()
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [permission, setPermission] = useState<'r' | 'rw'>('rw')
  const [adding, setAdding] = useState(false)

  const { data: users = [] } = useQuery({
    queryKey: ['shared-user:list', repoId],
    queryFn: () => invoke('shared-user:list', { repoId })
  })

  const handleAdd = async () => {
    if (!username.trim() || !displayName.trim() || !password.trim()) return
    setAdding(true)
    try {
      await invoke('shared-user:create', {
        repoId, username: username.trim(), displayName: displayName.trim(),
        password: password.trim(), permission
      })
      setUsername(''); setDisplayName(''); setPassword('')
      queryClient.invalidateQueries({ queryKey: ['shared-user:list', repoId] })
    } catch (err) {
      alert(err instanceof Error ? err.message : '사용자 추가 실패')
    } finally {
      setAdding(false)
    }
  }

  const handleDelete = async (user: SharedUser) => {
    if (!window.confirm(`"${user.displayName}" 사용자를 삭제하시겠습니까?`)) return
    try {
      await invoke('shared-user:delete', { id: user.id })
      queryClient.invalidateQueries({ queryKey: ['shared-user:list', repoId] })
    } catch (err) {
      alert(err instanceof Error ? err.message : '삭제 실패')
    }
  }

  const handleTogglePermission = async (user: SharedUser) => {
    const newPerm = user.permission === 'rw' ? 'r' : 'rw'
    try {
      await invoke('shared-user:update', { id: user.id, permission: newPerm })
      queryClient.invalidateQueries({ queryKey: ['shared-user:list', repoId] })
    } catch (err) {
      alert(err instanceof Error ? err.message : '권한 변경 실패')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-[200]"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-[500px] bg-white dark:bg-gray-900 rounded-xl overflow-hidden shadow-2xl">
        <div className="px-5 py-3.5 border-b border-gray-200 dark:border-gray-700 font-bold text-sm">공유 사용자 관리</div>
        <div className="p-5">
          {/* 추가 폼 */}
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg mb-4">
            <h4 className="text-[11px] font-semibold text-gray-500 mb-2">새 사용자 추가</h4>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <input value={username} onChange={e => setUsername(e.target.value)} placeholder="ID (영문)"
                className="px-2.5 py-1.5 text-[12px] border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900" />
              <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="표시 이름"
                className="px-2.5 py-1.5 text-[12px] border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900" />
              <input value={password} onChange={e => setPassword(e.target.value)} placeholder="비밀번호" type="text"
                className="px-2.5 py-1.5 text-[12px] border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900" />
              <select value={permission} onChange={e => setPermission(e.target.value as 'r' | 'rw')}
                className="px-2.5 py-1.5 text-[12px] border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900">
                <option value="rw">읽기+쓰기</option>
                <option value="r">읽기 전용</option>
              </select>
            </div>
            <button onClick={handleAdd} disabled={adding || !username.trim()}
              className="px-3 py-1.5 text-[11px] font-semibold bg-navy text-white rounded-md hover:bg-navy-dark disabled:opacity-50">
              {adding ? '추가 중…' : '추가'}
            </button>
          </div>

          {/* 사용자 목록 */}
          <div className="max-h-[240px] overflow-y-auto">
            {users.length === 0 ? (
              <p className="text-[12px] text-gray-400 text-center py-6">공유 사용자가 없습니다.</p>
            ) : (
              <div className="space-y-1.5">
                {users.map(u => (
                  <div key={u.id} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-medium">{u.displayName} <span className="text-gray-400">({u.username})</span></div>
                      <div className="text-[10px] text-gray-400">PW: {u.passwordPlain}</div>
                    </div>
                    <button onClick={() => handleTogglePermission(u)}
                      className={`px-2 py-0.5 text-[10px] font-medium rounded border ${
                        u.permission === 'rw' ? 'border-green-300 text-green-600 bg-green-50' : 'border-orange-300 text-orange-600 bg-orange-50'
                      }`}>
                      {u.permission === 'rw' ? 'RW' : 'R'}
                    </button>
                    {onCreateInvitation && (
                      <button onClick={() => onCreateInvitation(u.id)}
                        className="px-2 py-0.5 text-[10px] font-medium rounded border border-blue-300 text-blue-600 bg-blue-50">
                        초대
                      </button>
                    )}
                    <button onClick={() => handleDelete(u)}
                      className="px-2 py-0.5 text-[10px] text-red-400 hover:text-red-600">삭제</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800">
          <span className="text-[11px] text-gray-400">{users.length}명</span>
          <button onClick={onClose} className="px-5 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 hover:bg-gray-50">닫기</button>
        </div>
      </div>
    </div>
  )
}
