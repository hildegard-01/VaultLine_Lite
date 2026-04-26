import { useState, useMemo, type CSSProperties, type ReactNode } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { invoke } from '@renderer/services/ipcClient'
import { colors, fontFamily } from '@renderer/design/theme'
import type { RemoteRepo, RemoteFileEntry } from '@shared/types/ipc'

type SvnFileStatus = 'clean' | 'modified' | 'added' | 'deleted' | 'conflicted' | 'unversioned' | 'missing'

interface SvnVerboseEntry {
  path: string
  status: string
  revision: number
}

interface WcStatusEntry extends SvnVerboseEntry {
  repoId: number
}

interface CombinedFile extends RemoteFileEntry {
  repoId: number
}

function formatSize(bytes: number): string {
  if (!bytes || bytes === 0) return '-'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

function formatDate(iso?: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function fileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf') return '📄'
  if (['docx', 'doc', 'hwp', 'hwpx'].includes(ext)) return '📝'
  if (['xlsx', 'xls', 'csv'].includes(ext)) return '📊'
  if (['pptx', 'ppt'].includes(ext)) return '📑'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return '🖼️'
  if (['zip', 'tar', 'gz', '7z'].includes(ext)) return '📦'
  if (['md', 'txt'].includes(ext)) return '📃'
  return '📄'
}

function getExt(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i + 1).toUpperCase() : '파일'
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ background: colors.bgPrimary, border: `1px solid ${colors.border}`, borderRadius: 6, padding: 12, marginBottom: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  )
}

function MetaRow({ label, value, valueStyle }: { label: string; value: string; valueStyle?: CSSProperties }) {
  return (
    <div style={{ fontSize: 11, color: colors.textSub, marginBottom: 4, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ flexShrink: 0 }}>{label}</span>
      <span style={{ color: colors.text, textAlign: 'right', wordBreak: 'break-all', ...valueStyle }}>{value}</span>
    </div>
  )
}

export default function SharedFilesPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const repoId = Number(id)
  const [subPath, setSubPath] = useState('')
  const [selectedFile, setSelectedFile] = useState<CombinedFile | null>(null)
  const [openingFile, setOpeningFile] = useState(false)
  const [commitMsg, setCommitMsg] = useState('')
  const [showCommitInput, setShowCommitInput] = useState(false)
  const [showBatchCommit, setShowBatchCommit] = useState(false)
  const [batchCommitMsg, setBatchCommitMsg] = useState('')

  const { data: remoteRepos = [] } = useQuery<RemoteRepo[]>({
    queryKey: ['remote-repo:list'],
    queryFn: () => invoke('remote-repo:list'),
  })

  const anchorRepo = (remoteRepos as RemoteRepo[]).find(r => r.id === repoId)

  const ownerRepos = useMemo<RemoteRepo[]>(() => {
    if (!anchorRepo) return []
    if (!anchorRepo.ownerName) return [anchorRepo]
    return (remoteRepos as RemoteRepo[]).filter(r => r.ownerName === anchorRepo.ownerName)
  }, [remoteRepos, anchorRepo])

  const rwOwnerRepos = useMemo(() => ownerRepos.filter(r => r.permission === 'rw'), [ownerRepos])

  const fileRepo = useMemo(() =>
    selectedFile ? ownerRepos.find(r => r.id === selectedFile.repoId) ?? null : null,
    [selectedFile, ownerRepos]
  )
  const filePermission = fileRepo?.permission ?? 'r'

  // 파일 통합 목록
  const { data: files = [], isLoading, error, refetch } = useQuery<CombinedFile[]>({
    queryKey: ['remote-repo:files-combined', ownerRepos.map(r => r.id), subPath],
    queryFn: async () => {
      const results: CombinedFile[] = []
      for (const repo of ownerRepos) {
        try {
          const repoFiles = await invoke('remote-repo:file-list', { id: repo.id, subPath: subPath || undefined }) as RemoteFileEntry[]
          results.push(...repoFiles.map(f => ({ ...f, repoId: repo.id })))
        } catch { /* 접근 불가 저장소 무시 */ }
      }
      return results
    },
    enabled: ownerRepos.length > 0,
  })

  // 선택 파일 SVN 정보
  const { data: fileInfo } = useQuery({
    queryKey: ['remote-repo:file-info', selectedFile?.repoId, selectedFile?.path],
    queryFn: () => invoke('remote-repo:file-info' as any, { id: selectedFile!.repoId, filePath: selectedFile!.path }),
    enabled: !!selectedFile && selectedFile.type === 'file',
    retry: false,
  })

  // 선택 rw 파일 수정 상태 (3초)
  const { data: fileStatusData, refetch: refetchStatus } = useQuery({
    queryKey: ['remote-repo:file-status', selectedFile?.repoId, selectedFile?.path],
    queryFn: () => invoke('remote-repo:file-status' as any, { id: selectedFile!.repoId, filePath: selectedFile!.path }),
    enabled: !!selectedFile && selectedFile.type === 'file' && filePermission === 'rw',
    refetchInterval: 3000,
    retry: false,
  })
  const fileStatus = (fileStatusData as any)?.status as SvnFileStatus ?? 'clean'
  const isModified = fileStatus === 'modified' || fileStatus === 'added'

  // WC 전체 상태+리비전 (rw 저장소, 5초)
  const { data: allWcStatus = [] } = useQuery<WcStatusEntry[]>({
    queryKey: ['remote-repo:wc-status-all', rwOwnerRepos.map(r => r.id)],
    queryFn: async () => {
      const results: WcStatusEntry[] = []
      for (const repo of rwOwnerRepos) {
        try {
          const entries = await invoke('remote-repo:wc-status' as any, { id: repo.id }) as SvnVerboseEntry[]
          results.push(...entries.map(e => ({ ...e, repoId: repo.id })))
        } catch { /* 무시 */ }
      }
      return results
    },
    enabled: rwOwnerRepos.length > 0,
    refetchInterval: rwOwnerRepos.length > 0 ? 5000 : false,
    retry: false,
  })

  const wcStatusMap = useMemo(() => {
    const map = new Map<string, { status: string; revision: number }>()
    for (const e of allWcStatus) {
      map.set(`${e.repoId}:${e.path.replace(/\\/g, '/')}`, { status: e.status, revision: e.revision })
    }
    return map
  }, [allWcStatus])

  const modifiedFiles = useMemo(() =>
    allWcStatus.filter(e => e.status === 'modified' || e.status === 'added' || e.status === 'deleted'),
    [allWcStatus]
  )

  // ── 뮤테이션 ──

  const commitMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile) return
      await invoke('remote-repo:file-commit' as any, { id: selectedFile.repoId, filePath: selectedFile.path, message: commitMsg })
    },
    onSuccess: () => {
      setShowCommitInput(false)
      setCommitMsg('')
      queryClient.invalidateQueries({ queryKey: ['remote-repo:file-status', selectedFile?.repoId, selectedFile?.path] })
      queryClient.invalidateQueries({ queryKey: ['remote-repo:file-info', selectedFile?.repoId, selectedFile?.path] })
      queryClient.invalidateQueries({ queryKey: ['remote-repo:files-combined'] })
      queryClient.invalidateQueries({ queryKey: ['remote-repo:wc-status-all'] })
      refetchStatus()
    },
    onError: (err) => alert(err instanceof Error ? err.message : '커밋 실패'),
  })

  const revertMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile) return
      await invoke('remote-repo:file-revert' as any, { id: selectedFile.repoId, filePath: selectedFile.path })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remote-repo:file-status', selectedFile?.repoId, selectedFile?.path] })
      queryClient.invalidateQueries({ queryKey: ['remote-repo:files-combined'] })
      queryClient.invalidateQueries({ queryKey: ['remote-repo:wc-status-all'] })
      refetchStatus()
    },
    onError: (err) => alert(err instanceof Error ? err.message : '폐기 실패'),
  })

  const batchCommitMutation = useMutation({
    mutationFn: async () => {
      const repoIds = [...new Set(modifiedFiles.map(f => f.repoId))]
      for (const rid of repoIds) {
        await invoke('remote-repo:batch-commit' as any, { id: rid, message: batchCommitMsg })
      }
    },
    onSuccess: () => {
      setShowBatchCommit(false)
      setBatchCommitMsg('')
      queryClient.invalidateQueries({ queryKey: ['remote-repo:wc-status-all'] })
      queryClient.invalidateQueries({ queryKey: ['remote-repo:files-combined'] })
      queryClient.invalidateQueries({ queryKey: ['remote-repo:file-status'] })
      queryClient.invalidateQueries({ queryKey: ['remote-repo:file-info'] })
    },
    onError: (err) => alert(err instanceof Error ? err.message : '일괄 커밋 실패'),
  })

  const batchRevertMutation = useMutation({
    mutationFn: async () => {
      const repoIds = [...new Set(modifiedFiles.map(f => f.repoId))]
      for (const rid of repoIds) {
        await invoke('remote-repo:batch-revert' as any, { id: rid })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remote-repo:wc-status-all'] })
      queryClient.invalidateQueries({ queryKey: ['remote-repo:files-combined'] })
      queryClient.invalidateQueries({ queryKey: ['remote-repo:file-status'] })
    },
    onError: (err) => alert(err instanceof Error ? err.message : '전체 폐기 실패'),
  })

  const uploadMutation = useMutation({
    mutationFn: () => {
      if (!selectedFile) throw new Error('파일이 선택되지 않았습니다.')
      return invoke('remote-repo:file-upload' as any, {
        id: selectedFile.repoId, filePath: selectedFile.path, message: '새 버전 업로드',
      })
    },
    onSuccess: (result) => {
      if (!result) return // 다이얼로그 취소
      queryClient.invalidateQueries({ queryKey: ['remote-repo:file-info', selectedFile?.repoId, selectedFile?.path] })
      queryClient.invalidateQueries({ queryKey: ['remote-repo:files-combined'] })
      queryClient.invalidateQueries({ queryKey: ['remote-repo:wc-status-all'] })
    },
    onError: (err) => alert(err instanceof Error ? err.message : '업로드 실패'),
  })

  const syncMutation = useMutation({
    mutationFn: async () => {
      for (const repo of ownerRepos) await invoke('remote-repo:sync', { id: repo.id })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remote-repo:files-combined'] })
      queryClient.invalidateQueries({ queryKey: ['remote-repo:list'] })
      queryClient.invalidateQueries({ queryKey: ['all-files:shared'] })
      queryClient.invalidateQueries({ queryKey: ['remote-repo:wc-status-all'] })
    },
    onError: (err) => alert(err instanceof Error ? err.message : '동기화 실패'),
  })

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      for (const repo of ownerRepos) await invoke('remote-repo:disconnect', { id: repo.id })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remote-repo:list'] })
      queryClient.invalidateQueries({ queryKey: ['all-files:shared'] })
      navigate('/')
    },
    onError: (err) => alert(err instanceof Error ? err.message : '공유 해제 실패'),
  })

  // ── 핸들러 ──

  const handleRevert = () => {
    if (!window.confirm('변경 사항을 폐기하고 마지막 커밋 상태로 되돌리시겠습니까?')) return
    revertMutation.mutate()
  }

  const handleBatchRevert = () => {
    if (!window.confirm(`${modifiedFiles.length}개 파일의 변경 사항을 모두 폐기하시겠습니까?`)) return
    batchRevertMutation.mutate()
  }

  const handleDisconnect = () => {
    if (!window.confirm(`"${anchorRepo?.ownerName ?? '이 공유'}"의 공유를 모두 해제하시겠습니까?`)) return
    disconnectMutation.mutate()
  }

  const handleOpenFile = async (f: CombinedFile) => {
    setOpeningFile(true)
    try {
      await invoke('remote-repo:file-open' as any, { id: f.repoId, filePath: f.path })
    } catch (e) {
      alert(e instanceof Error ? e.message : '파일 열기 실패')
    } finally {
      setOpeningFile(false)
    }
  }

  const handleFileClick = (f: CombinedFile) => {
    if (f.type === 'dir') {
      setSubPath(f.path)
      setSelectedFile(null)
    } else {
      setSelectedFile(prev => prev?.path === f.path && prev.repoId === f.repoId ? null : f)
    }
  }

  const handleFileDoubleClick = (f: CombinedFile) => {
    if (f.type === 'file') handleOpenFile(f)
  }

  const pathParts = subPath ? subPath.split('/').filter(Boolean) : []
  const ownerName = anchorRepo?.ownerName ?? anchorRepo?.displayName ?? '알 수 없음'
  const permission = anchorRepo?.permission ?? 'r'
  const totalFiles = (files as CombinedFile[]).filter(f => f.type === 'file').length
  const lastSynced = ownerRepos.map(r => r.lastSynced).filter(Boolean).sort().pop()
  const hasDirNavigation = ownerRepos.some(r => !r.filePath)

  // ── 스타일 ──
  const thStyle: CSSProperties = {
    padding: '9px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600,
    color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.4px',
    borderBottom: `1px solid ${colors.border}`, background: '#fafbfc', userSelect: 'none',
  }
  const syncBtnStyle: CSSProperties = {
    padding: '6px 14px', background: '#4ECDC4', color: '#fff', border: 'none',
    borderRadius: 6, cursor: syncMutation.isPending ? 'not-allowed' : 'pointer',
    fontSize: 12, fontWeight: 600, opacity: syncMutation.isPending ? 0.7 : 1, fontFamily,
  }
  const actionBtn = (variant: 'default' | 'danger', disabled = false): CSSProperties => ({
    padding: '7px 0', borderRadius: 4, cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 12, fontWeight: 600, width: '100%', fontFamily, marginBottom: 6,
    display: 'block', opacity: disabled ? 0.7 : 1, background: 'none',
    color: variant === 'danger' ? colors.red : colors.textSub,
    border: variant === 'danger' ? `1px solid ${colors.redBg}` : `1px solid ${colors.border}`,
  })

  if (!anchorRepo) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: colors.bgSecondary, color: colors.textMuted, fontSize: 14, fontFamily }}>
        저장소를 찾을 수 없습니다.
        <button style={{ marginTop: 12, padding: '8px 16px', background: colors.navy, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }} onClick={() => navigate('/')}>홈으로</button>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: colors.bgSecondary, overflow: 'hidden', fontFamily }}>

      {/* 헤더 */}
      <div style={{ padding: '14px 20px 12px', borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: colors.bgPrimary }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: colors.text, marginBottom: 2 }}>
            {ownerName}의 공유
            {ownerRepos.length > 1 && <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 400, color: colors.textMuted }}>({ownerRepos.length}개 파일)</span>}
          </div>
          <div style={{ fontSize: 12, color: colors.textMuted, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ background: permission === 'rw' ? '#e8f5e9' : '#e3f2fd', color: permission === 'rw' ? '#2e7d32' : '#1565c0', padding: '1px 7px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
              {permission === 'rw' ? '읽기/쓰기' : '읽기 전용'}
            </span>
            {lastSynced && <span>동기화: {formatDate(lastSynced)}</span>}
          </div>
        </div>
        <button style={syncBtnStyle} onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
          {syncMutation.isPending ? '동기화 중...' : '↻ 동기화'}
        </button>
      </div>

      {/* 브레드크럼 */}
      {hasDirNavigation && (
        <div style={{ padding: '7px 20px', borderBottom: `1px solid ${colors.border}`, background: colors.bgPrimary }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: colors.textSub, flexWrap: 'wrap' }}>
            <button style={{ background: 'none', border: 'none', cursor: pathParts.length === 0 ? 'default' : 'pointer', color: pathParts.length === 0 ? colors.text : colors.blue, fontSize: 13, padding: '2px 4px', fontFamily, fontWeight: pathParts.length === 0 ? 600 : 400 }}
              onClick={() => { setSubPath(''); setSelectedFile(null) }}>루트</button>
            {pathParts.map((part, i) => (
              <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: colors.textMuted }}>/</span>
                <button style={{ background: 'none', border: 'none', cursor: i === pathParts.length - 1 ? 'default' : 'pointer', color: i === pathParts.length - 1 ? colors.text : colors.blue, fontSize: 13, padding: '2px 4px', fontFamily, fontWeight: i === pathParts.length - 1 ? 600 : 400 }}
                  onClick={() => { setSubPath(pathParts.slice(0, i + 1).join('/')); setSelectedFile(null) }}>{part}</button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 본문 */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* 파일 테이블 영역 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* 변경 현황 바 */}
          {modifiedFiles.length > 0 && !showBatchCommit && (
            <div style={{ padding: '7px 16px', display: 'flex', alignItems: 'center', gap: 12, background: '#fff8e1', borderBottom: `1px solid #ffe082`, fontSize: 12, flexShrink: 0 }}>
              <span style={{ color: '#7c5d00', fontWeight: 600 }}>🟠 {modifiedFiles.length}개 변경됨</span>
              <button
                style={{ padding: '4px 12px', background: colors.navy, color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily }}
                onClick={() => { setBatchCommitMsg(''); setShowBatchCommit(true) }}
              >일괄 커밋</button>
              <button
                style={{ padding: '4px 12px', background: 'none', color: colors.red, border: `1px solid ${colors.red}`, borderRadius: 4, cursor: batchRevertMutation.isPending ? 'not-allowed' : 'pointer', fontSize: 11, fontWeight: 600, fontFamily }}
                onClick={handleBatchRevert}
                disabled={batchRevertMutation.isPending}
              >{batchRevertMutation.isPending ? '폐기 중...' : '전체 폐기'}</button>
            </div>
          )}

          {/* 일괄 커밋 입력 바 */}
          {showBatchCommit && (
            <div style={{ padding: '7px 16px', display: 'flex', alignItems: 'center', gap: 8, background: '#fff8e1', borderBottom: `1px solid #ffe082`, fontSize: 12, flexShrink: 0 }}>
              <span style={{ color: '#7c5d00', fontWeight: 600, flexShrink: 0 }}>{modifiedFiles.length}개 변경됨</span>
              <input
                style={{ flex: 1, padding: '5px 8px', fontSize: 12, border: `1px solid ${colors.border}`, borderRadius: 4, outline: 'none', fontFamily }}
                placeholder="커밋 메시지를 입력하세요"
                value={batchCommitMsg}
                onChange={e => setBatchCommitMsg(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && batchCommitMsg.trim()) batchCommitMutation.mutate() }}
                autoFocus
              />
              <button
                style={{ padding: '5px 12px', background: colors.navy, color: '#fff', border: 'none', borderRadius: 4, cursor: batchCommitMutation.isPending || !batchCommitMsg.trim() ? 'not-allowed' : 'pointer', fontSize: 11, fontWeight: 600, fontFamily, opacity: batchCommitMutation.isPending || !batchCommitMsg.trim() ? 0.6 : 1, flexShrink: 0 }}
                onClick={() => batchCommitMutation.mutate()}
                disabled={batchCommitMutation.isPending || !batchCommitMsg.trim()}
              >{batchCommitMutation.isPending ? '커밋 중...' : '커밋'}</button>
              <button
                style={{ padding: '5px 10px', background: 'none', border: `1px solid ${colors.border}`, borderRadius: 4, cursor: 'pointer', fontSize: 11, color: colors.textSub, fontFamily, flexShrink: 0 }}
                onClick={() => setShowBatchCommit(false)}
              >취소</button>
            </div>
          )}

          {/* 파일 목록 테이블 */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr>
                  <th style={{ ...thStyle, width: 28 }}></th>
                  <th style={thStyle}>파일명</th>
                  <th style={{ ...thStyle, width: 60 }}>권한</th>
                  <th style={{ ...thStyle, width: 80 }}>크기</th>
                  <th style={{ ...thStyle, width: 70 }}>리비전</th>
                  <th style={{ ...thStyle, width: 140 }}>수정일</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={6} style={{ padding: '40px 0', textAlign: 'center', color: colors.textMuted, fontSize: 13 }}>로딩 중...</td></tr>}
                {!isLoading && error && (
                  <tr><td colSpan={6} style={{ padding: '40px 0', textAlign: 'center', color: colors.red, fontSize: 13 }}>
                    파일 목록을 불러올 수 없습니다.
                    <br /><button style={{ marginTop: 8, padding: '6px 14px', background: colors.navy, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 }} onClick={() => refetch()}>다시 시도</button>
                  </td></tr>
                )}
                {!isLoading && !error && (files as CombinedFile[]).length === 0 && (
                  <tr><td colSpan={6} style={{ padding: '40px 0', textAlign: 'center', color: colors.textMuted, fontSize: 13 }}>파일이 없습니다.</td></tr>
                )}
                {!isLoading && !error && (files as CombinedFile[]).map(f => {
                  const repo = ownerRepos.find(r => r.id === f.repoId)
                  const perm = repo?.permission ?? 'r'
                  const statusKey = `${f.repoId}:${f.path.replace(/\\/g, '/')}`
                  const statusInfo = wcStatusMap.get(statusKey)
                  return (
                    <FileRow
                      key={`${f.repoId}:${f.path}`}
                      entry={f}
                      permission={perm}
                      selected={selectedFile?.path === f.path && selectedFile.repoId === f.repoId}
                      statusInfo={statusInfo}
                      onClick={() => handleFileClick(f)}
                      onDoubleClick={() => handleFileDoubleClick(f)}
                    />
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 우측 패널 */}
        <aside style={{ width: 300, minWidth: 300, borderLeft: `1px solid ${colors.border}`, background: colors.bgSecondary, overflowY: 'auto', padding: 16, boxSizing: 'border-box' }}>
          {!selectedFile ? (
            <>
              <Section title="공유 정보">
                <MetaRow label="공유자" value={ownerName} />
                <MetaRow label="파일 수" value={`${totalFiles}개`} />
                <MetaRow label="마지막 동기화" value={formatDate(lastSynced)} />
              </Section>
              <Section title="작업">
                <button style={actionBtn('default', syncMutation.isPending)} onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
                  {syncMutation.isPending ? '동기화 중...' : '↻ 동기화'}
                </button>
                <button style={{ ...actionBtn('danger', disconnectMutation.isPending), marginBottom: 0 }} onClick={handleDisconnect} disabled={disconnectMutation.isPending}>
                  {disconnectMutation.isPending ? '해제 중...' : '공유 해제'}
                </button>
              </Section>
            </>
          ) : (
            <>
              <button onClick={() => setSelectedFile(null)} style={{ background: 'transparent', border: 'none', color: colors.textSub, fontSize: 11, cursor: 'pointer', padding: 0, marginBottom: 12 }}>
                ← 공유 정보
              </button>

              <Section title="선택 파일">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: selectedFile.type === 'file' ? 8 : 0 }}>
                  <span style={{ fontSize: 22 }}>{selectedFile.type === 'dir' ? '📁' : fileIcon(selectedFile.name)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: colors.text, wordBreak: 'break-all' }}>{selectedFile.name}</div>
                    <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
                      {selectedFile.type === 'file' ? `${getExt(selectedFile.name)} · ${formatSize(selectedFile.size)}` : '폴더'}
                    </div>
                  </div>
                </div>
                {selectedFile.type === 'file' && (
                  filePermission === 'rw' ? (
                    <button
                      style={{ padding: '7px 0', background: colors.navy, color: '#fff', border: 'none', borderRadius: 4, cursor: uploadMutation.isPending ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600, width: '100%', fontFamily, opacity: uploadMutation.isPending ? 0.7 : 1 }}
                      onClick={() => uploadMutation.mutate()}
                      disabled={uploadMutation.isPending}
                    >
                      {uploadMutation.isPending ? '업로드 중...' : '새버전 업로드'}
                    </button>
                  ) : (
                    <button
                      style={{ padding: '7px 0', background: colors.navy, color: '#fff', border: 'none', borderRadius: 4, cursor: openingFile ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600, width: '100%', fontFamily, opacity: openingFile ? 0.7 : 1 }}
                      onClick={() => handleOpenFile(selectedFile)}
                      disabled={openingFile}
                    >
                      {openingFile ? '열기 중...' : '파일 열기'}
                    </button>
                  )
                )}
              </Section>

              <Section title="메타데이터">
                <MetaRow label="크기" value={selectedFile.type === 'file' ? formatSize(selectedFile.size) : '-'} />
                <MetaRow label="리비전" value={fileInfo ? `r${(fileInfo as any).revision}` : '조회 중...'} />
                <MetaRow label="수정일" value={formatDate(selectedFile.modifiedAt)} />
                <MetaRow label="공유자" value={ownerName} />
                <MetaRow
                  label="권한"
                  value={filePermission === 'rw' ? '읽기/쓰기' : '읽기 전용'}
                  valueStyle={{ color: filePermission === 'rw' ? '#2e7d32' : '#1565c0', fontWeight: 600 }}
                />
                <MetaRow label="만료일" value="-" />
              </Section>

              {selectedFile.type === 'file' && (
                <Section title="작업">
                  <button
                    style={{ padding: '7px 0', background: 'none', border: `1px solid ${colors.blueBg}`, color: colors.blue, borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600, width: '100%', fontFamily, marginBottom: 6 }}
                    onClick={() => navigate(`/shared-file/${selectedFile.repoId}?path=${encodeURIComponent(selectedFile.path)}`)}
                  >
                    상세보기
                  </button>

                  {/* rw + 수정됨: 커밋/폐기 */}
                  {filePermission === 'rw' && isModified && !showCommitInput && (
                    <>
                      <button
                        style={{ padding: '7px 0', background: colors.navy, color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600, width: '100%', fontFamily, marginBottom: 6 }}
                        onClick={() => { setCommitMsg(''); setShowCommitInput(true) }}
                      >커밋</button>
                      <button
                        style={{ ...actionBtn('danger', revertMutation.isPending), marginBottom: 6 }}
                        onClick={handleRevert}
                        disabled={revertMutation.isPending}
                      >{revertMutation.isPending ? '폐기 중...' : '변경 폐기'}</button>
                    </>
                  )}

                  {/* 커밋 메시지 입력 */}
                  {filePermission === 'rw' && showCommitInput && (
                    <div style={{ marginBottom: 6 }}>
                      <input
                        style={{ width: '100%', padding: '6px 8px', fontSize: 12, border: `1px solid ${colors.border}`, borderRadius: 4, outline: 'none', fontFamily, boxSizing: 'border-box', marginBottom: 6 }}
                        placeholder="커밋 메시지"
                        value={commitMsg}
                        onChange={e => setCommitMsg(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && commitMsg.trim()) commitMutation.mutate() }}
                        autoFocus
                      />
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          style={{ flex: 1, padding: '6px 0', background: colors.navy, color: '#fff', border: 'none', borderRadius: 4, cursor: commitMutation.isPending || !commitMsg.trim() ? 'not-allowed' : 'pointer', fontSize: 11, fontWeight: 600, fontFamily, opacity: commitMutation.isPending || !commitMsg.trim() ? 0.6 : 1 }}
                          onClick={() => commitMutation.mutate()}
                          disabled={commitMutation.isPending || !commitMsg.trim()}
                        >{commitMutation.isPending ? '커밋 중...' : '확인'}</button>
                        <button
                          style={{ padding: '6px 10px', background: 'none', border: `1px solid ${colors.border}`, borderRadius: 4, cursor: 'pointer', fontSize: 11, color: colors.textSub, fontFamily }}
                          onClick={() => setShowCommitInput(false)}
                        >취소</button>
                      </div>
                    </div>
                  )}

                  {filePermission === 'rw' && !isModified && (
                    <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 6, textAlign: 'center' }}>수정 없음 (최신 상태)</div>
                  )}

                  <button style={actionBtn('default', syncMutation.isPending)} onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
                    {syncMutation.isPending ? '동기화 중...' : '↻ 동기화'}
                  </button>
                  <button style={{ ...actionBtn('danger', disconnectMutation.isPending), marginBottom: 0 }} onClick={handleDisconnect} disabled={disconnectMutation.isPending}>
                    {disconnectMutation.isPending ? '해제 중...' : '공유 해제'}
                  </button>
                </Section>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  )
}

function FileRow({ entry, permission, selected, onClick, onDoubleClick, statusInfo }: {
  entry: CombinedFile
  permission: 'r' | 'rw'
  selected: boolean
  onClick: () => void
  onDoubleClick?: () => void
  statusInfo?: { status: string; revision: number }
}) {
  const [hovered, setHovered] = useState(false)
  const isDir = entry.type === 'dir'
  const isFileModified = !isDir && statusInfo && (statusInfo.status === 'modified' || statusInfo.status === 'added' || statusInfo.status === 'deleted')
  const tdBase: CSSProperties = { padding: '9px 12px', borderBottom: `1px solid ${colors.borderLight}`, verticalAlign: 'middle' }
  return (
    <tr
      style={{ background: selected ? '#e8f0fe' : hovered ? '#f5f7fa' : 'transparent', cursor: 'pointer', transition: 'background 0.1s' }}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <td style={{ ...tdBase, width: 28, textAlign: 'center', fontSize: 15 }}>{isDir ? '📁' : fileIcon(entry.name)}</td>
      <td style={{ ...tdBase, color: isDir ? colors.navy : colors.text, fontWeight: isDir ? 600 : 400 }}>
        <span>{entry.name}</span>
        {isFileModified && (
          <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 600, color: '#e65100', background: '#fff3e0', padding: '1px 5px', borderRadius: 8 }}>
            수정됨
          </span>
        )}
      </td>
      <td style={{ ...tdBase, width: 60 }}>
        {!isDir && (
          <span style={{ fontSize: 10, fontWeight: 600, background: permission === 'rw' ? '#e8f5e9' : '#e3f2fd', color: permission === 'rw' ? '#2e7d32' : '#1565c0', padding: '1px 5px', borderRadius: 8 }}>
            {permission === 'rw' ? 'rw' : 'r'}
          </span>
        )}
      </td>
      <td style={{ ...tdBase, width: 80, color: colors.textMuted, fontSize: 12 }}>{isDir ? '' : formatSize(entry.size)}</td>
      <td style={{ ...tdBase, width: 70, color: colors.textMuted, fontSize: 12, textAlign: 'center' }}>
        {!isDir && statusInfo ? `r${statusInfo.revision}` : isDir ? '' : '-'}
      </td>
      <td style={{ ...tdBase, width: 140, color: colors.textMuted, fontSize: 12 }}>{formatDate(entry.modifiedAt)}</td>
    </tr>
  )
}
