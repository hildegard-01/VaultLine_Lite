import { getAxiosInstance } from './ServerConnectionService'
import * as ModeManager from './ModeManager'

/**
 * ServerApprovalProxy — 승인 워크플로우 API 프록시
 *
 * 역할:
 * - 승인 요청 생성 (POST /approvals)
 * - 승인 목록 조회 (GET /approvals)
 * - 승인/반려 처리 (POST /approvals/{id}/approve|reject)
 * - 승인 규칙 조회/생성/삭제 (관리자)
 * - 커넥티드 모드에서만 동작
 *
 * 구성:
 * - createApproval(): 승인 요청 생성
 * - listApprovals(): 승인 목록 조회
 * - getApproval(): 승인 상세 조회
 * - approve(): 승인 처리
 * - reject(): 반려 처리
 * - listRules(): 승인 규칙 목록 (관리자)
 * - createRule(): 승인 규칙 생성 (관리자)
 * - deleteRule(): 승인 규칙 삭제 (관리자)
 */

export interface ApprovalItem {
  id: number
  repoId: number
  filePath: string
  revision: number
  requesterId: number
  requesterName: string | null
  message: string | null
  status: 'pending' | 'approved' | 'rejected'
  reviewers: ReviewerItem[]
  resolvedAt: string | null
  createdAt: string
}

export interface ReviewerItem {
  userId: number
  username: string | null
  status: 'pending' | 'approved' | 'rejected'
  comment: string | null
  reviewedAt: string | null
}

export interface ApprovalCreateParams {
  repoId: number
  filePath: string
  revision: number
  message?: string
  reviewerUserIds: number[]
}

export interface ApprovalRuleItem {
  id: number
  repoId: number
  pathPattern: string
  requiredReviewers: number
  autoAssignUserIds: number[]
  createdAt: string
}

/** 승인 요청 생성 */
export async function createApproval(params: ApprovalCreateParams): Promise<ApprovalItem> {
  if (!ModeManager.isConnected()) throw new Error('서버에 연결되어 있지 않습니다.')

  const instance = getAxiosInstance()
  const response = await instance.post<Record<string, unknown>>('/approvals', {
    repo_id: params.repoId,
    file_path: params.filePath,
    revision: params.revision,
    message: params.message,
    reviewer_user_ids: params.reviewerUserIds
  })

  return _mapApproval(response.data)
}

/** 승인 목록 조회 */
export async function listApprovals(
  statusFilter?: 'pending' | 'approved' | 'rejected',
  skip = 0,
  limit = 50
): Promise<{ items: ApprovalItem[]; total: number }> {
  if (!ModeManager.isConnected()) return { items: [], total: 0 }

  const instance = getAxiosInstance()
  const response = await instance.get<{ items: unknown[]; total: number }>('/approvals', {
    params: { status_filter: statusFilter, skip, limit }
  })

  return {
    items: response.data.items.map(_mapApproval),
    total: response.data.total
  }
}

/** 승인 상세 조회 */
export async function getApproval(approvalId: number): Promise<ApprovalItem> {
  if (!ModeManager.isConnected()) throw new Error('서버에 연결되어 있지 않습니다.')

  const instance = getAxiosInstance()
  const response = await instance.get<Record<string, unknown>>(`/approvals/${approvalId}`)
  return _mapApproval(response.data)
}

/** 승인 처리 */
export async function approve(approvalId: number, comment?: string): Promise<ApprovalItem> {
  if (!ModeManager.isConnected()) throw new Error('서버에 연결되어 있지 않습니다.')

  const instance = getAxiosInstance()
  const response = await instance.post<Record<string, unknown>>(
    `/approvals/${approvalId}/approve`,
    { comment: comment ?? null }
  )
  return _mapApproval(response.data)
}

/** 반려 처리 */
export async function reject(approvalId: number, comment?: string): Promise<ApprovalItem> {
  if (!ModeManager.isConnected()) throw new Error('서버에 연결되어 있지 않습니다.')

  const instance = getAxiosInstance()
  const response = await instance.post<Record<string, unknown>>(
    `/approvals/${approvalId}/reject`,
    { comment: comment ?? null }
  )
  return _mapApproval(response.data)
}

/** 승인 규칙 목록 (관리자) */
export async function listRules(): Promise<ApprovalRuleItem[]> {
  if (!ModeManager.isConnected()) throw new Error('서버에 연결되어 있지 않습니다.')

  const instance = getAxiosInstance()
  const response = await instance.get<unknown[]>('/approvals/rules')
  return response.data.map(_mapRule)
}

/** 승인 규칙 생성 (관리자) */
export async function createRule(params: {
  repoId: number
  pathPattern: string
  requiredReviewers?: number
  autoAssignUserIds?: number[]
}): Promise<ApprovalRuleItem> {
  if (!ModeManager.isConnected()) throw new Error('서버에 연결되어 있지 않습니다.')

  const instance = getAxiosInstance()
  const response = await instance.post<Record<string, unknown>>('/approvals/rules', {
    repo_id: params.repoId,
    path_pattern: params.pathPattern,
    required_reviewers: params.requiredReviewers ?? 1,
    auto_assign_user_ids: params.autoAssignUserIds ?? []
  })
  return _mapRule(response.data)
}

/** 승인 규칙 삭제 (관리자) */
export async function deleteRule(ruleId: number): Promise<void> {
  if (!ModeManager.isConnected()) throw new Error('서버에 연결되어 있지 않습니다.')

  const instance = getAxiosInstance()
  await instance.delete(`/approvals/rules/${ruleId}`)
}

/** 서버 응답 → ApprovalItem 변환 */
function _mapApproval(d: unknown): ApprovalItem {
  const a = d as Record<string, unknown>
  const reviewers = ((a.reviewers as unknown[]) ?? []).map((r) => {
    const rv = r as Record<string, unknown>
    return {
      userId: rv.user_id as number,
      username: (rv.username as string | null) ?? null,
      status: rv.status as ReviewerItem['status'],
      comment: (rv.comment as string | null) ?? null,
      reviewedAt: (rv.reviewed_at as string | null) ?? null
    }
  })

  return {
    id: a.id as number,
    repoId: a.repo_id as number,
    filePath: a.file_path as string,
    revision: a.revision as number,
    requesterId: a.requester_id as number,
    requesterName: (a.requester_name as string | null) ?? null,
    message: (a.message as string | null) ?? null,
    status: a.status as ApprovalItem['status'],
    reviewers,
    resolvedAt: (a.resolved_at as string | null) ?? null,
    createdAt: a.created_at as string
  }
}

/** 서버 응답 → ApprovalRuleItem 변환 */
function _mapRule(d: unknown): ApprovalRuleItem {
  const r = d as Record<string, unknown>
  let autoAssignIds: number[] = []
  try {
    if (typeof r.auto_assign_user_ids === 'string') {
      autoAssignIds = JSON.parse(r.auto_assign_user_ids) as number[]
    } else if (Array.isArray(r.auto_assign_user_ids)) {
      autoAssignIds = r.auto_assign_user_ids as number[]
    }
  } catch {
    autoAssignIds = []
  }

  return {
    id: r.id as number,
    repoId: r.repo_id as number,
    pathPattern: r.path_pattern as string,
    requiredReviewers: (r.required_reviewers as number) ?? 1,
    autoAssignUserIds: autoAssignIds,
    createdAt: r.created_at as string
  }
}
