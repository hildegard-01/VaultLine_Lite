import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { invoke } from '@renderer/services/ipcClient'
import type { AppSettings, BackupEntry } from '@shared/types/ipc'

/**
 * SettingsModal — 설정 + 백업 관리 (REQ-036, REQ-037)
 *
 * 역할: 앱 전역 설정 편집 + 백업 생성/복원/삭제
 * 구성: 탭 2개 (일반 설정 / 백업)
 */

interface SettingsModalProps {
  onClose: () => void
  initialTab?: Tab
}

type Tab = 'general' | 'backup' | 'server' | 'system'

export function SettingsModal({ onClose, initialTab = 'general' }: SettingsModalProps) {
  const [tab, setTab] = useState<Tab>(initialTab)

  return (
    <div
      className="fixed inset-0 bg-black/45 flex items-center justify-center z-[200]"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-[520px] bg-white dark:bg-gray-900 rounded-xl overflow-hidden shadow-2xl">
        <div className="px-5 py-3.5 border-b border-gray-200 dark:border-gray-700 flex items-center gap-4">
          <span className="font-bold text-sm">설정</span>
          <div className="flex gap-1 ml-auto">
            {([['general', '일반'], ['backup', '백업'], ['server', '서버 연결'], ['system', '시스템']] as const).map(([key, label]) => (
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
          {tab === 'system' && <SystemTab />}
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

// ─── 시스템 탭 ───

function SystemTab() {
  const queryClient = useQueryClient()

  const { data: settings } = useQuery({
    queryKey: ['settings:get'],
    queryFn: () => invoke('settings:get') as Promise<any>
  })

  const { data: startupInfo } = useQuery({
    queryKey: ['system:startup-get'],
    queryFn: () => invoke('system:startup-get') as Promise<{ openAtLogin: boolean; openAsHidden: boolean }>
  })

  const { data: sessionInfo, refetch: refetchSession } = useQuery({
    queryKey: ['session:info'],
    queryFn: () => invoke('session:info') as Promise<{ expiresAt: string | null }>
  })

  const autoLoginDays: number = settings?.autoLoginDays ?? 0
  const trayMinimize: boolean = settings?.trayMinimize ?? false
  const openAtLogin: boolean = startupInfo?.openAtLogin ?? false

  const handleAutoLoginToggle = async (enabled: boolean) => {
    await invoke('settings:update', { autoLoginDays: enabled ? 7 : 0 })
    if (!enabled) await invoke('session:clear')
    queryClient.invalidateQueries({ queryKey: ['settings:get'] })
    refetchSession()
  }

  const handleDaysChange = async (days: number) => {
    await invoke('settings:update', { autoLoginDays: days })
    queryClient.invalidateQueries({ queryKey: ['settings:get'] })
  }

  const handleSessionClear = async () => {
    await invoke('session:clear')
    refetchSession()
  }

  const handleStartupToggle = async (enabled: boolean) => {
    await invoke('system:startup-set', { openAtLogin: enabled, openAsHidden: true })
    queryClient.invalidateQueries({ queryKey: ['system:startup-get'] })
  }

  const handleTrayToggle = async (enabled: boolean) => {
    await invoke('settings:update', { trayMinimize: enabled })
    queryClient.invalidateQueries({ queryKey: ['settings:get'] })
  }

  return (
    <div className="space-y-5">
      {/* 자동 로그인 */}
      <div>
        <h3 className="text-[11px] font-semibold text-gray-500 mb-3">자동 로그인</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[12px]">자동 로그인 활성화</span>
              <p className="text-[10px] text-gray-400 mt-0.5">서버 로그인 상태를 OS 암호화로 저장합니다</p>
            </div>
            <input
              type="checkbox"
              checked={autoLoginDays > 0}
              onChange={e => handleAutoLoginToggle(e.target.checked)}
              className="accent-navy"
            />
          </div>

          {autoLoginDays > 0 && (
            <>
              <div>
                <label className="text-[11px] font-semibold text-gray-500 block mb-1">로그인 유지 기간</label>
                <select
                  value={autoLoginDays}
                  onChange={e => handleDaysChange(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 text-[12px] border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900"
                >
                  <option value={1}>1일</option>
                  <option value={7}>7일</option>
                  <option value={30}>30일</option>
                  <option value={90}>90일</option>
                </select>
              </div>

              {sessionInfo?.expiresAt ? (
                <p className="text-[10px] text-gray-400">
                  세션 만료일: {new Date(sessionInfo.expiresAt).toLocaleDateString('ko-KR')}
                </p>
              ) : (
                <p className="text-[10px] text-gray-400">저장된 세션 없음 (다음 로그인 시 저장됩니다)</p>
              )}

              {sessionInfo?.expiresAt && (
                <button
                  onClick={handleSessionClear}
                  className="px-3 py-1 text-[10px] font-semibold border border-orange-200 text-orange-600 rounded-md hover:bg-orange-50"
                >
                  저장된 세션 삭제
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* 시스템 통합 */}
      <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
        <h3 className="text-[11px] font-semibold text-gray-500 mb-3">시스템 통합</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[12px]">시작 시 자동 실행</span>
              <p className="text-[10px] text-gray-400 mt-0.5">Windows 로그인 시 VaultLine Lite 자동 시작</p>
            </div>
            <input
              type="checkbox"
              checked={openAtLogin}
              onChange={e => handleStartupToggle(e.target.checked)}
              className="accent-navy"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <span className="text-[12px]">트레이 최소화</span>
              <p className="text-[10px] text-gray-400 mt-0.5">창 닫기 시 트레이에서 계속 실행 (재시작 후 적용)</p>
            </div>
            <input
              type="checkbox"
              checked={trayMinimize}
              onChange={e => handleTrayToggle(e.target.checked)}
              className="accent-navy"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── 서버 연결 탭 ───

function ServerTab() {
  const [serverUrl, setServerUrl] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [status, setStatus] = useState<{ connected: boolean; mode: string; user: any } | null>(null)
  const [error, setError] = useState('')

  // 초기 상태 조회
  useEffect(() => {
    invoke('server:status').then((s: any) => {
      setStatus(s)
      if (s.serverUrl) setServerUrl(s.serverUrl)
    }).catch(() => {})
  }, [])

  const handleConnect = async () => {
    if (!serverUrl.trim() || !username.trim() || !password.trim()) {
      setError('서버 URL, 사용자명, 비밀번호를 입력하세요.')
      return
    }
    setConnecting(true)
    setError('')
    try {
      const result = await invoke('server:connect', { url: serverUrl.trim(), username: username.trim(), password }) as any
      setStatus(result)
      if (!result.connected) {
        setError('서버 연결 또는 로그인에 실패했습니다.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '연결 실패')
    } finally {
      setConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    try {
      await invoke('server:disconnect')
      setStatus({ connected: false, mode: 'offline', user: null })
    } catch {}
  }

  const isConnected = status?.connected

  return (
    <div className="space-y-4">
      {/* 연결 상태 표시 */}
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-medium ${
        isConnected ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-gray-50 text-gray-500 border border-gray-200'
      }`}>
        <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-400'}`} />
        {isConnected ? `연결됨 — ${status.user?.username} (${status.user?.role})` : '오프라인'}
      </div>

      {!isConnected ? (
        <>
          <div>
            <label className="text-[11px] font-semibold text-gray-500 block mb-1">서버 URL</label>
            <input type="text" value={serverUrl} onChange={e => setServerUrl(e.target.value)}
              placeholder="http://localhost:8080"
              className="w-full px-2.5 py-1.5 text-[12px] border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800" />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-gray-500 block mb-1">사용자명</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)}
              placeholder="admin"
              className="w-full px-2.5 py-1.5 text-[12px] border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800" />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-gray-500 block mb-1">비밀번호</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="비밀번호"
              onKeyDown={e => { if (e.key === 'Enter') handleConnect() }}
              className="w-full px-2.5 py-1.5 text-[12px] border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800" />
          </div>
          {error && <p className="text-[11px] text-red-500">{error}</p>}
          <button onClick={handleConnect} disabled={connecting}
            className="px-4 py-1.5 text-[11px] font-semibold bg-navy text-white rounded-md hover:bg-navy-dark disabled:opacity-50">
            {connecting ? '연결 중...' : '연결'}
          </button>
        </>
      ) : (
        <>
          <p className="text-[11px] text-gray-500">서버: {status?.mode === 'connected' ? serverUrl : '-'}</p>
          <button onClick={handleDisconnect}
            className="px-4 py-1.5 text-[11px] font-semibold border border-red-200 text-red-500 rounded-md hover:bg-red-50">
            연결 해제
          </button>

          {/* 내 정보 / 비밀번호 변경 */}
          <div className="border-t border-gray-100 pt-4 space-y-4">
            <MyProfileSection />
            <ChangePasswordSection />
          </div>
        </>
      )}
    </div>
  )
}

// ─── 내 정보 수정 ───

function MyProfileSection() {
  const queryClient = useQueryClient()
  const { data: profile, isLoading } = useQuery({
    queryKey: ['user:my-profile'],
    queryFn: () => invoke('user:my-profile'),
  })

  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (profile) {
      setDisplayName((profile as any).displayName ?? '')
      setEmail((profile as any).email ?? '')
    }
  }, [profile])

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      await invoke('user:update-profile', {
        displayName: displayName.trim() || undefined,
        email: email.trim() || undefined,
      })
      queryClient.invalidateQueries({ queryKey: ['user:my-profile'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      alert(err instanceof Error ? err.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) return null

  return (
    <div>
      <h3 className="text-[11px] font-semibold text-gray-500 mb-2">내 정보</h3>
      <div className="space-y-2">
        <div>
          <label className="text-[10px] text-gray-400 block mb-1">사용자명 (변경 불가)</label>
          <input
            type="text"
            value={(profile as any)?.username ?? ''}
            disabled
            className="w-full px-2.5 py-1.5 text-[12px] border border-gray-100 rounded-md bg-gray-50 text-gray-400"
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-400 block mb-1">표시 이름</label>
          <input
            type="text"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="홍길동"
            className="w-full px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md bg-white"
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-400 block mb-1">이메일</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="user@example.com"
            className="w-full px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md bg-white"
          />
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className={`px-4 py-1.5 text-[11px] font-semibold rounded-md transition disabled:opacity-50 ${
            saved ? 'bg-green-500 text-white' : 'bg-navy text-white hover:bg-navy-dark'
          }`}
        >
          {saving ? '저장 중...' : saved ? '저장됨 ✓' : '저장'}
        </button>
      </div>
    </div>
  )
}

// ─── 비밀번호 변경 ───

function ChangePasswordSection() {
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleChange = async () => {
    setError('')
    setSuccess(false)
    if (!currentPw || !newPw || !confirmPw) {
      setError('모든 항목을 입력하세요.')
      return
    }
    if (newPw.length < 8) {
      setError('새 비밀번호는 8자 이상이어야 합니다.')
      return
    }
    if (newPw !== confirmPw) {
      setError('새 비밀번호가 일치하지 않습니다.')
      return
    }
    setSaving(true)
    try {
      await invoke('user:change-password', { currentPassword: currentPw, newPassword: newPw })
      setCurrentPw('')
      setNewPw('')
      setConfirmPw('')
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : '비밀번호 변경 실패')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <h3 className="text-[11px] font-semibold text-gray-500 mb-2">비밀번호 변경</h3>
      <div className="space-y-2">
        <input
          type="password"
          value={currentPw}
          onChange={e => setCurrentPw(e.target.value)}
          placeholder="현재 비밀번호"
          className="w-full px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md bg-white"
        />
        <input
          type="password"
          value={newPw}
          onChange={e => setNewPw(e.target.value)}
          placeholder="새 비밀번호 (8자 이상)"
          className="w-full px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md bg-white"
        />
        <input
          type="password"
          value={confirmPw}
          onChange={e => setConfirmPw(e.target.value)}
          placeholder="새 비밀번호 확인"
          onKeyDown={e => { if (e.key === 'Enter') handleChange() }}
          className="w-full px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md bg-white"
        />
        {error && <p className="text-[11px] text-red-500">{error}</p>}
        {success && <p className="text-[11px] text-green-600">비밀번호가 변경되었습니다.</p>}
        <button
          onClick={handleChange}
          disabled={saving}
          className="px-4 py-1.5 text-[11px] font-semibold bg-navy text-white rounded-md hover:bg-navy-dark disabled:opacity-50"
        >
          {saving ? '변경 중...' : '변경'}
        </button>
      </div>
    </div>
  )
}
