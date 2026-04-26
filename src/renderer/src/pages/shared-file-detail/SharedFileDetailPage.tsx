/**
 * SharedFileDetailPage — 공유받은 파일 상세보기
 * 경로: /shared-file/:repoId?path=filePath
 *
 * FileDetailPage와 동일한 레이아웃:
 * 헤더(파일명 + 메타) + 탭바(커밋 이력/Diff/업로드) + 우측 메타데이터 패널
 */

import { useState, type CSSProperties } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { invoke } from '@renderer/services/ipcClient'
import { colors, layout, fontFamily } from '@renderer/design/theme'
import { ArrowLeft } from '@renderer/design/Icons'
import { getFileIcon } from '@renderer/pages/file-detail/FileDetailPage'
import type { RemoteRepo } from '@shared/types/ipc'

import SharedHistoryTab from './SharedHistoryTab'
import SharedDiffTab from './SharedDiffTab'
import SharedUploadTab from './SharedUploadTab'

/* ── 탭 ── */
type TabId = 'history' | 'diff' | 'upload'

function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

function formatRelativeTime(iso: string): string {
  if (!iso) return '-'
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return '방금 전'
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`
  if (diff < 2592000) return `${Math.floor(diff / 86400)}일 전`
  return new Date(iso).toLocaleDateString('ko-KR')
}

/* ── 스타일 ── */
const S: Record<string, CSSProperties> = {
  page:     { display: 'flex', flex: 1, overflow: 'hidden', fontFamily },
  main:     { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  headerBar: { display: 'flex', alignItems: 'center', gap: 14, padding: '16px 24px 12px', borderBottom: `1px solid ${colors.borderLight}` },
  iconBox:  { width: 44, height: 44, borderRadius: layout.radius, background: colors.bgSecondary, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  fileName: { fontSize: 16, fontWeight: 600, color: colors.text },
  fileMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  backBtn:  { display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6, background: 'none', border: `1px solid ${colors.border}`, cursor: 'pointer', fontSize: 13, color: colors.textSub, marginLeft: 'auto', flexShrink: 0 },
  tabBar:   { display: 'flex', gap: 0, padding: '0 24px', borderBottom: `1px solid ${colors.borderLight}` },
  tabContent: { flex: 1, overflow: 'auto', padding: 24 },
}

function tabStyle(active: boolean): CSSProperties {
  return {
    padding: '10px 18px', fontSize: 13, fontWeight: active ? 600 : 400,
    color: active ? colors.navy : colors.textSub, background: 'none', border: 'none',
    borderBottom: active ? `2px solid ${colors.navy}` : '2px solid transparent',
    cursor: 'pointer', transition: 'color 0.15s',
  }
}

/* ── 우측 메타데이터 패널 ── */
function SharedMetadataPanel({ repo, fileInfo, fileName }: {
  repo: RemoteRepo
  fileInfo: any
  fileName: string
}) {
  const panelStyle: CSSProperties = {
    width: 260, minWidth: 260, borderLeft: `1px solid ${colors.border}`,
    background: colors.bgSecondary, overflowY: 'auto', padding: 16, boxSizing: 'border-box',
  }
  const sectionStyle: CSSProperties = {
    background: colors.bgPrimary, border: `1px solid ${colors.border}`,
    borderRadius: 6, padding: 12, marginBottom: 12,
  }
  const titleStyle: CSSProperties = {
    fontSize: 10, fontWeight: 700, color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8,
  }
  const rowStyle: CSSProperties = {
    fontSize: 11, color: colors.textSub, marginBottom: 4,
    display: 'flex', justifyContent: 'space-between', gap: 8,
  }

  const perm = repo.permission
  return (
    <aside style={panelStyle}>
      <div style={sectionStyle}>
        <div style={titleStyle}>파일 정보</div>
        <div style={rowStyle}><span>크기</span><span style={{ color: colors.text }}>{formatFileSize(fileInfo?.size ?? 0)}</span></div>
        <div style={rowStyle}><span>리비전</span><span style={{ color: colors.text }}>{fileInfo?.revision ? `r.${fileInfo.revision}` : '-'}</span></div>
        <div style={rowStyle}><span>최종 수정</span><span style={{ color: colors.text }}>{fileInfo?.date ? formatRelativeTime(fileInfo.date) : '-'}</span></div>
        <div style={rowStyle}><span>작성자</span><span style={{ color: colors.text }}>{fileInfo?.author || '-'}</span></div>
      </div>
      <div style={sectionStyle}>
        <div style={titleStyle}>공유 정보</div>
        <div style={rowStyle}><span>공유자</span><span style={{ color: colors.text }}>{repo.ownerName ?? '-'}</span></div>
        <div style={rowStyle}>
          <span>권한</span>
          <span style={{ fontWeight: 600, color: perm === 'rw' ? '#2e7d32' : '#1565c0', background: perm === 'rw' ? '#e8f5e9' : '#e3f2fd', padding: '1px 6px', borderRadius: 8, fontSize: 11 }}>
            {perm === 'rw' ? '읽기/쓰기' : '읽기 전용'}
          </span>
        </div>
        <div style={rowStyle}><span>만료일</span><span style={{ color: colors.text }}>-</span></div>
        <div style={rowStyle}><span>동기화</span><span style={{ color: colors.text }}>{repo.lastSynced ? formatRelativeTime(repo.lastSynced) : '-'}</span></div>
      </div>
    </aside>
  )
}

/* ── 메인 페이지 ── */
export default function SharedFileDetailPage() {
  const { repoId } = useParams<{ repoId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const numRepoId = Number(repoId) || 0
  const filePath = searchParams.get('path') || ''
  const fileName = filePath.split('/').pop() || filePath

  const { data: remoteRepos = [] } = useQuery<RemoteRepo[]>({
    queryKey: ['remote-repo:list'],
    queryFn: () => invoke('remote-repo:list'),
  })

  const repo = (remoteRepos as RemoteRepo[]).find(r => r.id === numRepoId)

  const { data: fileInfo, isLoading } = useQuery({
    queryKey: ['remote-repo:file-info', numRepoId, filePath],
    queryFn: () => invoke('remote-repo:file-info' as any, { id: numRepoId, filePath }),
    enabled: numRepoId > 0 && filePath.length > 0,
    retry: false,
  })

  const permission = repo?.permission ?? 'r'

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'history', label: '커밋 이력' },
    { id: 'diff',    label: 'Diff' },
    ...(permission === 'rw' ? [{ id: 'upload' as TabId, label: '새 버전 업로드' }] : []),
  ]

  const [activeTab, setActiveTab] = useState<TabId>('history')

  const handleBack = () => navigate(`/shared-repo/${numRepoId}`)

  if (!repo) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: colors.textMuted, fontFamily }}>
        <span style={{ fontSize: 16 }}>공유 저장소를 찾을 수 없습니다.</span>
        <button onClick={handleBack} style={{ padding: '8px 16px', borderRadius: 6, background: colors.navy, color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13 }}>돌아가기</button>
      </div>
    )
  }

  const info = fileInfo as any

  return (
    <div style={S.page}>
      <div style={S.main}>

        {/* 헤더 */}
        <div style={S.headerBar}>
          <div style={S.iconBox}>{getFileIcon(fileName, 24)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={S.fileName}>{fileName}</div>
            <div style={S.fileMeta}>
              {isLoading ? '정보 불러오는 중...' : info
                ? `${info.author} · r.${info.revision} · ${formatFileSize(info.size)} · ${formatRelativeTime(info.date)}`
                : `공유자: ${repo.ownerName ?? '-'}`
              }
            </div>
          </div>
          <button
            style={S.backBtn}
            onClick={handleBack}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = colors.bgSecondary }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}
          >
            <ArrowLeft width={14} height={14} />
            돌아가기
          </button>
        </div>

        {/* 탭바 */}
        <div style={S.tabBar}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              style={tabStyle(activeTab === tab.id)}
              onClick={() => setActiveTab(tab.id)}
              onMouseEnter={e => { if (activeTab !== tab.id) (e.currentTarget as HTMLElement).style.color = colors.text }}
              onMouseLeave={e => { if (activeTab !== tab.id) (e.currentTarget as HTMLElement).style.color = colors.textSub }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 탭 콘텐츠 */}
        <div style={S.tabContent}>
          {activeTab === 'history' && <SharedHistoryTab repoId={numRepoId} filePath={filePath} />}
          {activeTab === 'diff'    && <SharedDiffTab    repoId={numRepoId} filePath={filePath} />}
          {activeTab === 'upload'  && permission === 'rw' && (
            <SharedUploadTab repoId={numRepoId} filePath={filePath} onUploaded={() => {
              queryClient.invalidateQueries({ queryKey: ['remote-repo:file-info', numRepoId, filePath] })
              queryClient.invalidateQueries({ queryKey: ['remote-repo:file-log', numRepoId, filePath] })
            }} />
          )}
        </div>
      </div>

      {/* 우측 메타데이터 패널 */}
      <SharedMetadataPanel repo={repo} fileInfo={info} fileName={fileName} />
    </div>
  )
}
