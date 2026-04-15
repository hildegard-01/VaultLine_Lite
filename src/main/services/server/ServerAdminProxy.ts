import { getAxiosInstance } from './ServerConnectionService'
import * as ModeManager from './ModeManager'

/**
 * ServerAdminProxy — 관리자 API 프록시
 *
 * 역할:
 * - 관리자 대시보드 지표 조회 (GET /admin/dashboard)
 * - 시스템 상태 조회 (GET /admin/system)
 * - 온라인 사용자 목록 (GET /admin/online-users)
 * - 사용자 강제 로그아웃 (POST /admin/users/{id}/force-logout)
 * - 사용자 CRUD (GET/POST/PUT/DELETE /users) — 관리자 전용
 * - admin 역할 사용자에게만 UI 노출 (useMode 훅의 isAdmin 확인 후 호출)
 *
 * 구성:
 * - getDashboard(): 대시보드 지표
 * - getSystemStatus(): 시스템 상태
 * - getOnlineUsers(): 온라인 사용자 목록
 * - forceLogout(): 강제 로그아웃
 * - listUsers(): 전체 사용자 목록
 * - createUser(): 사용자 생성
 * - updateUser(): 사용자 수정
 * - deleteUser(): 사용자 삭제
 */

export interface DashboardData {
  users: { total: number; online: number }
  repos: { total: number }
  commits: { total: number }
  approvals: { pending: number }
  shares: { active: number }
  activity: { last24h: number }
  cache: { count: number; sizeBytes: number }
}

export interface SystemStatus {
  uptimeSeconds: number
  uptimeDisplay: string
  dbSizeBytes: number
  cacheSizeBytes: number
  activeSessions: number
  config: Record<string, unknown>
}

export interface UserItem {
  id: number
  username: string
  displayName: string | null
  role: string
  status: string
  isOnline: boolean
  createdAt: string
  lastSeen: string | null
}

/** 대시보드 지표 조회 */
export async function getDashboard(): Promise<DashboardData> {
  if (!ModeManager.isConnected()) throw new Error('서버에 연결되어 있지 않습니다.')

  const instance = getAxiosInstance()
  const response = await instance.get<Record<string, unknown>>('/admin/dashboard')
  const d = response.data

  return {
    users: d.users as { total: number; online: number },
    repos: d.repos as { total: number },
    commits: d.commits as { total: number },
    approvals: { pending: (d.approvals as Record<string, number>).pending },
    shares: { active: (d.shares as Record<string, number>).active },
    activity: { last24h: (d.activity as Record<string, number>).last_24h },
    cache: {
      count: (d.cache as Record<string, number>).count,
      sizeBytes: (d.cache as Record<string, number>).size_bytes
    }
  }
}

/** 시스템 상태 조회 */
export async function getSystemStatus(): Promise<SystemStatus> {
  if (!ModeManager.isConnected()) throw new Error('서버에 연결되어 있지 않습니다.')

  const instance = getAxiosInstance()
  const response = await instance.get<Record<string, unknown>>('/admin/system')
  const d = response.data

  return {
    uptimeSeconds: d.uptime_seconds as number,
    uptimeDisplay: d.uptime_display as string,
    dbSizeBytes: d.db_size_bytes as number,
    cacheSizeBytes: d.cache_size_bytes as number,
    activeSessions: d.active_sessions as number,
    config: d.config as Record<string, unknown>
  }
}

/** 온라인 사용자 목록 */
export async function getOnlineUsers(): Promise<{ id: number; username: string; displayName: string | null; lastHeartbeat: string | null }[]> {
  if (!ModeManager.isConnected()) throw new Error('서버에 연결되어 있지 않습니다.')

  const instance = getAxiosInstance()
  const response = await instance.get<unknown[]>('/admin/online-users')

  return response.data.map((u) => {
    const d = u as Record<string, unknown>
    return {
      id: d.id as number,
      username: d.username as string,
      displayName: (d.display_name as string | null) ?? null,
      lastHeartbeat: (d.last_heartbeat as string | null) ?? null
    }
  })
}

/** 강제 로그아웃 */
export async function forceLogout(userId: number): Promise<void> {
  if (!ModeManager.isConnected()) throw new Error('서버에 연결되어 있지 않습니다.')

  const instance = getAxiosInstance()
  await instance.post(`/admin/users/${userId}/force-logout`)
}

/** 전체 사용자 목록 (관리자) */
export async function listUsers(skip = 0, limit = 100): Promise<UserItem[]> {
  if (!ModeManager.isConnected()) throw new Error('서버에 연결되어 있지 않습니다.')

  const instance = getAxiosInstance()
  const response = await instance.get<unknown[]>('/users', { params: { skip, limit } })
  return response.data.map(_mapUser)
}

/** 사용자 생성 (관리자) */
export async function createUser(params: {
  username: string
  password: string
  displayName?: string
  role?: 'user' | 'admin'
}): Promise<UserItem> {
  if (!ModeManager.isConnected()) throw new Error('서버에 연결되어 있지 않습니다.')

  const instance = getAxiosInstance()
  const response = await instance.post<Record<string, unknown>>('/users', {
    username: params.username,
    password: params.password,
    display_name: params.displayName,
    role: params.role ?? 'user'
  })
  return _mapUser(response.data)
}

/** 사용자 수정 (관리자) */
export async function updateUser(userId: number, params: {
  displayName?: string
  role?: 'user' | 'admin'
  status?: 'active' | 'inactive'
  password?: string
}): Promise<UserItem> {
  if (!ModeManager.isConnected()) throw new Error('서버에 연결되어 있지 않습니다.')

  const instance = getAxiosInstance()
  const response = await instance.put<Record<string, unknown>>(`/users/${userId}`, {
    display_name: params.displayName,
    role: params.role,
    status: params.status,
    password: params.password
  })
  return _mapUser(response.data)
}

/** 사용자 삭제 (관리자) */
export async function deleteUser(userId: number): Promise<void> {
  if (!ModeManager.isConnected()) throw new Error('서버에 연결되어 있지 않습니다.')

  const instance = getAxiosInstance()
  await instance.delete(`/users/${userId}`)
}

/** 서버 응답 → UserItem 변환 */
function _mapUser(d: unknown): UserItem {
  const u = d as Record<string, unknown>
  return {
    id: u.id as number,
    username: u.username as string,
    displayName: (u.display_name as string | null) ?? null,
    role: (u.role as string) ?? 'user',
    status: (u.status as string) ?? 'active',
    isOnline: (u.is_online as boolean) ?? false,
    createdAt: u.created_at as string,
    lastSeen: (u.last_seen as string | null) ?? null
  }
}
