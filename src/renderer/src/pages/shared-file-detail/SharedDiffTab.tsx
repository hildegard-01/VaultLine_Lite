/**
 * SharedDiffTab — 공유 파일 Diff 탭
 * remote-repo:file-log + remote-repo:file-diff IPC 사용
 */

import { useState, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { invoke } from '@renderer/services/ipcClient'
import { colors, fontFamily } from '@renderer/design/theme'

interface Props { repoId: number; filePath: string }

const S: Record<string, CSSProperties> = {
  controls:   { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 },
  select:     { padding: '6px 10px', borderRadius: 6, border: `1px solid ${colors.border}`, fontSize: 13, fontFamily, outline: 'none', flex: 1, minWidth: 0 },
  label:      { fontSize: 12, fontWeight: 600, color: colors.textMuted, flexShrink: 0 },
  compareBtn: { padding: '6px 16px', borderRadius: 6, border: 'none', background: colors.navy, color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  diffBox:    { border: `1px solid ${colors.border}`, borderRadius: 8, overflow: 'auto', maxHeight: 'calc(100vh - 340px)', fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace", fontSize: 12, lineHeight: 1.6 },
  line:       { display: 'flex', padding: '0 12px', minHeight: 22, whiteSpace: 'pre' },
  lineNum:    { width: 40, textAlign: 'right', color: colors.textMuted, paddingRight: 12, userSelect: 'none', flexShrink: 0 },
  empty:      { textAlign: 'center', padding: 40, color: colors.textMuted, fontSize: 14 },
}

function getLineStyle(line: string): CSSProperties {
  if (line.startsWith('+') && !line.startsWith('+++')) return { background: '#e6ffec', color: '#1a7f37' }
  if (line.startsWith('-') && !line.startsWith('---')) return { background: '#ffebe9', color: '#cf222e' }
  if (line.startsWith('@@')) return { background: '#ddf4ff', color: colors.blue }
  return {}
}

export default function SharedDiffTab({ repoId, filePath }: Props) {
  const [fromRev, setFromRev] = useState('')
  const [toRev, setToRev] = useState('')
  const [triggered, setTriggered] = useState(false)

  const { data: logData, error: logError } = useQuery({
    queryKey: ['remote-repo:file-log', repoId, filePath],
    queryFn: () => invoke('remote-repo:file-log' as any, { id: repoId, filePath }),
    retry: false,
  })

  const entries = (logData || []) as Array<{ revision: number; author: string; message: string }>

  const canDiff = !!(fromRev && toRev && fromRev !== toRev && triggered)
  const { data: diffData, isLoading, error: diffError } = useQuery({
    queryKey: ['remote-repo:file-diff', repoId, filePath, fromRev, toRev],
    queryFn: () => invoke('remote-repo:file-diff' as any, { id: repoId, filePath, rev1: Number(fromRev), rev2: Number(toRev) }),
    enabled: canDiff,
    retry: false,
  })

  if (logError) return (
    <div style={S.empty}>
      <div>커밋 이력을 불러오지 못했습니다.</div>
      <div style={{ fontSize: 12, marginTop: 8, color: colors.textMuted }}>소유자가 오프라인이거나 연결에 실패했습니다.</div>
    </div>
  )

  if (entries.length < 2) return <div style={S.empty}>비교할 리비전이 2개 이상 필요합니다.</div>

  return (
    <div>
      <div style={S.controls}>
        <span style={S.label}>이전</span>
        <select style={S.select} value={fromRev} onChange={e => { setFromRev(e.target.value); setTriggered(false) }}>
          <option value="">리비전 선택</option>
          {entries.map(e => <option key={`f-${e.revision}`} value={String(e.revision)}>r.{e.revision} — {e.message || e.author}</option>)}
        </select>
        <span style={S.label}>이후</span>
        <select style={S.select} value={toRev} onChange={e => { setToRev(e.target.value); setTriggered(false) }}>
          <option value="">리비전 선택</option>
          {entries.map(e => <option key={`t-${e.revision}`} value={String(e.revision)}>r.{e.revision} — {e.message || e.author}</option>)}
        </select>
        <button
          style={{ ...S.compareBtn, opacity: (!fromRev || !toRev || fromRev === toRev) ? 0.5 : 1, cursor: (!fromRev || !toRev || fromRev === toRev) ? 'not-allowed' : 'pointer' }}
          onClick={() => { if (fromRev && toRev && fromRev !== toRev) setTriggered(true) }}
          disabled={!fromRev || !toRev || fromRev === toRev}
        >
          비교
        </button>
      </div>

      {isLoading && <div style={S.empty}>Diff를 생성하는 중...</div>}
      {diffError && <div style={S.empty}>Diff를 생성하지 못했습니다. 소유자가 오프라인일 수 있습니다.</div>}
      {canDiff && !isLoading && !diffError && diffData !== undefined && <DiffContent diff={diffData as string} />}
      {!triggered && <div style={S.empty}>두 리비전을 선택한 후 비교 버튼을 클릭하세요.</div>}
    </div>
  )
}

function DiffContent({ diff }: { diff: string }) {
  if (!diff || diff.trim().length === 0) return <div style={S.empty}>변경 사항이 없습니다.</div>
  if (diff.includes('Cannot display: file marked as a binary type') || diff.includes('svn:mime-type')) {
    return <div style={S.empty}>바이너리 파일은 텍스트 Diff를 표시할 수 없습니다.</div>
  }
  const lines = diff.split('\n')
  return (
    <div style={S.diffBox}>
      {lines.map((line, i) => (
        <div key={i} style={{ ...S.line, ...getLineStyle(line) }}>
          <span style={S.lineNum as CSSProperties}>{i + 1}</span>
          <span>{line}</span>
        </div>
      ))}
    </div>
  )
}
