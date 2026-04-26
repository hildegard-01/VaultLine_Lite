/**
 * SharedHistoryTab — 공유 파일 커밋 이력 탭
 * remote-repo:file-log IPC 사용 (svnserve 온라인 필요)
 */

import { type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { invoke } from '@renderer/services/ipcClient'
import { colors } from '@renderer/design/theme'

interface Props { repoId: number; filePath: string }

function formatRelativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return '방금 전'
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`
  if (diff < 2592000) return `${Math.floor(diff / 86400)}일 전`
  return new Date(iso).toLocaleDateString('ko-KR')
}

const S: Record<string, CSSProperties> = {
  table:    { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th:       { textAlign: 'left', padding: '10px 12px', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: colors.textMuted, borderBottom: `2px solid ${colors.border}` },
  td:       { padding: '10px 12px', borderBottom: `1px solid ${colors.borderLight}`, color: colors.text },
  revBadge: { display: 'inline-block', padding: '2px 8px', borderRadius: 10, background: colors.blueBg, color: colors.blue, fontSize: 12, fontWeight: 600 },
  empty:    { textAlign: 'center', padding: 40, color: colors.textMuted, fontSize: 14 },
}

export default function SharedHistoryTab({ repoId, filePath }: Props) {
  const { data: logs, isLoading, error } = useQuery({
    queryKey: ['remote-repo:file-log', repoId, filePath],
    queryFn: () => invoke('remote-repo:file-log' as any, { id: repoId, filePath }),
    retry: false,
  })

  if (isLoading) return <div style={S.empty}>커밋 이력을 불러오는 중...</div>
  if (error)    return (
    <div style={S.empty}>
      <div>커밋 이력을 불러오지 못했습니다.</div>
      <div style={{ fontSize: 12, marginTop: 8, color: colors.textMuted }}>소유자가 오프라인이거나 연결에 실패했습니다.</div>
    </div>
  )

  const entries = (logs || []) as Array<{ revision: number; author: string; date: string; message: string }>
  if (entries.length === 0) return <div style={S.empty}>커밋 이력이 없습니다.</div>

  return (
    <table style={S.table}>
      <thead>
        <tr>
          <th style={S.th}>리비전</th>
          <th style={S.th}>작성자</th>
          <th style={S.th}>메시지</th>
          <th style={S.th}>날짜</th>
        </tr>
      </thead>
      <tbody>
        {entries.map(entry => (
          <tr
            key={entry.revision}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = colors.bgSecondary }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
          >
            <td style={S.td}><span style={S.revBadge}>r.{entry.revision}</span></td>
            <td style={S.td}>{entry.author}</td>
            <td style={{ ...S.td, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {entry.message || '-'}
            </td>
            <td style={{ ...S.td, color: colors.textMuted }}>{formatRelativeTime(entry.date)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
