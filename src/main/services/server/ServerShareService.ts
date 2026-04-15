import { getAxiosInstance } from './ServerConnectionService'
import * as ModeManager from './ModeManager'

/**
 * ServerShareService — 서버 공유 링크 관리
 *
 * 역할:
 * - 서버 영구 공유 링크 생성 (POST /shares)
 * - 공유 목록/상세 조회
 * - 공유 수정 (만료일, 비밀번호, 권한)
 * - 공유 삭제
 * - 커넥티드 모드에서만 동작
 *
 * 구성:
 * - createShare(): 공유 링크 생성
 * - listShares(): 내 공유 목록
 * - getShare(): 공유 상세
 * - updateShare(): 공유 수정
 * - deleteShare(): 공유 삭제
 */

export interface ShareCreateParams {
  repoId: number          // 서버 저장소 ID
  filePath: string | null // null이면 저장소 전체
  permission: 'view' | 'download' | 'edit'
  password?: string
  expiresAt?: string      // ISO 8601
  maxDownloads?: number
  recipientUserIds?: number[]
}

export interface ShareItem {
  id: number
  repoId: number
  filePath: string | null
  shareToken: string
  shareUrl: string        // 완성된 공유 URL
  permission: string
  hasPassword: boolean
  expiresAt: string | null
  maxDownloads: number | null
  downloadCount: number
  isActive: boolean
  createdAt: string
}

export interface ShareUpdateParams {
  permission?: 'view' | 'download' | 'edit'
  isActive?: boolean
  expiresAt?: string | null
  maxDownloads?: number | null
}

/** 공유 링크 생성 */
export async function createShare(params: ShareCreateParams): Promise<ShareItem> {
  if (!ModeManager.isConnected()) throw new Error('서버에 연결되어 있지 않습니다.')

  const instance = getAxiosInstance()
  const response = await instance.post<Record<string, unknown>>('/shares', {
    repo_id: params.repoId,
    file_path: params.filePath,
    permission: params.permission,
    password: params.password,
    expires_at: params.expiresAt,
    max_downloads: params.maxDownloads,
    recipient_user_ids: params.recipientUserIds ?? []
  })

  return _mapShare(response.data)
}

/** 내 공유 목록 조회 */
export async function listShares(skip = 0, limit = 50): Promise<{ items: ShareItem[]; total: number }> {
  if (!ModeManager.isConnected()) throw new Error('서버에 연결되어 있지 않습니다.')

  const instance = getAxiosInstance()
  const response = await instance.get<{ items: unknown[]; total: number }>('/shares', {
    params: { skip, limit }
  })

  return {
    items: response.data.items.map((s) => _mapShare(s as Record<string, unknown>)),
    total: response.data.total
  }
}

/** 공유 상세 조회 */
export async function getShare(shareId: number): Promise<ShareItem> {
  if (!ModeManager.isConnected()) throw new Error('서버에 연결되어 있지 않습니다.')

  const instance = getAxiosInstance()
  const response = await instance.get<Record<string, unknown>>(`/shares/${shareId}`)
  return _mapShare(response.data)
}

/** 공유 수정 */
export async function updateShare(shareId: number, params: ShareUpdateParams): Promise<ShareItem> {
  if (!ModeManager.isConnected()) throw new Error('서버에 연결되어 있지 않습니다.')

  const instance = getAxiosInstance()
  const response = await instance.put<Record<string, unknown>>(`/shares/${shareId}`, {
    permission: params.permission,
    is_active: params.isActive,
    expires_at: params.expiresAt,
    max_downloads: params.maxDownloads
  })

  return _mapShare(response.data)
}

/** 공유 삭제 */
export async function deleteShare(shareId: number): Promise<void> {
  if (!ModeManager.isConnected()) throw new Error('서버에 연결되어 있지 않습니다.')

  const instance = getAxiosInstance()
  await instance.delete(`/shares/${shareId}`)
}

/** 서버 응답 → 내부 타입 변환 */
function _mapShare(s: Record<string, unknown>): ShareItem {
  const serverUrl = ModeManager.getStatus().serverUrl ?? ''
  return {
    id: s.id as number,
    repoId: s.repo_id as number,
    filePath: (s.file_path as string | null) ?? null,
    shareToken: s.share_token as string,
    shareUrl: `${serverUrl}/shares/public/${s.share_token}`,
    permission: s.permission as string,
    hasPassword: s.has_password as boolean,
    expiresAt: (s.expires_at as string | null) ?? null,
    maxDownloads: (s.max_downloads as number | null) ?? null,
    downloadCount: (s.download_count as number) ?? 0,
    isActive: s.is_active as boolean,
    createdAt: s.created_at as string
  }
}
