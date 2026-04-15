import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { invoke } from '@renderer/services/ipcClient'
import { useMode } from '@renderer/hooks/useMode'
import type { AppSettings, BackupEntry } from '@shared/types/ipc'

/**
 * SettingsModal — 설정 + 백업 관리 (REQ-036, REQ-037)
 *
 * 역할: 앱 전역 설정 편집 + 백업 생성/복원/삭제
 * 구성: 탭 2개 (일반 설정 / 백업)
 */

interface SettingsModalProps {
  onClose: () => void
}

type Tab = 'general' | 'backup' | 'server'

export function SettingsModal({ onClose }: SettingsModalProps) {
  const [tab, setTab] = useState<Tab>('general')

  return (
    <div
      className="fixed inset-0 bg-black/45 flex items-center justify-center z-[200]"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-[520px] bg-white dark:bg-gray-900 rounded-xl overflow-hidden shadow-2xl">
        <div className="px-5 py-3.5 border-b border-gray-200 dark:border-gray-700 flex items-center gap-4">
          <span className="font-bold text-sm">설정</span>
          <div className="flex gap-1 ml-auto">
            {([['general', '일반'], ['backup', '백업'], ['server', '서버 연결']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`px-3 py-1 text-[11px] rounded-md transition ${
                  tab === key
                    ? 'bg-navy text-white font-semibold'
                    : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-5 min-h-[340px]">
          {tab === 'general' && <GeneralTab />}
          {tab === 'backup' && <BackupTab />}
          {tab === 'server' && <ServerTab />}
        </div>

        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end bg-gray-50 dark:bg-gray-800">
          <button
            onClick={onClose}
            className="px-5 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 hover:bg-gray-50"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── 일반 설정 탭 ───

function GeneralTab() {
  const queryClient = useQueryClient()
  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings:get'],
    queryFn: () => invoke('settings:get')
  })

  const { data: appInfo } = useQuery({
    queryKey: ['settings:app-info'],
    queryFn: () => invoke('settings:app-info')
  })

  const [local, setLocal] = useState<Partial<AppSettings>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (settings) setLocal(settings)
  }, [settings])

  const handleSave = async () => {
    setSaving(true)
    try {
      await invoke('settings:update', local)
      queryClient.invalidateQueries({ queryKey: ['settings:get'] })
    } catch (err) {
      alert(err instanceof Error ? err.message : '설정 저장 실패')
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) return <p className="text-xs text-gray-400 text-center py-8">로딩 중…</p>

  return (
    <div className="space-y-4">
      {/* 테마 */}
      <div>
        <label className="text-[11px] font-semibold text-gray-500 block mb-1">테마</label>
        <select
          value={local.theme || 'system'}
          onChange={e => setLocal(p => ({ ...p, theme: e.target.value as AppSettings['theme'] }))}
          className="w-full px-2.5 py-1.5 text-[12px] border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900"
        >
          <option value="system">시스템 기본</option>
          <option value="light">라이트</option>
          <option value="dark">다크</option>
        </select>
      </div>

      {/* 언어 */}
      <div>
        <label className="text-[11px] font-semibold text-gray-500 block mb-1">언어</label>
        <select
          value={local.language || 'ko'}
          onChange={e => setLocal(p => ({ ...p, language: e.target.value as AppSettings['language'] }))}
          className="w-full px-2.5 py-1.5 text-[12px] border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900"
        >
          <option value="ko">한국어</option>
          <option value="en">English</option>
        </select>
      </div>

      {/* 자동 커밋 */}
      <div className="flex items-center justify-between">
        <div>
          <label className="text-[11px] font-semibold text-gray-500 block">자동 커밋</label>
          <span className="text-[10px] text-gray-400">더블클릭 편집 후 자동으로 커밋</span>
        </div>
        <input
          type="checkbox"
          checked={!!local.autoCommit}
          onChange={e => setLocal(p => ({ ...p, autoCommit: e.target.checked }))}
          className="accent-navy"
        />
      </div>

      {/* 자동 커밋 지연 */}
      {local.autoCommit && (
        <div>
          <label className="text-[11px] font-semibold text-gray-500 block mb-1">자동 커밋 지연 (초)</label>
          <input
            type="number"
            min={1}
            max={300}
            value={local.autoCommitDelay || 5}
            onChange={e => setLocal(p => ({ ...p, autoCommitDelay: Number(e.target.value) }))}
            className="w-24 px-2.5 py-1.5 text-[12px] border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900"
          />
        </div>
      )}

      {/* 공유 서버 설정 */}
      <div>
        <label className="text-[11px] font-semibold text-gray-500 block mb-2">공유 서버</label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-gray-400 block mb-1">기본 포트</label>
            <input
              type="number"
              min={1024}
              max={65535}
              value={local.shareServerPort || 9090}
              onChange={e => setLocal(p => ({ ...p, shareServerPort: Number(e.target.value) }))}
              className="w-full px-2.5 py-1.5 text-[12px] border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900"
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-400 block mb-1">기본 만료 시간 (분)</label>
            <input
              type="number"
              min={1}
              max={10080}
              value={local.shareExpiryMinutes || 60}
              onChange={e => setLocal(p => ({ ...p, shareExpiryMinutes: Number(e.target.value) }))}
              className="w-full px-2.5 py-1.5 text-[12px] border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900"
            />
          </div>
        </div>
        <p className="text-[10px] text-gray-400 mt-1">임시 링크 공유 시 사용 (포트 기본: 9090, 만료 기본: 60분)</p>
      </div>

      {/* 저장 */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="px-4 py-1.5 text-[11px] font-semibold bg-navy text-white rounded-md hover:bg-navy-dark transition disabled:opacity-50"
      >
        {saving ? '저장 중…' : '저장'}
      </button>

      {/* 앱 정보 */}
      {appInfo && (
        <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
          <p className="text-[10px] text-gray-400">
            VaultLine Lite v{appInfo.version} · Electron {appInfo.electron} · Node {appInfo.node}
          </p>
        </div>
      )}
    </div>
  )
}

// ─── 백업 탭 ───

function BackupTab() {
  const queryClient = useQueryClient()
  const { data: backups = [], isLoading } = useQuery({
    queryKey: ['backup:list'],
    queryFn: () => invoke('backup:list')
  })

  const [creating, setCreating] = useState(false)
  const [restoring, setRestoring] = useState<string | null>(null)

  const handleCreate = async () => {
    setCreating(true)
    try {
      await invoke('backup:create')
      queryClient.invalidateQueries({ queryKey: ['backup:list'] })
    } catch (err) {
      alert(err instanceof Error ? err.message : '백업 생성 실패')
    } finally {
      setCreating(false)
    }
  }

  const handleRestore = async (backup: BackupEntry) => {
    if (!window.confirm(`"${backup.fileName}" 백업으로 복원하시겠습니까?\n현재 데이터가 덮어써집니다.`)) return
    setRestoring(backup.id)
    try {
      await invoke('backup:restore', { id: backup.id })
      alert('복원이 완료되었습니다. 앱을 재시작하세요.')
    } catch (err) {
      alert(err instanceof Error ? err.message : '복원 실패')
    } finally {
      setRestoring(null)
    }
  }

  const handleDelete = async (backup: BackupEntry) => {
    if (!window.confirm(`"${backup.fileName}" 백업을 삭제하시겠습니까?`)) return
    try {
      await invoke('backup:delete', { id: backup.id })
      queryClient.invalidateQueries({ queryKey: ['backup:list'] })
    } catch (err) {
      alert(err instanceof Error ? err.message : '삭제 실패')
    }
  }

  function formatSize(bytes: number): string {
    if (bytes === 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i]
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[12px] font-semibold">백업 관리</h3>
          <p className="text-[10px] text-gray-400 mt-0.5">SVN 저장소 + DB를 ZIP으로 백업합니다 (최대 7개)</p>
        </div>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="px-3.5 py-1.5 text-[11px] font-semibold bg-navy text-white rounded-md hover:bg-navy-dark transition disabled:opacity-50"
        >
          {creating ? '생성 중…' : '새 백업'}
        </button>
      </div>

      {isLoading ? (
        <p className="text-xs text-gray-400 text-center py-8">로딩 중…</p>
      ) : backups.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-8">백업이 없습니다.</p>
      ) : (
        <div className="space-y-2 max-h-[260px] overflow-y-auto">
          {backups.map(b => (
            <div key={b.id} className="flex items-center gap-3 p-2.5 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-medium truncate">{b.fileName}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">
                  {new Date(b.createdAt).toLocaleString('ko-KR')} · {formatSize(b.sizeBytes)}
                </div>
              </div>
              <button
                onClick={() => handleRestore(b)}
                disabled={restoring === b.id}
                className="px-2.5 py-1 text-[10px] font-semibold border border-blue-200 text-blue-600 rounded-md hover:bg-blue-50 disabled:opacity-50"
              >
                {restoring === b.id ? '복원 중…' : '복원'}
              </button>
              <button
                onClick={() => handleDelete(b)}
                className="px-2.5 py-1 text-[10px] font-semibold border border-red-200 text-red-500 rounded-md hover:bg-red-50"
              >
                삭제
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── 서버 연결 탭 ───

function ServerTab() {
  const { connected, user, serverUrl, refresh } = useMode()
  const [url, setUrl] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleConnect = async (): Promise<void> => {
    if (!url.trim() || !username.trim() || !password.trim()) {
      setError('서버 URL, 아이디, 비밀번호를 모두 입력하세요.')
      return
    }
    setError(null)
    setLoading(true)
    try {
      await invoke('server:connect' as any, { serverUrl: url.trim(), username: username.trim(), password })
      refresh()
      setPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '서버 연결에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleDisconnect = async (): Promise<void> => {
    if (!window.confirm('서버 연결을 해제하시겠습니까?')) return
    setLoading(true)
    try {
      await invoke('server:disconnect' as any)
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '연결 해제 실패')
    } finally {
      setLoading(false)
    }
  }

  // 커넥티드 상태일 때
  if (connected && user) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-4 py-3">
          <p className="text-[11px] text-green-700 dark:text-green-400 font-semibold">서버 연결됨</p>
          <p className="text-[11px] text-green-600 dark:text-green-500 mt-0.5">{serverUrl}</p>
          <p className="text-[11px] text-green-600 dark:text-green-500">로그인: {user.username} ({user.role === 'admin' ? '관리자' : '사용자'})</p>
        </div>

        <div className="space-y-1.5 text-[11px] text-gray-500">
          <p>• 커밋 메타데이터 자동 동기화</p>
          <p>• 태그/잠금 상태 서버 반영</p>
          <p>• 팀 알림 수신</p>
          <p>• 서버 공유 링크 생성 가능</p>
        </div>

        <button
          onClick={handleDisconnect}
          disabled={loading}
          className="px-4 py-1.5 text-[11px] font-semibold border border-red-200 text-red-500 rounded-md hover:bg-red-50 disabled:opacity-50 transition"
        >
          {loading ? '처리 중...' : '연결 해제'}
        </button>
      </div>
    )
  }

  // 오프라인 상태 — 로그인 폼
  return (
    <div className="space-y-4">
      <div>
        <label className="text-[11px] font-semibold text-gray-500 block mb-1">서버 URL</label>
        <input
          type="text"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="http://192.168.0.10:8080"
          className="w-full px-2.5 py-1.5 text-[12px] border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
        />
      </div>
      <div>
        <label className="text-[11px] font-semibold text-gray-500 block mb-1">아이디</label>
        <input
          type="text"
          value={username}
          onChange={e => setUsername(e.target.value)}
          placeholder="사용자 아이디"
          className="w-full px-2.5 py-1.5 text-[12px] border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
        />
      </div>
      <div>
        <label className="text-[11px] font-semibold text-gray-500 block mb-1">비밀번호</label>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleConnect() }}
          placeholder="비밀번호"
          className="w-full px-2.5 py-1.5 text-[12px] border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
        />
      </div>

      {error && (
        <p className="text-[11px] text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-md">{error}</p>
      )}

      <button
        onClick={handleConnect}
        disabled={loading}
        className="px-5 py-1.5 text-[11px] font-semibold bg-navy text-white rounded-md hover:bg-navy/90 disabled:opacity-50 transition"
      >
        {loading ? '연결 중...' : '연결'}
      </button>

      <p className="text-[10px] text-gray-400">
        서버 연결 시 커밋 이력 동기화, 팀 공유, 알림 기능을 사용할 수 있습니다.
        오프라인 상태에서도 모든 로컬 기능은 정상 동작합니다.
      </p>
    </div>
  )
}
