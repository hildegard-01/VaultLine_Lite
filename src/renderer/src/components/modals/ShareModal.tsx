import { useState, useEffect, type CSSProperties } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { invoke } from '@renderer/services/ipcClient'
import { FileIcon } from '@renderer/components/shared/FileIcon'
import { useMode } from '@renderer/hooks/useMode'
import { colors, fontFamily } from '@renderer/design/theme'
import type { FileEntry, ShareServerStatus, ServerUser, ServerShareItem } from '@shared/types/ipc'

interface ShareModalProps {
  file: FileEntry
  files?: FileEntry[]
  repoId: number
  onClose: () => void
}

type ModalTab = 'local' | 'server'

/* ── 스타일 상수 ── */
const overlay: CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
}
const modal: CSSProperties = {
  width: 560, maxHeight: '90vh', background: '#fff', borderRadius: 12,
  boxShadow: '0 8px 40px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column',
  fontFamily, overflow: 'hidden',
}
const header: CSSProperties = {
  padding: '14px 20px', borderBottom: `1px solid ${colors.border}`,
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
}
const tabBar: CSSProperties = {
  display: 'flex', borderBottom: `1px solid ${colors.border}`, flexShrink: 0,
}
const body: CSSProperties = { flex: 1, overflowY: 'auto', padding: '0 20px 20px' }
const footer: CSSProperties = {
  padding: '12px 20px', borderTop: `1px solid ${colors.border}`,
  display: 'flex', justifyContent: 'flex-end', flexShrink: 0, background: '#fafbfc',
}
const sectionRow: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12,
  padding: '14px 0', borderBottom: `1px solid ${colors.borderLight}`,
}
const btn = (color: string, bg: string, border: string): CSSProperties => ({
  padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 6,
  border: `1px solid ${border}`, background: bg, color, cursor: 'pointer',
  fontFamily, whiteSpace: 'nowrap', flexShrink: 0,
})
const inputStyle: CSSProperties = {
  width: '100%', padding: '7px 10px', fontSize: 12, borderRadius: 6,
  border: `1px solid ${colors.border}`, fontFamily, boxSizing: 'border-box',
}
const labelStyle: CSSProperties = { fontSize: 11, color: colors.textMuted, display: 'block', marginBottom: 4 }

export function ShareModal({ file, files, repoId, onClose }: ShareModalProps) {
  const shareFiles = files && files.length > 0 ? files : [file]
  const isMulti = shareFiles.length > 1
  const { connected } = useMode()
  const qc = useQueryClient()

  const [activeTab, setActiveTab] = useState<ModalTab>('local')
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const showMsg = (type: 'success' | 'error', text: string) => {
    setMsg({ type, text })
    setTimeout(() => setMsg(null), 3500)
  }

  /* ── 로컬 공유 상태 ── */
  const [localStatus, setLocalStatus] = useState<ShareServerStatus>({ running: false })
  const [localLoading, setLocalLoading] = useState(false)
  const [showLocalOpts, setShowLocalOpts] = useState(false)
  const [password, setPassword] = useState('')
  const [maxDownloads, setMaxDownloads] = useState<number | ''>('')
  const [port, setPort] = useState<number | ''>(9090)

  /* ── 서버 공유 상태 ── */
  const [serverUsers, setServerUsers] = useState<ServerUser[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [sharePermission, setSharePermission] = useState<'r' | 'rw'>('r')
  const [shareExpires, setShareExpires] = useState('')
  const [shareLoading, setShareLoading] = useState(false)
  const [recipientSearch, setRecipientSearch] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())

  /* ── 이 파일의 서버 공유 목록 ── */
  const { data: allSentShares, refetch: refetchSent } = useQuery({
    queryKey: ['server:share-list'],
    queryFn: () => invoke('server:share-list' as any) as Promise<{ sent: ServerShareItem[]; received: ServerShareItem[] }>,
    enabled: connected && activeTab === 'server',
  })
  const fileShares: ServerShareItem[] = (allSentShares?.sent ?? []).filter(
    s => s.repoId === repoId && s.filePath === file.path
  )
  const filteredFileShares = recipientSearch
    ? fileShares.filter(s =>
        s.recipients?.some(r =>
          r.displayName.toLowerCase().includes(recipientSearch.toLowerCase()) ||
          r.username.toLowerCase().includes(recipientSearch.toLowerCase())
        )
      )
    : fileShares

  /* 서버 탭 진입 시 사용자 목록 로드 */
  useEffect(() => {
    if (activeTab === 'server' && connected && serverUsers.length === 0) {
      setUsersLoading(true)
      invoke('server:user-list' as any)
        .then((users: any) => setServerUsers(users ?? []))
        .catch(() => { /* 무시 */ })
        .finally(() => setUsersLoading(false))
    }
  }, [activeTab, connected])

  const filteredUsers = userSearch
    ? serverUsers.filter(u =>
        u.displayName.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.username.toLowerCase().includes(userSearch.toLowerCase())
      )
    : serverUsers

  /* ── 로컬 공유 핸들러 ── */
  const handleExport = async () => {
    setLocalLoading(true)
    try {
      if (isMulti) {
        const result = await invoke('share:export', { repoId, path: shareFiles[0].path, paths: shareFiles.map(f => f.path) } as any)
        showMsg('success', `ZIP 저장 완료: ${result.exportPath.split(/[/\\]/).pop()}`)
      } else {
        const result = await invoke('share:export', { repoId, path: file.path })
        showMsg('success', `ZIP 저장 완료: ${result.exportPath.split(/[/\\]/).pop()}`)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '내보내기 실패'
      if (!msg.includes('취소')) showMsg('error', msg)
    } finally {
      setLocalLoading(false)
    }
  }

  const handleToggleLocalLink = async () => {
    setLocalLoading(true)
    try {
      if (localStatus.running && localStatus.newLink) {
        await invoke('share:revoke' as any, { id: localStatus.newLink.id })
        setLocalStatus({ running: false })
        showMsg('success', '링크가 삭제되었습니다.')
      } else {
        const status = await invoke('share:start-server', {
          repoId, path: file.path,
          paths: isMulti ? shareFiles.map(f => f.path) : undefined,
          password: password || undefined,
          maxDownloads: maxDownloads ? Number(maxDownloads) : undefined,
          port: port ? Number(port) : undefined,
        } as any)
        setLocalStatus(status)
        showMsg('success', '링크가 생성되었습니다.')
      }
    } catch (e) {
      showMsg('error', e instanceof Error ? e.message : '서버 오류')
    } finally {
      setLocalLoading(false)
    }
  }

  /* ── 서버 공유 핸들러 ── */
  const handleCreateServerShare = async () => {
    if (selectedIds.length === 0) { showMsg('error', '공유할 사용자를 선택하세요.'); return }
    setShareLoading(true)
    try {
      await invoke('server:share-create' as any, {
        repoId, filePath: file.path,
        recipientIds: selectedIds,
        permission: sharePermission,
        expiresAt: shareExpires || undefined,
      })
      showMsg('success', `${selectedIds.length}명에게 공유되었습니다.`)
      setSelectedIds([])
      setUserSearch('')
      setShareExpires('')
      qc.invalidateQueries({ queryKey: ['server:share-list'] })
      refetchSent()
    } catch (e) {
      showMsg('error', e instanceof Error ? e.message : '공유 실패')
    } finally {
      setShareLoading(false)
    }
  }

  const handleRevoke = async (shareId: number) => {
    if (!window.confirm('이 공유를 삭제하시겠습니까?')) return
    try {
      await invoke('server:share-revoke' as any, { id: shareId })
      qc.invalidateQueries({ queryKey: ['server:share-list'] })
      refetchSent()
    } catch (e) {
      showMsg('error', e instanceof Error ? e.message : '삭제 실패')
    }
  }

  const toggleExpand = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
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

  const statusBadge = (status: 'pending' | 'accepted' | 'rejected'): CSSProperties => ({
    fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 8,
    background: status === 'accepted' ? colors.greenBg : status === 'rejected' ? colors.redBg : '#f0f0f0',
    color: status === 'accepted' ? colors.green : status === 'rejected' ? colors.red : colors.textMuted,
  })

  return (
    <div style={overlay} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={modal}>
        {/* 헤더 */}
        <div style={header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileIcon type={file.type} name={file.name} size={16} />
            <span style={{ fontSize: 14, fontWeight: 700, color: colors.text }}>
              {isMulti ? `${shareFiles.length}개 파일 공유` : file.name}
            </span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textMuted, fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>

        {/* 탭 */}
        <div style={tabBar}>
          <button style={tabStyle(activeTab === 'local')} onClick={() => setActiveTab('local')}>로컬 공유</button>
          <button style={tabStyle(activeTab === 'server')} onClick={() => setActiveTab('server')}>
            서버 공유 {connected ? '' : '(오프라인)'}
          </button>
        </div>

        {/* 알림 */}
        {msg && (
          <div style={{
            margin: '12px 20px 0', padding: '8px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
            background: msg.type === 'success' ? colors.greenBg : colors.redBg,
            color: msg.type === 'success' ? colors.green : colors.red,
          }}>{msg.text}</div>
        )}

        {/* 탭 본문 */}
        <div style={body}>

          {/* ══════════ 로컬 공유 탭 ══════════ */}
          {activeTab === 'local' && (
            <>
              {/* 내보내기 */}
              <div style={sectionRow}>
                <div style={{ fontSize: 24, width: 36, textAlign: 'center', flexShrink: 0 }}>📦</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>내보내기 패키지</div>
                  <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>ZIP으로 묶어 로컬에 저장</div>
                </div>
                <button onClick={handleExport} disabled={localLoading} style={btn('#6A1B9A', '#EDE7F6', '#6A1B9A40')}>
                  {localLoading ? '생성 중…' : '생성'}
                </button>
              </div>

              {/* 임시 링크 */}
              <div style={{ paddingTop: 14 }}>
                <div style={sectionRow}>
                  <div style={{ fontSize: 24, width: 36, textAlign: 'center', flexShrink: 0 }}>🔗</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>임시 링크 공유</div>
                    <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
                      {localStatus.running && localStatus.newLink
                        ? `${localStatus.url} · 만료 ${localStatus.newLink.expiresAt ? new Date(localStatus.newLink.expiresAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '없음'}`
                        : '같은 네트워크에서 접근 가능한 다운로드 링크 (60분)'}
                    </div>
                  </div>
                  <button
                    onClick={handleToggleLocalLink}
                    disabled={localLoading}
                    style={btn(
                      localStatus.running ? colors.red : colors.blue,
                      localStatus.running ? colors.redBg : colors.blueBg,
                      localStatus.running ? colors.red + '40' : colors.blue + '40'
                    )}
                  >
                    {localLoading ? '처리 중…' : localStatus.running ? '링크 삭제' : '링크 생성'}
                  </button>
                </div>

                {/* 링크 옵션 */}
                {!localStatus.running && (
                  <div style={{ marginLeft: 48 }}>
                    <button
                      onClick={() => setShowLocalOpts(v => !v)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: colors.textMuted, padding: '4px 0' }}
                    >
                      {showLocalOpts ? '▾' : '▸'} 링크 옵션 (비밀번호, 횟수 제한, 포트)
                    </button>
                    {showLocalOpts && (
                      <div style={{ marginTop: 8, padding: 12, background: colors.bg, borderRadius: 6, border: `1px solid ${colors.border}` }}>
                        <label style={labelStyle}>비밀번호 (선택)</label>
                        <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="미입력 시 공개" style={{ ...inputStyle, marginBottom: 8 }} />
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <div>
                            <label style={labelStyle}>다운로드 횟수 제한</label>
                            <input type="number" min={1} value={maxDownloads} onChange={e => setMaxDownloads(e.target.value === '' ? '' : Number(e.target.value))} placeholder="제한 없음" style={inputStyle} />
                          </div>
                          <div>
                            <label style={labelStyle}>포트</label>
                            <input type="number" min={1024} max={65535} value={port} onChange={e => setPort(e.target.value === '' ? '' : Number(e.target.value))} placeholder="9090" style={inputStyle} />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 생성된 링크 */}
                {localStatus.running && localStatus.newLink && (
                  <div style={{ marginLeft: 48, marginTop: 8, padding: 10, background: colors.blueBg, borderRadius: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: colors.blue, fontWeight: 600 }}>
                        다운로드 링크
                        {localStatus.newLink.hasPassword && <span style={{ marginLeft: 6, color: colors.orange }}>🔒</span>}
                      </span>
                      <button
                        onClick={async () => {
                          await navigator.clipboard.writeText(localStatus.newLink!.downloadUrl)
                          showMsg('success', 'URL이 클립보드에 복사되었습니다.')
                        }}
                        style={btn(colors.blue, '#fff', colors.blue + '40')}
                      >복사</button>
                    </div>
                    <div style={{ fontSize: 12, fontFamily: 'monospace', color: colors.navy, wordBreak: 'break-all', userSelect: 'all' }}>
                      {localStatus.newLink.downloadUrl}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ══════════ 서버 공유 탭 ══════════ */}
          {activeTab === 'server' && !connected && (
            <div style={{ padding: '40px 0', textAlign: 'center', color: colors.textMuted }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🔌</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: colors.text, marginBottom: 6 }}>서버 연결이 필요합니다</div>
              <div style={{ fontSize: 12 }}>서버에 연결하면 팀원에게 파일 접근 권한을 부여할 수 있습니다.</div>
            </div>
          )}

          {activeTab === 'server' && connected && (
            <>
              {/* 공유 추가 */}
              <div style={{ paddingTop: 16, paddingBottom: 16, borderBottom: `1px solid ${colors.border}` }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: colors.navy, marginBottom: 10 }}>+ 공유 추가</div>

                {/* 사용자 검색 */}
                <label style={labelStyle}>공유 대상 검색</label>
                <input
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  placeholder="이름 또는 아이디 검색"
                  style={{ ...inputStyle, marginBottom: 6 }}
                />

                {/* 체크박스 사용자 목록 */}
                <div style={{ maxHeight: 120, overflowY: 'auto', border: `1px solid ${colors.border}`, borderRadius: 6, marginBottom: 8 }}>
                  {usersLoading ? (
                    <div style={{ padding: 12, fontSize: 12, color: colors.textMuted }}>사용자 목록 불러오는 중…</div>
                  ) : filteredUsers.length === 0 ? (
                    <div style={{ padding: 12, fontSize: 12, color: colors.textMuted }}>
                      {userSearch ? '검색 결과가 없습니다.' : '공유 가능한 사용자가 없습니다.'}
                    </div>
                  ) : (
                    filteredUsers.map(u => (
                      <label key={u.id} style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                        cursor: 'pointer', borderBottom: `1px solid ${colors.borderLight}`,
                        background: selectedIds.includes(u.id) ? colors.blueBg : 'transparent',
                      }}>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(u.id)}
                          onChange={() => setSelectedIds(prev =>
                            prev.includes(u.id) ? prev.filter(id => id !== u.id) : [...prev, u.id]
                          )}
                          style={{ accentColor: colors.navy }}
                        />
                        <span style={{ fontSize: 12, fontWeight: 500 }}>{u.displayName}</span>
                        <span style={{ fontSize: 11, color: colors.textMuted }}>@{u.username}</span>
                        {u.isOnline && <span style={{ width: 6, height: 6, borderRadius: '50%', background: colors.green, marginLeft: 'auto' }} />}
                      </label>
                    ))
                  )}
                </div>

                {selectedIds.length > 0 && (
                  <div style={{ fontSize: 11, color: colors.blue, marginBottom: 8 }}>
                    {selectedIds.length}명 선택됨
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                  {/* 권한 */}
                  <div>
                    <label style={labelStyle}>권한</label>
                    <div style={{ display: 'flex', gap: 12 }}>
                      {(['r', 'rw'] as const).map(p => (
                        <label key={p} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
                          <input type="radio" value={p} checked={sharePermission === p} onChange={() => setSharePermission(p)} />
                          {p === 'r' ? '읽기 전용' : '읽기+쓰기'}
                        </label>
                      ))}
                    </div>
                  </div>
                  {/* 만료일 */}
                  <div>
                    <label style={labelStyle}>만료일 (선택, 미입력 시 영구)</label>
                    <input type="datetime-local" value={shareExpires} onChange={e => setShareExpires(e.target.value)} style={inputStyle} />
                  </div>
                </div>

                <button
                  onClick={handleCreateServerShare}
                  disabled={shareLoading || selectedIds.length === 0}
                  style={{
                    ...btn('#fff', selectedIds.length === 0 ? '#aaa' : colors.navy, 'transparent'),
                    width: '100%', opacity: selectedIds.length === 0 ? 0.5 : 1,
                    cursor: selectedIds.length === 0 ? 'not-allowed' : 'pointer',
                  }}
                >
                  {shareLoading ? '공유 중…' : selectedIds.length > 0 ? `${selectedIds.length}명에게 공유하기` : '대상을 선택하세요'}
                </button>
              </div>

              {/* 이 파일의 현재 공유 목록 */}
              <div style={{ paddingTop: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: colors.navy }}>
                    현재 공유 목록 {fileShares.length > 0 && <span style={{ color: colors.textMuted, fontWeight: 400 }}>({fileShares.length}건)</span>}
                  </div>
                  {fileShares.length > 0 && (
                    <input
                      value={recipientSearch}
                      onChange={e => setRecipientSearch(e.target.value)}
                      placeholder="수신자 검색"
                      style={{ ...inputStyle, width: 180 }}
                    />
                  )}
                </div>

                {fileShares.length === 0 ? (
                  <div style={{ padding: '20px 0', textAlign: 'center', color: colors.textMuted, fontSize: 12 }}>
                    이 파일에 대한 서버 공유가 없습니다.
                  </div>
                ) : filteredFileShares.length === 0 ? (
                  <div style={{ padding: '20px 0', textAlign: 'center', color: colors.textMuted, fontSize: 12 }}>
                    검색 결과가 없습니다.
                  </div>
                ) : (
                  <div style={{ border: `1px solid ${colors.border}`, borderRadius: 6, overflow: 'hidden' }}>
                    {filteredFileShares.map((share, idx) => {
                      const recs = share.recipients ?? []
                      const isExpanded = expandedIds.has(share.id)
                      const visibleRecs = isExpanded ? recs : recs.slice(0, 2)
                      const hiddenCount = recs.length - 2

                      return (
                        <div key={share.id} style={{ borderBottom: idx < filteredFileShares.length - 1 ? `1px solid ${colors.borderLight}` : 'none' }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px' }}>
                            {/* 수신자 */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {visibleRecs.map(r => (
                                  <span key={r.userId} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                                    <span style={{ fontWeight: 500 }}>{r.displayName}</span>
                                    <span style={statusBadge(r.status)}>
                                      {r.status === 'accepted' ? '수락' : r.status === 'rejected' ? '거절' : '대기'}
                                    </span>
                                  </span>
                                ))}
                                {!isExpanded && hiddenCount > 0 && (
                                  <button
                                    onClick={() => toggleExpand(share.id)}
                                    style={{ fontSize: 11, color: colors.blue, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                                  >
                                    +{hiddenCount}명 더보기
                                  </button>
                                )}
                                {isExpanded && recs.length > 2 && (
                                  <button
                                    onClick={() => toggleExpand(share.id)}
                                    style={{ fontSize: 11, color: colors.textMuted, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                                  >
                                    접기
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* 권한 */}
                            <span style={{
                              fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 8, flexShrink: 0,
                              background: share.permission === 'rw' ? colors.blueBg : '#f0f0f0',
                              color: share.permission === 'rw' ? colors.blue : colors.textSub,
                            }}>
                              {share.permission === 'rw' ? '읽기+쓰기' : '읽기 전용'}
                            </span>

                            {/* 만료 */}
                            <span style={{ fontSize: 11, color: share.expiresAt ? colors.orange : colors.textMuted, flexShrink: 0, minWidth: 48, textAlign: 'right' }}>
                              {share.expiresAt ? new Date(share.expiresAt).toLocaleDateString('ko-KR') : '영구'}
                            </span>

                            {/* 취소 버튼 */}
                            <button
                              onClick={() => handleRevoke(share.id)}
                              style={{ ...btn(colors.red, 'transparent', colors.red + '40'), padding: '4px 10px', fontSize: 11 }}
                            >
                              취소
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* 푸터 */}
        <div style={footer}>
          <button onClick={onClose} style={btn(colors.textSub, '#fff', colors.border)}>닫기</button>
        </div>
      </div>
    </div>
  )
}
