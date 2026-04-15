import { getAxiosInstance } from './ServerConnectionService'
import { getDatabase } from '../DatabaseService'
import { saveServerRepoId } from './RepoSyncService'
import * as ModeManager from './ModeManager'

/**
 * ServerInviteService — 서버 기반 저장소 등록/초대
 *
 * 역할:
 * - 로컬 저장소를 서버에 등록 (POST /repos) → server_repo_id 매핑 저장
 * - 서버에서 공유된 저장소 목록 조회 (GET /repos)
 * - 커넥티드 모드에서만 동작
 * - P2P docvault:// 초대는 기존 InvitationService에서 그대로 처리
 *
 * 구성:
 * - registerRepoToServer(): 로컬 저장소 → 서버 등록
 * - listServerRepos(): 서버 저장소 목록
 * - getServerRepo(): 서버 저장소 상세
 */

export interface ServerRepo {
  id: number
  name: string
  description: string | null
  ownerUsername: string
  ownerOnline: boolean
  type: string
  latestRevision: number
  totalFiles: number
  lastSyncAt: string | null
  status: string
}

export interface RegisterRepoParams {
  localRepoId: number
  name: string
  description?: string
  type?: 'personal' | 'team'
  groupId?: number
}

/**
 * 로컬 저장소를 서버에 등록
 * 저장소 생성 또는 첫 커넥티드 모드 전환 시 호출
 */
export async function registerRepoToServer(params: RegisterRepoParams): Promise<number> {
  if (!ModeManager.isConnected()) throw new Error('서버에 연결되어 있지 않습니다.')

  const instance = getAxiosInstance()
  const response = await instance.post<{ id: number }>('/repos', {
    name: params.name,
    description: params.description ?? '',
    type: params.type ?? 'personal',
    group_id: params.groupId ?? null
  })

  const serverRepoId = response.data.id

  // 로컬 DB에 매핑 저장
  saveServerRepoId(params.localRepoId, serverRepoId)

  return serverRepoId
}

/**
 * 서버 저장소 목록 조회
 * Sidebar "공유받은문서" 섹션에서 사용
 */
export async function listServerRepos(
  type?: 'personal' | 'team',
  skip = 0,
  limit = 50
): Promise<{ items: ServerRepo[]; total: number }> {
  if (!ModeManager.isConnected()) return { items: [], total: 0 }

  const instance = getAxiosInstance()
  const response = await instance.get<{ items: unknown[]; total: number }>('/repos', {
    params: { type, skip, limit }
  })

  return {
    items: response.data.items.map(_mapRepo),
    total: response.data.total
  }
}

/**
 * 서버 저장소 상세 조회
 */
export async function getServerRepo(serverRepoId: number): Promise<ServerRepo> {
  if (!ModeManager.isConnected()) throw new Error('서버에 연결되어 있지 않습니다.')

  const instance = getAxiosInstance()
  const response = await instance.get<Record<string, unknown>>(`/repos/${serverRepoId}`)
  return _mapRepo(response.data)
}

/**
 * 커넥티드 모드 전환 시 등록되지 않은 로컬 저장소를 서버에 일괄 등록
 * server:connect IPC 성공 후 호출
 */
export async function syncLocalReposToServer(): Promise<void> {
  if (!ModeManager.isConnected()) return

  const db = getDatabase()
  const repos = db.prepare(`
    SELECT id, name, description FROM repositories WHERE status = 'active'
  `).all() as { id: number; name: string; description: string }[]

  for (const repo of repos) {
    // 이미 등록된 저장소는 스킵
    const existing = db.prepare(`
      SELECT value FROM app_settings WHERE key = ?
    `).get(`server_repo_id_${repo.id}`) as { value: string } | undefined

    if (existing) continue

    try {
      await registerRepoToServer({
        localRepoId: repo.id,
        name: repo.name,
        description: repo.description
      })
    } catch {
      // 개별 등록 실패 무시 (중복명 등)
    }
  }
}

/** 서버 응답 → 내부 타입 변환 */
function _mapRepo(r: unknown): ServerRepo {
  const d = r as Record<string, unknown>
  const owner = d.owner as Record<string, unknown> | null

  return {
    id: d.id as number,
    name: d.name as string,
    description: (d.description as string | null) ?? null,
    ownerUsername: owner ? (owner.username as string) : 'unknown',
    ownerOnline: owner ? (owner.is_online as boolean) : false,
    type: (d.type as string) ?? 'personal',
    latestRevision: (d.latest_revision as number) ?? 0,
    totalFiles: (d.total_files as number) ?? 0,
    lastSyncAt: (d.last_sync_at as string | null) ?? null,
    status: (d.status as string) ?? 'active'
  }
}
