/**
 * AdminActivityLog — 활동 로그 (와이어프레임 섹션 21)
 *
 * 역할: 통계 4카드 + 저장소/액션 필터 + 페이지네이션 + CSV 내보내기.
 * 구성: AdminActivityLog (메인) / StatCard / 필터바 / 로그 테이블 / 페이지네이션
 *
 * 연동 IPC: activity:list, activity:stats, activity:export-csv, repo:list
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { invoke } from '@renderer/services/ipcClient';
import { colors } from '@renderer/design/theme';
import { page, card, table, btn, formatDate } from './adminStyles';
import type { CSSProperties } from 'react';

const PAGE_SIZE = 30;

const ACTION_PREFIXES: Array<{ value: string; label: string }> = [
  { value: '', label: '전체 액션' },
  { value: 'file.', label: '파일' },
  { value: 'lock.', label: '잠금' },
  { value: 'share.', label: '공유' },
  { value: 'backup.', label: '백업' },
  { value: 'repo.', label: '저장소' },
];

export default function AdminActivityLog() {
  const [filterRepoId, setFilterRepoId] = useState<number | ''>('');
  const [filterAction, setFilterAction] = useState('');
  const [pageIdx, setPageIdx] = useState(0);

  const { data: repos = [] } = useQuery({
    queryKey: ['repo:list'],
    queryFn: () => invoke('repo:list'),
  });

  const listArgs = {
    repoId: filterRepoId === '' ? undefined : filterRepoId,
    action: filterAction || undefined,
    limit: PAGE_SIZE,
    offset: pageIdx * PAGE_SIZE,
  };

  const { data: activities = [] } = useQuery({
    queryKey: ['activity:list', listArgs],
    queryFn: () => invoke('activity:list', listArgs),
  });

  const { data: stats } = useQuery({
    queryKey: ['activity:stats'],
    queryFn: () => invoke('activity:stats', {}),
  });

  const handleExport = async () => {
    try {
      const { csv } = await invoke('activity:export-csv', {
        repoId: filterRepoId === '' ? undefined : filterRepoId,
        action: filterAction || undefined,
      });
      // Blob 다운로드
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `activity-log-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'CSV 내보내기 실패');
    }
  };

  const resetFilter = () => {
    setFilterRepoId('');
    setFilterAction('');
    setPageIdx(0);
  };

  return (
    <div style={page.root}>
      <h1 style={page.title}>📊 활동 로그</h1>
      <p style={page.desc}>시스템 전체의 활동 기록을 조회하고 CSV로 내보냅니다.</p>

      {/* 통계 카드 */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <StatCard label="전체 기록" value={stats?.totalCount ?? 0} color={colors.blue} />
        <StatCard label="최다 액션" value={stats?.topAction || '—'} color={colors.green} />
        <StatCard label="최다 사용자" value={stats?.topUser || '시스템'} color={colors.purple} />
        <StatCard label="액션 종류" value={stats?.actionTypes ?? 0} color={colors.orange} />
      </div>

      {/* 필터 + 내보내기 */}
      <div style={{ ...card.root, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <label style={filterLabelStyle}>저장소</label>
          <select
            value={filterRepoId}
            onChange={(e) => { setFilterRepoId(e.target.value === '' ? '' : Number(e.target.value)); setPageIdx(0); }}
            style={filterInputStyle}
          >
            <option value="">전체</option>
            {repos.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={filterLabelStyle}>액션</label>
          <select
            value={filterAction}
            onChange={(e) => { setFilterAction(e.target.value); setPageIdx(0); }}
            style={filterInputStyle}
          >
            {ACTION_PREFIXES.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>
        <button style={btn.ghost} onClick={resetFilter}>필터 초기화</button>
        <div style={{ flex: 1 }} />
        <button style={btn.primary} onClick={handleExport}>⬇ CSV 내보내기</button>
      </div>

      {/* 로그 테이블 */}
      <div style={card.root}>
        <table style={table.root}>
          <thead>
            <tr>
              <th style={table.th}>일시</th>
              <th style={table.th}>저장소</th>
              <th style={table.th}>액션</th>
              <th style={table.th}>파일</th>
              <th style={table.th}>리비전</th>
              <th style={table.th}>사용자</th>
              <th style={table.th}>상세</th>
            </tr>
          </thead>
          <tbody>
            {activities.map(a => (
              <tr key={a.id}>
                <td style={{ ...table.td, whiteSpace: 'nowrap' }}>{formatDate(a.createdAt)}</td>
                <td style={table.td}>{a.repoName || '—'}</td>
                <td style={table.td}><code style={{ fontSize: 11 }}>{a.action}</code></td>
                <td style={{ ...table.td, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.filePath || '—'}
                </td>
                <td style={table.td}>{a.revision != null ? `r.${a.revision}` : '—'}</td>
                <td style={table.td}>{a.username || '—'}</td>
                <td style={{ ...table.td, color: colors.textSub }}>{a.detail || '—'}</td>
              </tr>
            ))}
            {activities.length === 0 && (
              <tr>
                <td colSpan={7} style={{ ...table.td, textAlign: 'center', color: colors.textMuted, padding: 48 }}>
                  {pageIdx > 0 ? '더 이상 결과가 없습니다.' : '활동 기록이 없습니다.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* 페이지네이션 */}
        <div style={{
          display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12,
          padding: '16px 0 4px',
        }}>
          <button
            style={{ ...btn.ghost, ...btn.small, opacity: pageIdx === 0 ? 0.5 : 1 }}
            onClick={() => setPageIdx(p => Math.max(0, p - 1))}
            disabled={pageIdx === 0}
          >
            ← 이전
          </button>
          <span style={{ fontSize: 12, color: colors.textSub }}>페이지 {pageIdx + 1}</span>
          <button
            style={{ ...btn.ghost, ...btn.small, opacity: activities.length < PAGE_SIZE ? 0.5 : 1 }}
            onClick={() => setPageIdx(p => p + 1)}
            disabled={activities.length < PAGE_SIZE}
          >
            다음 →
          </button>
        </div>
      </div>
    </div>
  );
}

const filterLabelStyle: CSSProperties = {
  fontSize: 11, color: colors.textMuted, display: 'block', marginBottom: 4,
};
const filterInputStyle: CSSProperties = {
  padding: '6px 10px', fontSize: 13,
  border: `1px solid ${colors.border}`, borderRadius: 4,
  minWidth: 160,
};

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{
      flex: 1, minWidth: 180, padding: 16,
      background: colors.bgPrimary, border: `1px solid ${colors.border}`,
      borderRadius: 8, borderLeft: `4px solid ${color}`,
    }}>
      <div style={{ fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color, marginTop: 4, wordBreak: 'break-all' }}>
        {value}
      </div>
    </div>
  );
}
