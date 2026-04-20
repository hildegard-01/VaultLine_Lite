import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

/**
 * AdminModal — 관리자 전용 모달
 *
 * 역할: VaultLine 서버 버전 관리자 UI를 IPC 기반으로 포팅
 * 탭: 대시보드 / 사용자 관리 / 시스템
 */

// ─── 공통 타입 ───

interface DashboardData {
  users: { total: number; online: number }
  repos: { total: number }
  commits: { total: number }
  approvals: { pending: number }
  shares: { active: number }
  activity: { last24h: number }
  cache: { count: number; sizeBytes: number }
}

interface SystemStatus {
  uptimeSeconds: number
  uptimeDisplay: string
  dbSizeBytes: number
  cacheSizeBytes: number
  activeSessions: number
  config: Record<string, unknown>
}

interface UserItem {
  id: number
  username: string
  displayName: string | null
  role: string
  status: string
  isOnline: boolean
  createdAt: string
  lastSeen: string | null
}

interface OnlineUser {
  id: number
  username: string
  displayName: string | null
  lastHeartbeat: string | null
}

// ─── IPC 헬퍼 ───

async function adminInvoke(channel: string, args?: unknown): Promise<unknown> {
  const res = await (window.api.invoke as Function)(channel, args) as { success: boolean; data?: unknown; error?: string }
  if (!res.success) throw new Error(res.error || '오류가 발생했습니다.')
  return res.data
}

// ─── 유틸 ───

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function formatRelative(iso: string | null): string {
  if (!iso) return '-'
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return '방금 전'
  if (m < 60) return `${m}분 전`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}시간 전`
  return `${Math.floor(h / 24)}일 전`
}

function formatUptime(sec: number): string {
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (d > 0) return `${d}일 ${h}시간 ${m}분`
  if (h > 0) return `${h}시간 ${m}분`
  return `${m}분`
}

// ─── 메인 모달 ───

type Tab = 'dashboard' | 'users' | 'system'

interface AdminModalProps {
  onClose: () => void
}

export function AdminModal({ onClose }: AdminModalProps) {
  const [tab, setTab] = useState<Tab>('dashboard')

  const tabs: { key: Tab; label: string }[] = [
    { key: 'dashboard', label: '대시보드' },
    { key: 'users', label: '사용자 관리' },
    { key: 'system', label: '시스템' },
  ]

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[300]"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-[900px] max-w-[95vw] h-[680px] max-h-[92vh] bg-white dark:bg-gray-900 rounded-xl overflow-hidden shadow-2xl flex flex-col">
        {/* 헤더 */}
        <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center gap-4 shrink-0">
          <span className="font-bold text-sm text-yellow-600">관리자 콘솔</span>
          <div className="flex gap-1">
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-1 text-[11px] rounded-md transition ${
                  tab === t.key
                    ? 'bg-navy text-white font-semibold'
                    : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            onClick={onClose}
            className="ml-auto text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* 탭 콘텐츠 */}
        <div className="flex-1 overflow-hidden">
          {tab === 'dashboard' && <DashboardTab />}
          {tab === 'users' && <UsersTab />}
          {tab === 'system' && <SystemTab />}
        </div>
      </div>
    </div>
  )
}

// ─── 대시보드 탭 ───

function DashboardTab() {
  const { data: dash } = useQuery<DashboardData>({
    queryKey: ['admin:dashboard'],
    queryFn: () => adminInvoke('server:admin:dashboard') as Promise<DashboardData>,
    refetchInterval: 30_000
  })

  const { data: online = [] } = useQuery<OnlineUser[]>({
    queryKey: ['admin:online-users'],
    queryFn: () => adminInvoke('server:admin:online-users') as Promise<OnlineUser[]>,
    refetchInterval: 15_000
  })

  return (
    <div className="h-full overflow-auto p-5 space-y-5">
      {/* 메트릭 카드 */}
      <div className="grid grid-cols-4 gap-3">
        <MetricCard label="전체 사용자" value={String(dash?.users.total ?? '-')} sub={`온라인 ${dash?.users.online ?? 0}명`} color="bg-blue-50 text-blue-700" />
        <MetricCard label="저장소" value={String(dash?.repos.total ?? '-')} sub="서버 등록 저장소" color="bg-green-50 text-green-700" />
        <MetricCard label="승인 대기" value={String(dash?.approvals.pending ?? '-')} sub="미처리 요청" color={(dash?.approvals.pending ?? 0) > 0 ? 'bg-amber-50 text-amber-700' : 'bg-gray-50 text-gray-600'} />
        <MetricCard label="24시간 활동" value={String(dash?.activity.last24h ?? '-')} sub="최근 24시간 이벤트" color="bg-purple-50 text-purple-700" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* 추가 지표 */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
          <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400">서버 지표</h3>
          <InfoRow label="전체 커밋" value={`${dash?.commits.total ?? '-'}건`} />
          <InfoRow label="활성 공유" value={`${dash?.shares.active ?? '-'}개`} />
          <InfoRow label="미리보기 캐시" value={dash ? `${dash.cache.count}개 / ${formatBytes(dash.cache.sizeBytes)}` : '-'} />
        </div>

        {/* 온라인 사용자 */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-3">현재 온라인 ({online.length}명)</h3>
          {online.length === 0 ? (
            <p className="text-xs text-gray-400">온라인 사용자가 없습니다.</p>
          ) : (
            <div className="space-y-1.5 max-h-[200px] overflow-auto">
              {online.map(u => (
                <div key={u.id} className="flex items-center gap-2 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                  <span className="font-medium">{u.username}</span>
                  {u.displayName && <span className="text-gray-400">({u.displayName})</span>}
                  <span className="ml-auto text-gray-400">{formatRelative(u.lastHeartbeat)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── 사용자 관리 탭 ───

type Panel = 'detail' | 'edit' | 'create' | null

function UsersTab() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [selected, setSelected] = useState<UserItem | null>(null)
  const [panel, setPanel] = useState<Panel>(null)
  const [editForm, setEditForm] = useState({ displayName: '', role: 'user', status: 'active' })
  const [createForm, setCreateForm] = useState({ username: '', displayName: '', password: '', role: 'user' })
  const [createError, setCreateError] = useState('')

  const { data: users = [], isLoading } = useQuery<UserItem[]>({
    queryKey: ['admin:users'],
    queryFn: () => adminInvoke('server:admin:users:list', { skip: 0, limit: 200 }) as Promise<UserItem[]>
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin:users'] })

  const createMut = useMutation({
    mutationFn: (p: { username: string; password: string; displayName: string; role: string }) =>
      adminInvoke('server:admin:users:create', p),
    onSuccess: () => { invalidate(); setPanel(null); setCreateForm({ username: '', displayName: '', password: '', role: 'user' }); setCreateError('') },
    onError: (e: unknown) => setCreateError(e instanceof Error ? e.message : '생성 실패')
  })

  const updateMut = useMutation({
    mutationFn: (p: { userId: number; params: { displayName?: string; role?: string; status?: string } }) =>
      adminInvoke('server:admin:users:update', p),
    onSuccess: (data) => { invalidate(); setSelected(data as UserItem); setPanel('detail') },
    onError: (e: unknown) => alert(e instanceof Error ? e.message : '수정 실패')
  })

  const deleteMut = useMutation({
    mutationFn: (userId: number) => adminInvoke('server:admin:users:delete', { userId }),
    onSuccess: () => { invalidate(); setSelected(null); setPanel(null) }
  })

  const forceLogoutMut = useMutation({
    mutationFn: (userId: number) => adminInvoke('server:admin:force-logout', { userId }),
    onSuccess: () => { invalidate(); alert('강제 로그아웃 완료') }
  })

  const filtered = users.filter(u => {
    const matchSearch = !search || u.username.includes(search) || (u.displayName ?? '').includes(search)
    const matchRole = !roleFilter || u.role === roleFilter
    return matchSearch && matchRole
  })

  const openDetail = (u: UserItem) => { setSelected(u); setPanel('detail') }

  const startEdit = (u: UserItem) => {
    setEditForm({ displayName: u.displayName ?? '', role: u.role, status: u.status })
    setPanel('edit')
  }

  const handleSaveEdit = () => {
    if (!selected) return
    updateMut.mutate({ userId: selected.id, params: { displayName: editForm.displayName, role: editForm.role, status: editForm.status } })
  }

  const handleCreate = () => {
    if (!createForm.username.trim() || !createForm.password.trim()) { setCreateError('사용자명과 비밀번호를 입력하세요.'); return }
    if (createForm.password.length < 8) { setCreateError('비밀번호는 8자 이상이어야 합니다.'); return }
    createMut.mutate(createForm)
  }

  return (
    <div className="flex h-full">
      {/* 목록 */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2 flex-wrap shrink-0">
          <h2 className="text-sm font-bold mr-auto">사용자 관리</h2>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="검색..."
            className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded w-32 bg-white dark:bg-gray-800"
          />
          <select
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
            className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
          >
            <option value="">전체 역할</option>
            <option value="admin">관리자</option>
            <option value="user">일반</option>
          </select>
          <button
            onClick={() => { setCreateForm({ username: '', displayName: '', password: '', role: 'user' }); setCreateError(''); setPanel('create') }}
            className="px-3 py-1 text-xs bg-navy text-white rounded hover:bg-navy/90"
          >
            + 사용자 추가
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="py-10 text-center text-xs text-gray-400">불러오는 중...</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                <tr className="text-left text-gray-500 border-b border-gray-200 dark:border-gray-700">
                  <th className="py-2 px-3">사용자명</th>
                  <th className="py-2 px-3">표시이름</th>
                  <th className="py-2 px-3 w-20">역할</th>
                  <th className="py-2 px-3 w-16">온라인</th>
                  <th className="py-2 px-3 w-16">상태</th>
                  <th className="py-2 px-3 w-28">가입일</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => (
                  <tr
                    key={u.id}
                    onClick={() => openDetail(u)}
                    className={`border-b border-gray-100 dark:border-gray-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 ${selected?.id === u.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                  >
                    <td className="py-2 px-3 font-medium">{u.username}</td>
                    <td className="py-2 px-3 text-gray-500">{u.displayName ?? '-'}</td>
                    <td className="py-2 px-3">
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                        {u.role === 'admin' ? '관리자' : '사용자'}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <span className={`w-2 h-2 rounded-full inline-block ${u.isOnline ? 'bg-green-400' : 'bg-gray-300'}`} />
                    </td>
                    <td className="py-2 px-3">
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${u.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                        {u.status === 'active' ? '활성' : '비활성'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-gray-400">{formatRelative(u.createdAt)}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="py-10 text-center text-gray-400">사용자가 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 상세 패널 */}
      {panel === 'detail' && selected && (
        <aside className="w-72 border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 overflow-auto shrink-0">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold">사용자 상세</span>
            <button onClick={() => setPanel(null)} className="text-gray-400 hover:text-gray-600 text-lg">&times;</button>
          </div>
          <div className="space-y-2.5 text-xs">
            <InfoRow label="사용자명" value={selected.username} />
            <InfoRow label="표시이름" value={selected.displayName ?? '-'} />
            <InfoRow label="역할" value={selected.role === 'admin' ? '관리자' : '일반'} />
            <InfoRow label="상태" value={selected.status === 'active' ? '활성' : '비활성'} />
            <InfoRow label="온라인" value={selected.isOnline ? '접속 중' : '오프라인'} />
            <InfoRow label="마지막 접속" value={formatRelative(selected.lastSeen)} />
            <InfoRow label="가입일" value={selected.createdAt ? new Date(selected.createdAt).toLocaleDateString('ko-KR') : '-'} />
          </div>
          <div className="mt-5 space-y-2">
            <button onClick={() => startEdit(selected)} className="w-full py-1.5 text-[11px] border border-gray-300 rounded hover:bg-gray-50">수정</button>
            <button
              onClick={() => updateMut.mutate({ userId: selected.id, params: { status: selected.status === 'active' ? 'inactive' : 'active' } })}
              className={`w-full py-1.5 text-[11px] rounded ${selected.status === 'active' ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}
            >
              {selected.status === 'active' ? '비활성화' : '재활성화'}
            </button>
            {selected.isOnline && (
              <button onClick={() => forceLogoutMut.mutate(selected.id)} className="w-full py-1.5 text-[11px] bg-orange-100 text-orange-700 rounded hover:bg-orange-200">
                강제 로그아웃
              </button>
            )}
            <button
              onClick={() => { if (window.confirm(`"${selected.username}" 사용자를 삭제하시겠습니까?`)) deleteMut.mutate(selected.id) }}
              className="w-full py-1.5 text-[11px] text-red-500 border border-red-200 rounded hover:bg-red-50"
            >
              삭제
            </button>
          </div>
        </aside>
      )}

      {/* 수정 패널 */}
      {panel === 'edit' && selected && (
        <aside className="w-72 border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 overflow-auto shrink-0">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold">사용자 수정</span>
            <button onClick={() => setPanel('detail')} className="text-gray-400 hover:text-gray-600 text-lg">&times;</button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">사용자명 (변경 불가)</label>
              <input value={selected.username} disabled className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded bg-gray-50 text-gray-400" />
            </div>
            <AdminFormField label="표시이름" value={editForm.displayName} onChange={v => setEditForm(f => ({ ...f, displayName: v }))} />
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">역할</label>
              <select value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))} className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded bg-white dark:bg-gray-800">
                <option value="user">일반 사용자</option>
                <option value="admin">관리자</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">상태</label>
              <select value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))} className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded bg-white dark:bg-gray-800">
                <option value="active">활성</option>
                <option value="inactive">비활성</option>
              </select>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setPanel('detail')} className="flex-1 py-1.5 text-[11px] border border-gray-300 rounded hover:bg-gray-50">취소</button>
              <button onClick={handleSaveEdit} disabled={updateMut.isPending} className="flex-1 py-1.5 text-[11px] bg-navy text-white rounded hover:bg-navy/90 disabled:opacity-50">
                {updateMut.isPending ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* 생성 패널 */}
      {panel === 'create' && (
        <aside className="w-72 border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 overflow-auto shrink-0">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold">사용자 추가</span>
            <button onClick={() => setPanel(null)} className="text-gray-400 hover:text-gray-600 text-lg">&times;</button>
          </div>
          <div className="space-y-3">
            <AdminFormField label="사용자명" value={createForm.username} onChange={v => setCreateForm(f => ({ ...f, username: v }))} placeholder="영문/숫자/_ (3~20자)" />
            <AdminFormField label="표시이름" value={createForm.displayName} onChange={v => setCreateForm(f => ({ ...f, displayName: v }))} />
            <AdminFormField label="비밀번호" value={createForm.password} onChange={v => setCreateForm(f => ({ ...f, password: v }))} type="password" placeholder="8자 이상" />
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">역할</label>
              <select value={createForm.role} onChange={e => setCreateForm(f => ({ ...f, role: e.target.value }))} className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded bg-white dark:bg-gray-800">
                <option value="user">일반 사용자</option>
                <option value="admin">관리자</option>
              </select>
            </div>
            {createError && <p className="text-[11px] text-red-500 bg-red-50 px-2 py-1 rounded">{createError}</p>}
            <button
              onClick={handleCreate}
              disabled={createMut.isPending}
              className="w-full py-2 text-[11px] font-semibold bg-navy text-white rounded hover:bg-navy/90 disabled:opacity-50 mt-2"
            >
              {createMut.isPending ? '생성 중...' : '사용자 생성'}
            </button>
          </div>
        </aside>
      )}
    </div>
  )
}

// ─── 시스템 탭 ───

function SystemTab() {
  const { data: sys, isLoading } = useQuery<SystemStatus>({
    queryKey: ['admin:system'],
    queryFn: () => adminInvoke('server:admin:system') as Promise<SystemStatus>,
    refetchInterval: 30_000
  })

  return (
    <div className="h-full overflow-auto p-5 space-y-5">
      <h2 className="text-sm font-bold">시스템 상태</h2>

      {isLoading && <p className="text-xs text-gray-400">불러오는 중...</p>}

      {sys && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <InfoCard label="업타임" value={formatUptime(sys.uptimeSeconds)} />
            <InfoCard label="활성 세션" value={`${sys.activeSessions}개`} />
            <InfoCard label="DB 크기" value={formatBytes(sys.dbSizeBytes)} />
            <InfoCard label="캐시 크기" value={formatBytes(sys.cacheSizeBytes)} />
            <InfoCard label="업타임 (원문)" value={sys.uptimeDisplay} />
          </div>

          {sys.config && Object.keys(sys.config).length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">서버 설정</h3>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 space-y-1.5">
                {Object.entries(sys.config).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-xs">
                    <span className="text-gray-500 font-mono">{k}</span>
                    <span className="text-gray-700 dark:text-gray-300">{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── 공통 소형 컴포넌트 ───

function MetricCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className={`rounded-lg p-3.5 ${color}`}>
      <p className="text-[10px] font-medium opacity-70">{label}</p>
      <p className="text-2xl font-bold mt-0.5">{value}</p>
      <p className="text-[10px] mt-1 opacity-60">{sub}</p>
    </div>
  )
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
      <div className="text-[10px] text-gray-400 mb-1">{label}</div>
      <div className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{value}</div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-400">{label}</span>
      <span className="text-gray-700 dark:text-gray-300 text-right max-w-[55%] truncate">{value}</span>
    </div>
  )
}

function AdminFormField({ label, value, onChange, type = 'text', placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string
}) {
  return (
    <div>
      <label className="text-[10px] text-gray-500 block mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-navy/50"
      />
    </div>
  )
}
