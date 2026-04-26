import { useState, useMemo, useEffect, type CSSProperties } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { invoke } from '@renderer/services/ipcClient'
import { useMode } from '@renderer/hooks/useMode'
import { colors, fontFamily, layout } from '@renderer/design/theme'
import type { Repository, RemoteRepo, RemoteFileEntry } from '@shared/types/ipc'

/**
 * AllFilesPage — 전체 파일 페이지
 * 탭: 전체 / 내 저장소 / 즐겨찾기 / 잠금 / 공유받은
 */

type FilterTab = 'all' | 'repos' | 'bookmarks' | 'locked' | 'shared'
type SortKey = 'name' | 'repo' | 'modified'

interface AllFileEntry {
  id: string
  name: string
  path: string
  repoId: number
  repoName: string
  size: number
  modifiedAt: string
  kind: 'local' | 'shared' | 'bookmarked' | 'locked'
  badge?: string
  sharer?: string
  sharedRepoId?: number
}

export default function AllFilesPage() {
  const navigate = useNavigate()
  const { connected } = useMode()
  const queryClient = useQueryClient()
  const [filterTab, setFilterTab] = useState<FilterTab>('all')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('modified')

  /* ── 공유 취소 WS 이벤트 → 공유받은 저장소 목록 즉시 갱신 ── */
  useEffect(() => {
    const unsub = window.api.on('share:revoked', () => {
      queryClient.invalidateQueries({ queryKey: ['remote-repo:list'] })
    })
    return () => unsub()
  }, [queryClient])

  /* ── 저장소 목록 ── */
  const { data: repos = [] } = useQuery<Repository[]>({
    queryKey: ['repo:list'],
    queryFn: () => invoke('repo:list'),
  })

  const repoMap = useMemo(() => {
    const m: Record<number, string> = {}
    ;(repos as Repository[]).forEach((r) => { m[r.id] = r.name })
    return m
  }, [repos])

  const repoIds = (repos as Repository[]).map((r) => r.id)

  /* ── 저장소별 파일 재귀 조회 ── */
  const { data: localFiles = [], isLoading: localLoading } = useQuery<AllFileEntry[]>({
    queryKey: ['all-files:local', repoIds],
    queryFn: async () => {
      const results: AllFileEntry[] = []
      for (const repo of repos as Repository[]) {
        try {
          const files = await fetchAllFilesRecursive(repo.id, repo.name, '', 0)
          results.push(...files)
        } catch { /* 무시 */ }
      }
      return results
    },
    enabled: repos.length > 0,
  })

  /* ── 즐겨찾기 조회 ── */
  const { data: bookmarkRaw = [] } = useQuery({
    queryKey: ['bookmark:list'],
    queryFn: () => invoke('bookmark:list'),
  })

  const bookmarkFiles = useMemo<AllFileEntry[]>(() => {
    return (bookmarkRaw as any[]).map((b) => ({
      id: `bm:${b.repoId}:${b.filePath}`,
      name: b.filePath.split('/').pop() || b.filePath,
      path: b.filePath,
      repoId: b.repoId,
      repoName: repoMap[b.repoId] ?? `저장소 ${b.repoId}`,
      size: 0,
      modifiedAt: b.createdAt,
      kind: 'bookmarked' as const,
      badge: '★',
    }))
  }, [bookmarkRaw, repoMap])

  /* ── 잠금 파일 조회 (저장소별) ── */
  const { data: lockFiles = [] } = useQuery<AllFileEntry[]>({
    queryKey: ['all-files:locks', repoIds],
    queryFn: async () => {
      const results: AllFileEntry[] = []
      for (const repo of repos as Repository[]) {
        try {
          const locks = await invoke('lock:list', { repoId: repo.id }) as any[]
          for (const l of locks) {
            results.push({
              id: `lk:${l.repoId}:${l.filePath}`,
              name: l.filePath.split('/').pop() || l.filePath,
              path: l.filePath,
              repoId: l.repoId,
              repoName: repo.name,
              size: 0,
              modifiedAt: l.lockedAt,
              kind: 'locked' as const,
              badge: '🔒',
            })
          }
        } catch { /* 무시 */ }
      }
      return results
    },
    enabled: repos.length > 0,
  })

  /* ── 공유받은 저장소 목록 ── */
  const { data: remoteRepos = [] } = useQuery<RemoteRepo[]>({
    queryKey: ['remote-repo:list'],
    queryFn: () => invoke('remote-repo:list'),
    enabled: connected,
  })

  /* ── 공유받은 파일 목록 ── */
  const { data: sharedFiles = [] } = useQuery<AllFileEntry[]>({
    queryKey: ['all-files:shared', (remoteRepos as RemoteRepo[]).map(r => r.id)],
    queryFn: async () => {
      const results: AllFileEntry[] = []
      for (const repo of remoteRepos as RemoteRepo[]) {
        try {
          const files = await invoke('remote-repo:file-list', { id: repo.id }) as RemoteFileEntry[]
          for (const f of files) {
            if (f.type === 'file') {
              results.push({
                id: `shared:${repo.id}:${f.path}`,
                name: f.name,
                path: f.path,
                repoId: repo.id,
                repoName: repo.displayName,
                size: f.size,
                modifiedAt: f.modifiedAt ?? repo.lastSynced ?? repo.createdAt,
                kind: 'shared',
                badge: '↓',
                sharer: repo.ownerName ?? undefined,
                sharedRepoId: repo.id,
              })
            }
          }
        } catch { /* 무시 */ }
      }
      return results
    },
    enabled: (remoteRepos as RemoteRepo[]).length > 0,
  })

  /* ── 탭별 필터 ── */
  const displayFiles = useMemo<AllFileEntry[]>(() => {
    let list: AllFileEntry[]
    switch (filterTab) {
      case 'repos':      list = localFiles; break
      case 'bookmarks':  list = bookmarkFiles; break
      case 'locked':     list = lockFiles; break
      case 'shared':     list = sharedFiles; break
      default:           list = [...localFiles, ...bookmarkFiles.filter((b) =>
                            !localFiles.some((l) => l.id === `${b.repoId}:${b.path}`)),
                            ...lockFiles.filter((l) =>
                            !localFiles.some((f) => f.id === `${l.repoId}:${l.path}`)),
                            ...sharedFiles]
    }

    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((f) => f.name.toLowerCase().includes(q) || f.repoName.toLowerCase().includes(q))
    }

    return [...list].sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name, 'ko')
      if (sortKey === 'repo') return a.repoName.localeCompare(b.repoName, 'ko')
      return new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime()
    })
  }, [localFiles, bookmarkFiles, lockFiles, sharedFiles, filterTab, search, sortKey])

  /* ── 스타일 ── */
  const pageStyle: CSSProperties = { flex: 1, display: 'flex', flexDirection: 'column', background: colors.bg, fontFamily, minHeight: 0 }
  const headerStyle: CSSProperties = { padding: '20px 24px 0', background: colors.bgPrimary, borderBottom: `1px solid ${colors.border}` }
  const tabBarStyle: CSSProperties = { display: 'flex', gap: 0 }
  const bodyStyle: CSSProperties = { flex: 1, padding: 24, overflowY: 'auto' }
  const cardStyle: CSSProperties = { background: colors.bgPrimary, borderRadius: layout.radius, border: `1px solid ${colors.border}`, overflow: 'hidden' }
  const tableStyle: CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 }
  const thBase: CSSProperties = { padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.4px', borderBottom: `1px solid ${colors.border}`, background: '#fafbfc', cursor: 'pointer', userSelect: 'none' }
  const tdStyle: CSSProperties = { padding: '10px 12px', borderBottom: `1px solid ${colors.borderLight}`, color: colors.text, verticalAlign: 'middle' }

  const tabStyle = (active: boolean): CSSProperties => ({
    padding: '10px 18px',
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    color: active ? colors.navy : colors.textSub,
    borderBottomWidth: 2,
    borderBottomStyle: 'solid',
    borderBottomColor: active ? colors.navy : 'transparent',
    cursor: 'pointer',
    userSelect: 'none',
    background: 'none',
    border: 'none',
    fontFamily,
  })

  const sortIcon = (key: SortKey) => sortKey === key ? ' ↓' : ''

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all',       label: `전체 (${localFiles.length + sharedFiles.length})` },
    { key: 'repos',     label: `내 저장소 (${localFiles.length})` },
    { key: 'bookmarks', label: `즐겨찾기 (${bookmarkFiles.length})` },
    { key: 'locked',    label: `잠금 (${lockFiles.length})` },
    { key: 'shared',    label: `공유받은${connected ? ` (${sharedFiles.length})` : ' 🔌'}` },
  ]

  const isLoading = localLoading && repos.length > 0

  const navigateToFile = (file: AllFileEntry) => {
    if (file.kind === 'shared' && file.sharedRepoId) {
      navigate(`/shared-repo/${file.sharedRepoId}`)
      return
    }
    if (file.repoId > 0) {
      const parts = file.path.split('/')
      parts.pop()
      const parentPath = parts.join('/')
      navigate(`/repo/${file.repoId}`, { state: { navigateTo: parentPath, selectFile: file.path, ts: Date.now() } })
    }
  }

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: colors.text, margin: 0 }}>전체 파일</h2>
          <input
            style={{ padding: '8px 12px', fontSize: 13, border: `1px solid ${colors.border}`, borderRadius: 6, outline: 'none', fontFamily, width: 240, color: colors.text }}
            placeholder="파일명 또는 저장소 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div style={tabBarStyle}>
          {tabs.map(({ key, label }) => (
            <button key={key} style={tabStyle(filterTab === key)} onClick={() => setFilterTab(key)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={bodyStyle}>
        {filterTab === 'shared' && !connected ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60%' }}>
            <div style={{ textAlign: 'center', color: colors.textMuted }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🔌</div>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, color: colors.text }}>서버 연결이 필요합니다</div>
              <div style={{ fontSize: 13 }}>서버에 연결하면 다른 사용자가 공유한 파일을 볼 수 있습니다.</div>
            </div>
          </div>
        ) : isLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60%', color: colors.textMuted }}>
            파일 목록 불러오는 중...
          </div>
        ) : (
          <div style={cardStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={{ ...thBase, width: '38%' }} onClick={() => setSortKey('name')}>파일명{sortIcon('name')}</th>
                  <th style={{ ...thBase, width: '18%' }} onClick={() => setSortKey('repo')}>저장소{sortIcon('repo')}</th>
                  <th style={thBase}>크기</th>
                  <th style={{ ...thBase, width: '20%' }} onClick={() => setSortKey('modified')}>수정일{sortIcon('modified')}</th>
                  <th style={thBase}>작업</th>
                </tr>
              </thead>
              <tbody>
                {displayFiles.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: colors.textMuted, padding: 40 }}>
                      {search ? '검색 결과가 없습니다.' : tabEmptyMsg(filterTab)}
                    </td>
                  </tr>
                ) : (
                  displayFiles.map((file) => (
                    <tr
                      key={file.id}
                      style={{ cursor: file.repoId > 0 ? 'pointer' : 'default' }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#f5f7fa' }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                      onClick={() => navigateToFile(file)}
                    >
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span>{fileIcon(file.name)}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {file.name}
                              {file.badge && (
                                <span style={{ fontSize: 11, color: file.kind === 'locked' ? colors.orange : colors.blue }}>{file.badge}</span>
                              )}
                              {file.kind === 'shared' && (
                                <span style={{ fontSize: 10, color: colors.blue, fontWeight: 600, background: colors.blueBg, padding: '1px 5px', borderRadius: 4 }}>공유</span>
                              )}
                            </div>
                            {file.path !== file.name && (
                              <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 1 }}>{file.path}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{ ...tdStyle, color: colors.textSub }}>{file.repoName}</td>
                      <td style={{ ...tdStyle, color: colors.textSub }}>{formatBytes(file.size)}</td>
                      <td style={{ ...tdStyle, color: colors.textSub }}>
                        {new Date(file.modifiedAt).toLocaleDateString('ko-KR')}
                      </td>
                      <td style={tdStyle}>
                        {file.kind === 'shared' ? (
                          <button style={actionBtnStyle} onClick={(e) => e.stopPropagation()}>미리보기</button>
                        ) : (
                          <button style={actionBtnStyle} onClick={(e) => { e.stopPropagation(); navigateToFile(file) }}>
                            파일로 이동
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── 유틸 ── */

const actionBtnStyle: CSSProperties = {
  padding: '4px 10px',
  fontSize: 11,
  fontWeight: 600,
  border: `1px solid ${colors.border}`,
  borderRadius: 4,
  cursor: 'pointer',
  background: 'none',
  color: colors.textSub,
  fontFamily,
}

function tabEmptyMsg(tab: FilterTab): string {
  if (tab === 'bookmarks') return '즐겨찾기한 파일이 없습니다.'
  if (tab === 'locked') return '보호 잠금된 파일이 없습니다.'
  if (tab === 'shared') return '공유받은 파일이 없습니다.'
  return '파일이 없습니다.'
}

async function fetchAllFilesRecursive(
  repoId: number,
  repoName: string,
  path: string,
  depth: number
): Promise<AllFileEntry[]> {
  if (depth > 4) return []
  const files = await invoke('file:list', { repoId, path }) as any[]
  if (!Array.isArray(files)) return []

  const result: AllFileEntry[] = []
  for (const f of files) {
    const fullPath = path ? `${path}/${f.name}` : f.name
    if (f.type === 'dir') {
      const sub = await fetchAllFilesRecursive(repoId, repoName, fullPath, depth + 1)
      result.push(...sub)
    } else {
      result.push({
        id: `${repoId}:${fullPath}`,
        name: f.name,
        path: fullPath,
        repoId,
        repoName,
        size: f.size ?? 0,
        modifiedAt: f.date ?? new Date().toISOString(),
        kind: 'local',
      })
    }
  }
  return result
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '-'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`
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
