/**
 * Diff 비교 탭
 *
 * 역할: 두 리비전을 선택하여 텍스트 diff를 표시합니다.
 *       바이너리 파일은 비교 불가 안내를 표시합니다.
 */

import { useState, type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { invoke } from '@renderer/services/ipcClient';
import { colors, fontFamily } from '@renderer/design/theme';
import type { CommitLogEntry } from '@shared/types/ipc';

interface DiffTabProps {
  repoId: number;
  path: string;
}

const S: Record<string, CSSProperties> = {
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  select: {
    padding: '6px 10px',
    borderRadius: 6,
    border: `1px solid ${colors.border}`,
    fontSize: 13,
    fontFamily,
    outline: 'none',
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontSize: 12,
    fontWeight: 600,
    color: colors.textMuted,
    flexShrink: 0,
  },
  compareBtn: {
    padding: '6px 16px',
    borderRadius: 6,
    border: 'none',
    background: colors.navy,
    color: '#fff',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
  },
  diffContainer: {
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    overflow: 'auto',
    maxHeight: 'calc(100vh - 340px)',
    fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
    fontSize: 12,
    lineHeight: 1.6,
  },
  line: {
    display: 'flex',
    padding: '0 12px',
    minHeight: 22,
    whiteSpace: 'pre',
  },
  lineNum: {
    width: 40,
    textAlign: 'right',
    color: colors.textMuted,
    paddingRight: 12,
    userSelect: 'none',
    flexShrink: 0,
  },
  empty: {
    textAlign: 'center',
    padding: 40,
    color: colors.textMuted,
    fontSize: 14,
  },
};

function getLineStyle(line: string): CSSProperties {
  if (line.startsWith('+')) return { background: '#e6ffec', color: '#1a7f37' };
  if (line.startsWith('-')) return { background: '#ffebe9', color: '#cf222e' };
  if (line.startsWith('@@')) return { background: '#ddf4ff', color: colors.blue };
  return {};
}

export default function DiffTab({ repoId, path }: DiffTabProps) {
  const [fromRev, setFromRev] = useState('');
  const [toRev, setToRev] = useState('');
  const [compareTriggered, setCompareTriggered] = useState(false);

  /* 리비전 목록 */
  const { data: logData } = useQuery({
    queryKey: ['commit:log', repoId, path],
    queryFn: () => invoke('commit:log', { repoId, path, limit: 50 }),
  });

  const entries = (logData || []) as CommitLogEntry[];

  /* Diff 조회 */
  const canDiff = !!(fromRev && toRev && fromRev !== toRev && compareTriggered);
  const { data: diffData, isLoading, error } = useQuery({
    queryKey: ['commit:diff', repoId, path, fromRev, toRev],
    queryFn: () => invoke('commit:diff', { repoId, path, rev1: Number(fromRev), rev2: Number(toRev) }),
    enabled: canDiff,
  });

  const handleCompare = () => {
    if (fromRev && toRev && fromRev !== toRev) {
      setCompareTriggered(true);
    }
  };

  if (entries.length < 2) {
    return <div style={S.empty}>비교할 리비전이 2개 이상 필요합니다.</div>;
  }

  return (
    <div>
      {/* 리비전 선택 */}
      <div style={S.controls}>
        <span style={S.label}>이전</span>
        <select style={S.select} value={fromRev} onChange={(e) => { setFromRev(e.target.value); setCompareTriggered(false); }}>
          <option value="">리비전 선택</option>
          {entries.map((e) => (
            <option key={`from-${e.revision}`} value={String(e.revision)}>
              r.{e.revision} — {e.message || e.author}
            </option>
          ))}
        </select>

        <span style={S.label}>이후</span>
        <select style={S.select} value={toRev} onChange={(e) => { setToRev(e.target.value); setCompareTriggered(false); }}>
          <option value="">리비전 선택</option>
          {entries.map((e) => (
            <option key={`to-${e.revision}`} value={String(e.revision)}>
              r.{e.revision} — {e.message || e.author}
            </option>
          ))}
        </select>

        <button
          style={{
            ...S.compareBtn,
            opacity: (!fromRev || !toRev || fromRev === toRev) ? 0.5 : 1,
            cursor: (!fromRev || !toRev || fromRev === toRev) ? 'not-allowed' : 'pointer',
          }}
          onClick={handleCompare}
          disabled={!fromRev || !toRev || fromRev === toRev}
        >
          비교
        </button>
      </div>

      {/* Diff 결과 */}
      {isLoading && <div style={S.empty}>Diff를 생성하는 중...</div>}
      {error && <div style={S.empty}>Diff를 생성하지 못했습니다.</div>}
      {canDiff && !isLoading && !error && diffData !== undefined && <DiffContent diff={diffData as string} />}
      {!compareTriggered && <div style={S.empty}>두 리비전을 선택한 후 비교 버튼을 클릭하세요.</div>}
    </div>
  );
}

/* ── Diff 콘텐츠 렌더링 ── */
function DiffContent({ diff }: { diff: string }) {
  if (!diff || diff.trim().length === 0) {
    return <div style={S.empty}>변경 사항이 없습니다.</div>;
  }

  /* 바이너리 감지 */
  if (diff.includes('Cannot display: file marked as a binary type') || diff.includes('svn:mime-type')) {
    return (
      <div style={S.empty}>
        <span style={{ fontSize: 32, opacity: 0.4, marginBottom: 8 }}>🔒</span>
        <span>바이너리 파일은 텍스트 Diff를 표시할 수 없습니다.</span>
      </div>
    );
  }

  const lines = diff.split('\n');

  return (
    <div style={S.diffContainer}>
      {lines.map((line, i) => (
        <div key={i} style={{ ...S.line, ...getLineStyle(line) }}>
          <span style={S.lineNum as CSSProperties}>{i + 1}</span>
          <span>{line}</span>
        </div>
      ))}
    </div>
  );
}
