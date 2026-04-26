import { useState, type CSSProperties } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { invoke } from '@renderer/services/ipcClient'
import { useMode } from '@renderer/hooks/useMode'
import { colors, fontFamily, layout } from '@renderer/design/theme'
import type { ApprovalItem, ApprovalReviewerItem } from '@shared/types/ipc'

/**
 * ApprovalsPageV2 — 문서 승인 관리 페이지
 * 탭: 검토 대기 / 내가 요청 / 완료
 */

type Tab = 'pending' | 'mine' | 'done'

export default function ApprovalsPageV2() {
  const { connected, user } = useMode()
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('pending')
  const [rejectingId, setRejectingId] = useState<number | null>(null)
  const [rejectComment, setRejectComment] = useState('')
  const [actionLoading, setActionLoading] = useState<number | null>(null)

  /* ── 데이터 ── */
  const { data, isLoading } = useQuery<{ items: ApprovalItem[]; total: number }>({
    queryKey: ['approval:list'],
    queryFn: () => invoke('approval:list', {}),
    enabled: connected,
    refetchInterval: connected ? 15000 : false,
  })
  const all: ApprovalItem[] = data?.items ?? []

  const myUserId = user?.userId ?? user?.id ?? 0

  const pendingItems = all.filter(a =>
    a.status === 'pending' &&
    a.reviewers.some(r => r.userId === myUserId && r.status === 'pending')
  )
  const mineItems = all.filter(a => a.requesterId === myUserId)
  const doneItems = all.filter(a => a.status !== 'pending')

  const tabItems = tab === 'pending' ? pendingItems : tab === 'mine' ? mineItems : doneItems

  /* ── 핸들러 ── */
  const handleApprove = async (id: number) => {
    setActionLoading(id)
    try {
      await invoke('approval:approve', { id })
      qc.invalidateQueries({ queryKey: ['approval:list'] })
    } catch (e) {
      alert(e instanceof Error ? e.message : '승인 처리 실패')
    } finally {
      setActionLoading(null)
    }
  }

  const handleRejectConfirm = async (id: number) => {
    if (!rejectComment.trim()) { alert('반려 사유를 입력하세요.'); return }
    setActionLoading(id)
    try {
      await invoke('approval:reject', { id, comment: rejectComment })
      qc.invalidateQueries({ queryKey: ['approval:list'] })
      setRejectingId(null)
      setRejectComment('')
    } catch (e) {
      alert(e instanceof Error ? e.message : '반려 처리 실패')
    } finally {
      setActionLoading(null)
    }
  }

  /* ── 스타일 ── */
  const pageStyle: CSSProperties = { flex: 1, display: 'flex', flexDirection: 'column', background: colors.bg, fontFamily, minHeight: 0 }
  const headerStyle: CSSProperties = { padding: '20px 24px 0', background: colors.bgPrimary, borderBottom: `1px solid ${colors.border}` }
  const titleStyle: CSSProperties = { fontSize: 20, fontWeight: 700, color: colors.text, margin: '0 0 16px' }
  const tabBarStyle: CSSProperties = { display: 'flex', gap: 0 }
  const bodyStyle: CSSProperties = { flex: 1, display: 'flex', overflow: 'hidden' }
  const listAreaStyle: CSSProperties = { flex: 1, padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }
  const rightPanelStyle: CSSProperties = {
    width: layout.rightPanelCollapsed, borderLeft: `1px solid ${colors.border}`,
    background: colors.bgPrimary, padding: 20, overflowY: 'auto', flexShrink: 0,
  }
  const tabStyle = (active: boolean): CSSProperties => ({
    padding: '10px 20px', fontSize: 13, fontWeight: active ? 600 : 400,
    color: active ? colors.navy : colors.textSub,
    borderBottom: `2px solid ${active ? colors.navy : 'transparent'}`,
    background: 'none', border: 'none',
    borderBottomWidth: 2, borderBottomStyle: 'solid',
    borderBottomColor: active ? colors.navy : 'transparent',
    cursor: 'pointer', fontFamily,
  })

  /* ── 승인 카드 ── */
  const renderCard = (item: ApprovalItem) => {
    const statusMeta = {
      pending:  { label: '대기중', color: colors.orange, bg: '#fff8e1', border: colors.orange },
      approved: { label: '승인완료', color: colors.green,  bg: colors.greenBg, border: colors.green },
      rejected: { label: '반려됨', color: colors.red,    bg: '#fdecea', border: colors.red },
    }[item.status]

    const myReviewer: ApprovalReviewerItem | undefined =
      item.reviewers.find(r => r.userId === myUserId)
    const canAct = item.status === 'pending' && myReviewer?.status === 'pending'
    const isRejecting = rejectingId === item.id
    const isActing = actionLoading === item.id

    const fileName = item.filePath ? item.filePath.split(/[/\\]/).pop() : '저장소 전체'
    const timeAgo = _timeAgo(item.createdAt)

    return (
      <div key={item.id} style={{
        background: colors.bgPrimary, borderRadius: layout.radius,
        border: `1px solid ${colors.border}`,
        borderLeft: `4px solid ${statusMeta.border}`,
        padding: '14px 16px',
      }}>
        {/* 제목 행 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>📄 {fileName}</span>
          {item.revision != null && (
            <span style={{ fontSize: 11, color: colors.textMuted }}>r.{item.revision}</span>
          )}
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
            color: statusMeta.color, background: statusMeta.bg,
          }}>{statusMeta.label}</span>
        </div>

        {/* 메타 행 */}
        <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 8 }}>
          요청자: {item.requesterName ?? `사용자 ${item.requesterId}`} · {timeAgo}
          {item.message && <span> · {item.message}</span>}
        </div>

        {/* 검토자 칩 */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: canAct ? 12 : 0 }}>
          {item.reviewers.map(r => (
            <span key={r.userId} style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
              background: r.status === 'approved' ? colors.greenBg : r.status === 'rejected' ? '#fdecea' : '#f0f0f0',
              color: r.status === 'approved' ? colors.green : r.status === 'rejected' ? colors.red : colors.textMuted,
            }}>
              {r.username ?? `사용자 ${r.userId}`}
              {r.status === 'approved' && ' ✓'}
              {r.status === 'rejected' && ' ✗'}
            </span>
          ))}
        </div>

        {/* 승인/반려 액션 (내가 검토자이고 대기중인 경우만) */}
        {canAct && !isRejecting && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => handleApprove(item.id)}
              disabled={isActing}
              style={{
                padding: '6px 16px', fontSize: 12, fontWeight: 600,
                background: isActing ? '#aaa' : colors.green,
                color: '#fff', border: 'none', borderRadius: 6,
                cursor: isActing ? 'not-allowed' : 'pointer', fontFamily,
              }}
            >
              {isActing ? '처리 중…' : '✓ 승인'}
            </button>
            <button
              onClick={() => { setRejectingId(item.id); setRejectComment('') }}
              style={{
                padding: '6px 16px', fontSize: 12, fontWeight: 600,
                background: 'none', color: colors.red,
                border: `1px solid ${colors.red}`, borderRadius: 6,
                cursor: 'pointer', fontFamily,
              }}
            >
              ✗ 반려
            </button>
          </div>
        )}

        {/* 반려 사유 입력 인라인 */}
        {canAct && isRejecting && (
          <div style={{ marginTop: 4 }}>
            <textarea
              value={rejectComment}
              onChange={e => setRejectComment(e.target.value)}
              placeholder="반려 사유를 입력하세요 (필수)"
              rows={2}
              style={{
                width: '100%', padding: '6px 8px', fontSize: 12,
                border: `1px solid ${colors.red}`, borderRadius: 6,
                fontFamily, resize: 'none', boxSizing: 'border-box',
                outline: 'none', marginBottom: 6,
              }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => handleRejectConfirm(item.id)}
                disabled={isActing || !rejectComment.trim()}
                style={{
                  padding: '5px 14px', fontSize: 12, fontWeight: 600,
                  background: rejectComment.trim() ? colors.red : '#aaa',
                  color: '#fff', border: 'none', borderRadius: 6,
                  cursor: !rejectComment.trim() || isActing ? 'not-allowed' : 'pointer', fontFamily,
                }}
              >
                {isActing ? '처리 중…' : '반려 확정'}
              </button>
              <button
                onClick={() => { setRejectingId(null); setRejectComment('') }}
                style={{
                  padding: '5px 14px', fontSize: 12, background: 'none',
                  color: colors.textSub, border: `1px solid ${colors.border}`,
                  borderRadius: 6, cursor: 'pointer', fontFamily,
                }}
              >
                취소
              </button>
            </div>
          </div>
        )}

        {/* 반려된 경우 사유 표시 */}
        {item.status === 'rejected' && (
          (() => {
            const rejector = item.reviewers.find(r => r.status === 'rejected' && r.comment)
            return rejector ? (
              <div style={{ marginTop: 8, padding: '6px 10px', background: '#fdecea', borderRadius: 4, fontSize: 11, color: colors.red }}>
                반려 사유: {rejector.comment}
              </div>
            ) : null
          })()
        )}
      </div>
    )
  }

  /* ── 탭 카운트 ── */
  const tabDefs: { key: Tab; label: string }[] = [
    { key: 'pending', label: `검토 대기${pendingItems.length > 0 ? ` (${pendingItems.length})` : ''}` },
    { key: 'mine',    label: `내가 요청${mineItems.length > 0 ? ` (${mineItems.length})` : ''}` },
    { key: 'done',    label: `완료${doneItems.length > 0 ? ` (${doneItems.length})` : ''}` },
  ]

  /* ── 우측 통계 패널 ── */
  const renderRightPanel = () => {
    const stats = {
      total: all.length,
      pending: all.filter(a => a.status === 'pending').length,
      approved: all.filter(a => a.status === 'approved').length,
      rejected: all.filter(a => a.status === 'rejected').length,
    }
    const statRow = (label: string, val: number, color?: string): CSSProperties => ({})
    return (
      <div style={rightPanelStyle}>
        <div style={{ fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 12 }}>
          승인 통계
        </div>
        {[
          { label: '전체', val: stats.total, color: colors.text },
          { label: '대기중', val: stats.pending, color: colors.orange },
          { label: '승인완료', val: stats.approved, color: colors.green },
          { label: '반려됨', val: stats.rejected, color: colors.red },
        ].map(s => (
          <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: `1px solid ${colors.borderLight}` }}>
            <span style={{ fontSize: 12, color: colors.textSub }}>{s.label}</span>
            <strong style={{ fontSize: 14, color: s.color }}>{s.val}</strong>
          </div>
        ))}

        <div style={{ marginTop: 20, fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8 }}>
          자동 승인 규칙
        </div>
        <div style={{ fontSize: 11, color: colors.textMuted, lineHeight: 1.5 }}>
          관리자가 설정한 경로 패턴에 따라 자동으로 승인됩니다.<br />
          규칙 설정은 앱 관리 → 승인규칙에서 변경할 수 있습니다.
        </div>
      </div>
    )
  }

  /* ── 비연결 상태 ── */
  if (!connected) {
    return (
      <div style={{ ...pageStyle, alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: colors.textMuted }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: colors.text, marginBottom: 8 }}>서버 연결이 필요합니다</div>
          <div style={{ fontSize: 13 }}>서버에 연결하면 문서 승인 요청 및 검토를 할 수 있습니다.</div>
        </div>
      </div>
    )
  }

  return (
    <div style={pageStyle}>
      {/* 헤더 */}
      <div style={headerStyle}>
        <h2 style={titleStyle}>문서 승인</h2>
        <div style={tabBarStyle}>
          {tabDefs.map(({ key, label }) => (
            <button key={key} style={tabStyle(tab === key)} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 본문 */}
      <div style={bodyStyle}>
        <div style={listAreaStyle}>
          {isLoading ? (
            <div style={{ textAlign: 'center', color: colors.textMuted, padding: 40 }}>불러오는 중…</div>
          ) : tabItems.length === 0 ? (
            <div style={{ textAlign: 'center', color: colors.textMuted, padding: 40 }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>
                {tab === 'pending' ? '✓' : tab === 'mine' ? '📤' : '📋'}
              </div>
              <div style={{ fontSize: 14, color: colors.text, marginBottom: 6 }}>
                {tab === 'pending' ? '검토 대기중인 항목이 없습니다' :
                 tab === 'mine'    ? '내가 요청한 승인이 없습니다' :
                                    '완료된 승인이 없습니다'}
              </div>
              <div style={{ fontSize: 12 }}>
                {tab === 'pending' ? '다른 사용자가 승인을 요청하면 여기에 표시됩니다.' :
                 tab === 'mine'    ? '파일 상세에서 승인 요청을 생성할 수 있습니다.' :
                                    '승인 또는 반려된 항목이 여기에 표시됩니다.'}
              </div>
            </div>
          ) : (
            tabItems.map(item => renderCard(item))
          )}
        </div>

        {renderRightPanel()}
      </div>
    </div>
  )
}

function _timeAgo(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return '방금 전'
    if (mins < 60) return `${mins}분 전`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}시간 전`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}일 전`
    return new Date(iso).toLocaleDateString('ko-KR')
  } catch { return '' }
}
