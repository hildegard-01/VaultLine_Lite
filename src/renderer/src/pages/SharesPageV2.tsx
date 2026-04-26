import { useState, useEffect, type CSSProperties } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { invoke } from '@renderer/services/ipcClient'
import { useMode } from '@renderer/hooks/useMode'
import { colors, fontFamily, layout } from '@renderer/design/theme'
import type { ShareServerStatus, ShareLinkEntry, ServerShareItem, ServerReceivedShareItem } from '@shared/types/ipc'

/**
 * SharesPageV2 — 공유 관리 페이지
 * 탭: 로컬 공유 (link) / 공유받은 (server) / 내가 공유 (server)
 */

type Tab = 'local' | 'received' | 'mine'

export default function SharesPageV2() {
  const { connected } = useMode()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('local')
  const [selected, setSelected] = useState<ShareLinkEntry | null>(null)
  const [copiedId, setCopiedId] = useState<number | null>(null)

  /* ── 우측 패널 편집 상태 ── */
  const [editExpiresAt, setEditExpiresAt] = useState('')
  const [editPassword, setEditPassword] = useState('')
  const [clearPassword, setClearPassword] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [editSuccess, setEditSuccess] = useState(false)

  // 선택된 링크 변경 시 편집 상태 초기화
  useEffect(() => {
    if (selected) {
      setEditExpiresAt(selected.expiresAt ? toDatetimeLocal(selected.expiresAt) : '')
      setEditPassword('')
      setClearPassword(false)
      setEditError(null)
      setEditSuccess(false)
    }
  }, [selected?.id])

  /* ── 쿼리 ── */
  const { data: localShare } = useQuery<ShareServerStatus>({
    queryKey: ['share:server-status'],
    queryFn: () => invoke('share:server-status' as any),
    refetchInterval: 5000,
  })

  const { data: activeLinks = [], refetch: refetchLinks } = useQuery<ShareLinkEntry[]>({
    queryKey: ['share:link-list'],
    queryFn: () => invoke('share:link-list' as any),
    refetchInterval: 5000,
  })

  const { data: serverShares, refetch: refetchServerShares } = useQuery<{ sent: ServerShareItem[]; received: ServerShareItem[] }>({
    queryKey: ['server:share-list'],
    queryFn: () => invoke('server:share-list' as any),
    enabled: connected,
    refetchInterval: connected ? 10000 : false,
  })
  const sentShares: ServerShareItem[] = serverShares?.sent ?? []

  const { data: receivedShares = [], refetch: refetchReceivedShares } = useQuery<ServerReceivedShareItem[]>({
    queryKey: ['server:share-received'],
    queryFn: () => invoke('server:share-received' as any, {}),
    enabled: connected,
    refetchInterval: connected ? 15000 : false,
  })

  /* ── WS 이벤트 리스너 ── */
  useEffect(() => {
    // 공유자가 공유 취소 → 공유받은 목록 갱신
    const unsubRevoked = window.api.on('share:revoked', () => {
      queryClient.invalidateQueries({ queryKey: ['server:share-received'] })
      queryClient.invalidateQueries({ queryKey: ['remote-repo:list'] })
    })
    // 수신자가 공유 해제 → 내가 공유 목록 갱신
    const unsubLeft = window.api.on('share:left', () => {
      queryClient.invalidateQueries({ queryKey: ['server:share-list'] })
    })
    return () => { unsubRevoked(); unsubLeft() }
  }, [queryClient])

  /* ── 핸들러 ── */
  const handleRestartServer = async () => {
    try {
      const status = await invoke('share:restart-server' as any)
      queryClient.invalidateQueries({ queryKey: ['share:server-status'] })
      refetchLinks()
      if (!(status as any).running) alert('활성 링크가 없어 서버를 시작할 수 없습니다.')
    } catch (e) {
      alert(e instanceof Error ? e.message : '서버 시작 실패')
    }
  }

  const handleStopAll = async () => {
    if (!window.confirm('서버를 중지하고 모든 활성 링크를 비활성화하시겠습니까?')) return
    try {
      await invoke('share:stop-server' as any)
      setSelected(null)
      queryClient.invalidateQueries({ queryKey: ['share:server-status'] })
      refetchLinks()
    } catch (e) {
      alert(e instanceof Error ? e.message : '서버 중지 실패')
    }
  }

  const handleRevokeLink = async (id: number) => {
    if (!window.confirm('이 공유 링크를 삭제하시겠습니까?')) return
    try {
      await invoke('share:revoke' as any, { id })
      if (selected?.id === id) setSelected(null)
      queryClient.invalidateQueries({ queryKey: ['share:server-status'] })
      refetchLinks()
    } catch (e) {
      alert(e instanceof Error ? e.message : '삭제 실패')
    }
  }

  const handleCopyUrl = async (link: ShareLinkEntry) => {
    if (!link.downloadUrl) return
    try {
      await navigator.clipboard.writeText(link.downloadUrl)
      setCopiedId(link.id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch { /* 무시 */ }
  }

  const handleSaveLinkEdit = async () => {
    if (!selected) return
    setEditSaving(true)
    setEditError(null)
    setEditSuccess(false)
    try {
      const payload: { id: number; expiresAt?: string; password?: string; clearPassword?: boolean } = { id: selected.id }
      if (editExpiresAt) {
        payload.expiresAt = new Date(editExpiresAt).toISOString()
      } else {
        payload.expiresAt = ''  // 만료 없음으로 설정
      }
      if (clearPassword) {
        payload.clearPassword = true
      } else if (editPassword) {
        payload.password = editPassword
      }
      const updated = await invoke('share:link-update', payload)
      setSelected(updated)
      setEditPassword('')
      setClearPassword(false)
      setEditSuccess(true)
      setTimeout(() => setEditSuccess(false), 2500)
      refetchLinks()
    } catch (e) {
      setEditError(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setEditSaving(false)
    }
  }

  const handleRevokeServerShare = async (id: number) => {
    if (!window.confirm('이 공유를 취소하시겠습니까?')) return
    try {
      await invoke('server:share-revoke' as any, { id })
      refetchServerShares()
    } catch (e) {
      alert(e instanceof Error ? e.message : '공유 취소 실패')
    }
  }

  const handleLeaveShare = async (id: number) => {
    if (!window.confirm('이 공유에서 나가시겠습니까?')) return
    try {
      await invoke('server:share-leave' as any, { id })
      refetchReceivedShares()
    } catch (e) {
      alert(e instanceof Error ? e.message : '공유 해제 실패')
    }
  }

  const handleAcceptShare = async (id: number) => {
    try {
      await invoke('server:share-accept' as any, { id })
      refetchReceivedShares()
      queryClient.invalidateQueries({ queryKey: ['remote-repo:list'] })
    } catch (e) {
      alert(e instanceof Error ? e.message : '공유 수락 실패')
      refetchReceivedShares()
    }
  }

  const handleRejectShare = async (id: number) => {
    if (!window.confirm('이 공유를 거절하시겠습니까?')) return
    try {
      await invoke('server:share-reject' as any, { id })
      refetchReceivedShares()
    } catch (e) {
      alert(e instanceof Error ? e.message : '공유 거절 실패')
    }
  }

  /* ── 스타일 ── */
  const pageStyle: CSSProperties = { flex: 1, display: 'flex', flexDirection: 'column', background: colors.bg, fontFamily, minHeight: 0 }
  const headerStyle: CSSProperties = { padding: '20px 24px 0', background: colors.bgPrimary, borderBottom: `1px solid ${colors.border}` }
  const titleStyle: CSSProperties = { fontSize: 20, fontWeight: 700, color: colors.text, margin: '0 0 16px' }
  const tabBarStyle: CSSProperties = { display: 'flex', gap: 0, borderBottom: 'none' }
  const bodyStyle: CSSProperties = { flex: 1, display: 'flex', overflow: 'hidden' }
  const tableAreaStyle: CSSProperties = { flex: 1, padding: 24, overflowY: 'auto' }
  const rightPanelStyle: CSSProperties = {
    width: layout.rightPanelCollapsed, borderLeft: `1px solid ${colors.border}`,
    background: colors.bgPrimary, padding: 20, overflowY: 'auto', flexShrink: 0,
  }
  const tabStyle = (active: boolean): CSSProperties => ({
    padding: '10px 20px', fontSize: 13, fontWeight: active ? 600 : 400,
    color: active ? colors.navy : colors.textSub,
    borderBottom: active ? `2px solid ${colors.navy}` : '2px solid transparent',
    cursor: 'pointer', userSelect: 'none', background: 'none', border: 'none',
    borderBottomWidth: 2, borderBottomStyle: 'solid',
    borderBottomColor: active ? colors.navy : 'transparent', fontFamily,
  })
  const cardStyle: CSSProperties = {
    background: colors.bgPrimary, borderRadius: layout.radius,
    border: `1px solid ${colors.border}`, overflow: 'hidden',
  }
  const tableStyle: CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 }
  const thStyle: CSSProperties = {
    padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600,
    color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.4px',
    borderBottom: `1px solid ${colors.border}`, background: '#fafbfc',
  }
  const tdStyle: CSSProperties = {
    padding: '10px 12px', borderBottom: `1px solid ${colors.borderLight}`,
    color: colors.text, verticalAlign: 'middle',
  }
  const chipStyle = (color: string, bg: string): CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', padding: '2px 8px',
    borderRadius: 10, fontSize: 11, fontWeight: 600, color, background: bg,
  })
  const actionBtnStyle: CSSProperties = {
    padding: '4px 10px', fontSize: 11, fontWeight: 600,
    border: `1px solid ${colors.border}`, borderRadius: 4, cursor: 'pointer',
    background: 'none', color: colors.textSub, fontFamily, marginRight: 4,
  }

  /* ── 로컬 공유 탭 ── */
  const renderLocalTab = () => (
    <div style={tableAreaStyle}>
      {/* 서버 실행 중: 상태 바 + 중지 버튼 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px', borderRadius: layout.radius, marginBottom: 16,
        background: localShare?.running ? '#e8f5e9' : '#f5f5f5',
        border: `1px solid ${localShare?.running ? '#a5d6a7' : colors.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={chipStyle(
            localShare?.running ? colors.green : colors.textMuted,
            localShare?.running ? colors.greenBg : '#ebebeb'
          )}>
            {localShare?.running ? '● 실행 중' : '○ 중지됨'}
          </span>
          {localShare?.running && (
            <>
              <span style={{ fontSize: 12, color: colors.textSub }}>{localShare.url}</span>
              <span style={{ fontSize: 11, color: colors.textMuted }}>
                링크 {localShare.activeLinkCount ?? activeLinks.length}개 활성
              </span>
            </>
          )}
        </div>
        {localShare?.running ? (
          <button
            style={{ padding: '6px 16px', fontSize: 12, fontWeight: 600, background: 'none', color: colors.red, border: `1px solid ${colors.red}`, borderRadius: 6, cursor: 'pointer', fontFamily }}
            onClick={handleStopAll}
          >
            서버 중지
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <button
              style={{
                padding: '6px 16px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 6, fontFamily,
                background: activeLinks.length === 0 ? '#c8cdd6' : colors.navy,
                color: activeLinks.length === 0 ? '#888' : '#fff',
                cursor: activeLinks.length === 0 ? 'not-allowed' : 'pointer',
                opacity: activeLinks.length === 0 ? 0.7 : 1,
              }}
              onClick={handleRestartServer}
              disabled={activeLinks.length === 0}
            >
              서버 실행
            </button>
            {activeLinks.length === 0 && (
              <span style={{ fontSize: 11, color: colors.textMuted }}>
                공유 링크를 먼저 생성하세요
              </span>
            )}
          </div>
        )}
      </div>

      {/* 활성 링크 테이블 */}
      <div style={cardStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>파일</th>
              <th style={thStyle}>저장소</th>
              <th style={thStyle}>만료</th>
              <th style={thStyle}>다운로드</th>
              <th style={thStyle}>옵션</th>
              <th style={thStyle}>작업</th>
            </tr>
          </thead>
          <tbody>
            {activeLinks.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ ...tdStyle, textAlign: 'center', color: colors.textMuted, padding: 40 }}>
                  활성 공유 링크가 없습니다.<br />
                  <span style={{ fontSize: 12 }}>위의 폼에서 파일 경로를 입력하고 서버를 실행하세요.</span>
                </td>
              </tr>
            ) : (
              activeLinks.map(link => (
                <tr
                  key={link.id}
                  style={{ cursor: 'pointer', background: selected?.id === link.id ? colors.blueBg : 'transparent' }}
                  onClick={() => setSelected(link)}
                >
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 500 }}>📄 {link.filePath.split(/[/\\]/).pop()}</div>
                    <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>{link.filePath}</div>
                  </td>
                  <td style={{ ...tdStyle, color: colors.textSub }}>{link.repoName ?? `저장소 ${link.repoId}`}</td>
                  <td style={{ ...tdStyle, color: colors.textSub, fontSize: 12 }}>
                    {link.expiresAt ? new Date(link.expiresAt).toLocaleString('ko-KR') : '설정 없음'}
                  </td>
                  <td style={{ ...tdStyle, color: colors.textSub }}>
                    {link.maxDownloads ? `${link.accessCount}/${link.maxDownloads}회` : `${link.accessCount}회`}
                  </td>
                  <td style={tdStyle}>
                    {link.hasPassword && <span title="비밀번호 보호" style={{ marginRight: 4 }}>🔒</span>}
                  </td>
                  <td style={tdStyle}>
                    <button
                      style={actionBtnStyle}
                      onClick={e => { e.stopPropagation(); handleCopyUrl(link) }}
                    >
                      {copiedId === link.id ? '복사됨!' : 'URL 복사'}
                    </button>
                    <button
                      style={{ ...actionBtnStyle, color: colors.red, borderColor: colors.red }}
                      onClick={e => { e.stopPropagation(); handleRevokeLink(link.id) }}
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )

  /* ── 공유받은 탭 (서버 전용) ── */
  const renderReceivedTab = () => {
    if (!connected) {
      return (
        <div style={{ ...tableAreaStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', color: colors.textMuted }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔌</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, color: colors.text }}>서버 연결이 필요합니다</div>
            <div style={{ fontSize: 13 }}>서버에 연결하면 다른 사용자가 공유한 파일을 볼 수 있습니다.</div>
          </div>
        </div>
      )
    }

    const pendingCount = receivedShares.filter(r => r.myStatus === 'pending').length

    return (
      <div style={tableAreaStyle}>
        {pendingCount > 0 && (
          <div style={{
            padding: '10px 16px', borderRadius: layout.radius, marginBottom: 16,
            background: '#fff8e1', border: '1px solid #ffe082',
            fontSize: 13, color: '#7c5d00',
          }}>
            <strong>수락 대기 중인 공유 {pendingCount}건</strong>이 있습니다. 아래에서 수락 또는 거절하세요.
          </div>
        )}
        <div style={cardStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>파일</th>
                <th style={thStyle}>공유자</th>
                <th style={thStyle}>권한</th>
                <th style={thStyle}>만료</th>
                <th style={thStyle}>상태</th>
                <th style={thStyle}>작업</th>
              </tr>
            </thead>
            <tbody>
              {receivedShares.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ ...tdStyle, textAlign: 'center', color: colors.textMuted, padding: 40 }}>
                    공유받은 파일이 없습니다.<br />
                    <span style={{ fontSize: 12 }}>다른 사용자가 파일을 공유하면 여기에 표시됩니다.</span>
                  </td>
                </tr>
              ) : (
                receivedShares.map(item => {
                  const statusChip = {
                    pending:  { label: '대기 중', color: '#7c5d00', bg: '#fff8e1' },
                    accepted: { label: '수락됨',  color: colors.green, bg: colors.greenBg },
                    rejected: { label: '거절됨',  color: colors.red,   bg: '#fdecea' },
                  }[item.myStatus]

                  return (
                    <tr key={item.id} style={{ opacity: item.myStatus === 'rejected' ? 0.55 : 1 }}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 500 }}>📄 {(item.filePath ?? '저장소 전체').split(/[/\\]/).pop()}</div>
                        {item.filePath && <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>{item.filePath}</div>}
                        <div style={{ fontSize: 11, color: colors.textMuted }}>저장소 {item.repoId}</div>
                      </td>
                      <td style={{ ...tdStyle, color: colors.textSub }}>
                        {item.ownerDisplayName ?? `사용자 ${item.ownerUserId}`}
                      </td>
                      <td style={tdStyle}>
                        <span style={chipStyle(item.permission === 'rw' ? colors.blue : colors.textSub, item.permission === 'rw' ? colors.blueBg : '#f5f5f5')}>
                          {item.permission === 'rw' ? '읽기+쓰기' : '읽기 전용'}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, color: colors.textSub, fontSize: 12 }}>
                        {item.expiresAt ? new Date(item.expiresAt).toLocaleString('ko-KR') : '영구'}
                      </td>
                      <td style={tdStyle}>
                        <span style={chipStyle(statusChip.color, statusChip.bg)}>{statusChip.label}</span>
                      </td>
                      <td style={tdStyle}>
                        {item.myStatus === 'pending' && (
                          <>
                            <button
                              style={{ ...actionBtnStyle, color: '#fff', background: colors.green, borderColor: colors.green }}
                              onClick={() => handleAcceptShare(item.id)}
                            >
                              수락
                            </button>
                            <button
                              style={{ ...actionBtnStyle, color: colors.red, borderColor: colors.red }}
                              onClick={() => handleRejectShare(item.id)}
                            >
                              거절
                            </button>
                          </>
                        )}
                        {item.myStatus === 'accepted' && (
                          <button
                            style={{ ...actionBtnStyle, color: colors.textSub }}
                            onClick={() => handleLeaveShare(item.id)}
                          >
                            공유 해제
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  /* ── 내가 공유 탭 (서버 공유) ── */
  const renderMineTab = () => {
    if (!connected) {
      return (
        <div style={{ ...tableAreaStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', color: colors.textMuted }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔌</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, color: colors.text }}>서버 연결이 필요합니다</div>
            <div style={{ fontSize: 13 }}>서버에 연결하면 내가 공유한 파일을 관리할 수 있습니다.</div>
          </div>
        </div>
      )
    }
    return (
      <div style={tableAreaStyle}>
        <div style={cardStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>파일</th>
                <th style={thStyle}>저장소</th>
                <th style={thStyle}>권한</th>
                <th style={thStyle}>만료</th>
                <th style={thStyle}>수신자</th>
                <th style={thStyle}>작업</th>
              </tr>
            </thead>
            <tbody>
              {sentShares.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ ...tdStyle, textAlign: 'center', color: colors.textMuted, padding: 40 }}>
                    서버 공유한 파일이 없습니다.<br />
                    <span style={{ fontSize: 12 }}>파일 목록에서 파일을 선택 → 공유 → 서버 공유로 공유하세요.</span>
                  </td>
                </tr>
              ) : (
                sentShares.map(item => (
                  <tr key={item.id}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 500 }}>📄 {(item.filePath ?? '저장소 전체').split(/[/\\]/).pop()}</div>
                      {item.filePath && <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>{item.filePath}</div>}
                    </td>
                    <td style={{ ...tdStyle, color: colors.textSub }}>{item.repoName ?? `저장소 ${item.repoId}`}</td>
                    <td style={tdStyle}>
                      <span style={chipStyle(item.permission === 'rw' ? colors.blue : colors.textSub, item.permission === 'rw' ? colors.blueBg : '#f5f5f5')}>
                        {item.permission === 'rw' ? '읽기+쓰기' : '읽기 전용'}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, color: colors.textSub, fontSize: 12 }}>
                      {item.expiresAt ? new Date(item.expiresAt).toLocaleString('ko-KR') : '영구'}
                    </td>
                    <td style={{ ...tdStyle, color: colors.textSub, fontSize: 12 }}>
                      {item.recipients?.map(r => r.displayName).join(', ') ?? '-'}
                    </td>
                    <td style={tdStyle}>
                      <button
                        style={{ ...actionBtnStyle, color: colors.red, borderColor: colors.red }}
                        onClick={() => handleRevokeServerShare(item.id)}
                      >
                        공유 취소
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  /* ── 우측 상세 패널 ── */
  const renderRightPanel = () => {
    if (!selected) {
      return (
        <div style={{ ...rightPanelStyle, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: colors.textMuted, textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📂</div>
          <div style={{ fontSize: 12 }}>링크를 선택하면<br />상세 정보가 표시됩니다</div>
        </div>
      )
    }

    return (
      <div style={rightPanelStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selected.filePath.split(/[/\\]/).pop() ?? '-'}
          </span>
          <button onClick={() => setSelected(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textMuted, fontSize: 16, padding: 2 }}>
            ✕
          </button>
        </div>

        {/* 읽기 전용 정보 */}
        <DetailRow label="파일" value={selected.filePath.split(/[/\\]/).pop() ?? '-'} />
        <DetailRow label="저장소" value={selected.repoName ?? `저장소 ${selected.repoId}`} />
        <DetailRow label="다운로드" value={selected.maxDownloads ? `${selected.accessCount} / ${selected.maxDownloads}회` : `${selected.accessCount}회`} />
        <DetailRow label="생성일" value={new Date(selected.createdAt).toLocaleString('ko-KR')} />

        {selected.downloadUrl && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: '#999', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>다운로드 URL</div>
            <div style={{ fontSize: 11, fontFamily: 'monospace', color: colors.blue, wordBreak: 'break-all', background: colors.blueBg, padding: '6px 8px', borderRadius: 4 }}>
              {selected.downloadUrl}
            </div>
          </div>
        )}

        {/* 편집 가능 섹션 */}
        <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 14, marginTop: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 12 }}>설정 수정</div>

          {/* 만료 일시 */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: colors.textMuted, display: 'block', marginBottom: 4 }}>
              만료 일시
            </label>
            <input
              type="datetime-local"
              value={editExpiresAt}
              onChange={e => setEditExpiresAt(e.target.value)}
              style={{ width: '100%', padding: '7px 8px', fontSize: 12, border: `1px solid ${colors.border}`, borderRadius: 5, outline: 'none', fontFamily, color: colors.text, background: '#fff', boxSizing: 'border-box' }}
            />
            <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 3 }}>
              현재: {selected.expiresAt ? new Date(selected.expiresAt).toLocaleString('ko-KR') : '설정 없음'}
            </div>
          </div>

          {/* 비밀번호 */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: colors.textMuted, display: 'block', marginBottom: 4 }}>
              비밀번호 {selected.hasPassword ? '(현재: 설정됨 🔒)' : '(현재: 없음)'}
            </label>
            <input
              type="password"
              value={editPassword}
              onChange={e => { setEditPassword(e.target.value); if (e.target.value) setClearPassword(false) }}
              disabled={clearPassword}
              placeholder={selected.hasPassword ? '새 비밀번호 입력 (변경)' : '비밀번호 설정'}
              style={{ width: '100%', padding: '7px 8px', fontSize: 12, border: `1px solid ${colors.border}`, borderRadius: 5, outline: 'none', fontFamily, color: colors.text, background: clearPassword ? '#f5f5f5' : '#fff', boxSizing: 'border-box', opacity: clearPassword ? 0.5 : 1 }}
            />
            {selected.hasPassword && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 11, color: colors.red, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={clearPassword}
                  onChange={e => { setClearPassword(e.target.checked); if (e.target.checked) setEditPassword('') }}
                />
                비밀번호 삭제
              </label>
            )}
          </div>

          {/* 피드백 */}
          {editError && <div style={{ fontSize: 11, color: colors.red, marginBottom: 8 }}>{editError}</div>}
          {editSuccess && <div style={{ fontSize: 11, color: colors.green, marginBottom: 8 }}>✓ 저장되었습니다.</div>}

          <button
            onClick={handleSaveLinkEdit}
            disabled={editSaving}
            style={{ width: '100%', padding: '7px 0', fontSize: 12, fontWeight: 600, background: editSaving ? '#9fa8b3' : colors.navy, color: '#fff', border: 'none', borderRadius: 6, cursor: editSaving ? 'not-allowed' : 'pointer', fontFamily, marginBottom: 6 }}
          >
            {editSaving ? '저장 중...' : '저장'}
          </button>
        </div>

        <div style={{ marginTop: 8 }}>
          <button
            style={{ ...actionBtnStyle, width: '100%', textAlign: 'center', marginBottom: 6 }}
            onClick={() => handleCopyUrl(selected)}
          >
            {copiedId === selected.id ? '✓ 복사됨' : 'URL 복사'}
          </button>
          <button
            style={{ ...actionBtnStyle, width: '100%', textAlign: 'center', color: colors.red, borderColor: colors.red }}
            onClick={() => handleRevokeLink(selected.id)}
          >
            링크 삭제
          </button>
        </div>
      </div>
    )
  }

  const pendingReceivedCount = receivedShares.filter(r => r.myStatus === 'pending').length
  const tabs: { key: Tab; label: string }[] = [
    { key: 'local', label: `로컬 공유${activeLinks.length > 0 ? ` (${activeLinks.length})` : ''}` },
    { key: 'received', label: connected
      ? `공유받은${receivedShares.length > 0 ? ` (${receivedShares.length}${pendingReceivedCount > 0 ? ` · 대기 ${pendingReceivedCount}` : ''})` : ''}`
      : '공유받은 🔌'
    },
    { key: 'mine', label: `내가 공유${connected ? (sentShares.length > 0 ? ` (${sentShares.length})` : '') : ' 🔌'}` },
  ]

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <h2 style={titleStyle}>공유 관리</h2>
        <div style={tabBarStyle}>
          {tabs.map(({ key, label }) => (
            <button key={key} style={tabStyle(tab === key)} onClick={() => { setTab(key); setSelected(null) }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={bodyStyle}>
        {tab === 'local' && renderLocalTab()}
        {tab === 'received' && renderReceivedTab()}
        {tab === 'mine' && renderMineTab()}
        {renderRightPanel()}
      </div>
    </div>
  )
}

function toDatetimeLocal(iso: string): string {
  try {
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch { return '' }
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, color: '#999', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: '#1a1a2e' }}>{value}</div>
    </div>
  )
}
