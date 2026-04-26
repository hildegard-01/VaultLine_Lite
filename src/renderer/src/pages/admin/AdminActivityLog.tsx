/**
 * AdminActivityLog — 활동 로그
 *
 * 역할: 통계 4카드 + 저장소/액션 필터 + 페이지네이션 + CSV 내보내기.
 * 연동 IPC: activity:list, activity:stats, activity:export-csv, repo:list
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { invoke } from '@renderer/services/ipcClient';
import { colors } from '@renderer/design/theme';
import { page, card, btn, formatDate } from './adminStyles';
import type { CSSProperties } from 'react';

const PAGE_SIZE = 30;

/* ────────── 액션 메타 (뱃지 색상 + 한글 레이블) ────────── */

interface ActionMeta { label: string; bg: string; color: string; icon: string }

const ACTION_META: Record<string, ActionMeta> = {
  'file.upload':     { label: '파일 업로드',  bg: '#e8f4ff', color: '#1565C0', icon: '⬆' },
  'file.commit':     { label: '파일 커밋',    bg: '#e8f4ff', color: '#1565C0', icon: '✓' },
  'file.delete':     { label: '파일 삭제',    bg: '#fff0f0', color: '#C62828', icon: '🗑' },
  'file.rename':     { label: '이름 변경',    bg: '#f0f4ff', color: '#3949AB', icon: '✏' },
  'file.move':       { label: '이동',         bg: '#f0f4ff', color: '#3949AB', icon: '→' },
  'file.copy':       { label: '복사',         bg: '#f0f4ff', color: '#3949AB', icon: '⎘' },
  'file.lock':       { label: '파일 잠금',    bg: '#fff8e1', color: '#E65100', icon: '🔒' },
  'lock.add':        { label: '보호 잠금',    bg: '#fff3e0', color: '#E65100', icon: '🔒' },
  'lock.remove':     { label: '잠금 해제',    bg: '#f1f8e9', color: '#2E7D32', icon: '🔓' },
  'share.create':    { label: '공유 생성',    bg: '#f3e5f5', color: '#6A1B9A', icon: '↗' },
  'share.download':  { label: '공유 다운로드', bg: '#fce4ec', color: '#880E4F', icon: '⬇' },
  'share.user-add':  { label: '공유 사용자 추가', bg: '#f3e5f5', color: '#6A1B9A', icon: '＋' },
  'share.user-remove': { label: '공유 사용자 제거', bg: '#fce4ec', color: '#880E4F', icon: '－' },
  'backup.create':   { label: '백업 생성',    bg: '#e8f5e9', color: '#1B5E20', icon: '💾' },
  'backup.restore':  { label: '백업 복원',    bg: '#e0f7fa', color: '#006064', icon: '↩' },
  'repo.set-quota':  { label: '쿼터 설정',    bg: '#e0f2f1', color: '#004D40', icon: '⊙' },
  'repo.mark-deletion':   { label: '예약 삭제',   bg: '#fff0f0', color: '#C62828', icon: '⚠' },
  'repo.cancel-deletion': { label: '삭제 취소',   bg: '#f1f8e9', color: '#2E7D32', icon: '↩' },
  'admin.user-create':    { label: '사용자 생성', bg: '#fbe9e7', color: '#BF360C', icon: '👤' },
  'admin.user-delete':    { label: '사용자 삭제', bg: '#fbe9e7', color: '#BF360C', icon: '👤' },
  'admin.password-reset': { label: '비번 초기화', bg: '#fbe9e7', color: '#BF360C', icon: '🔑' },
  'admin.force-logout':   { label: '강제 로그아웃', bg: '#fbe9e7', color: '#BF360C', icon: '⏏' },
  'admin.share-delete':   { label: '공유 강제 삭제', bg: '#fbe9e7', color: '#BF360C', icon: '✕' },
  'auth.login':      { label: '로그인',       bg: '#e8f5e9', color: '#2E7D32', icon: '→' },
};

function getActionMeta(action: string): ActionMeta {
  if (ACTION_META[action]) return ACTION_META[action];
  // prefix 기반 폴백
  if (action.startsWith('file.'))   return { label: action.replace('file.', ''), bg: '#e8f4ff', color: '#1565C0', icon: '📄' };
  if (action.startsWith('lock.'))   return { label: action.replace('lock.', ''), bg: '#fff8e1', color: '#E65100', icon: '🔒' };
  if (action.startsWith('share.'))  return { label: action.replace('share.', ''), bg: '#f3e5f5', color: '#6A1B9A', icon: '↗' };
  if (action.startsWith('backup.')) return { label: action.replace('backup.', ''), bg: '#e8f5e9', color: '#1B5E20', icon: '💾' };
  if (action.startsWith('repo.'))   return { label: action.replace('repo.', ''), bg: '#e0f2f1', color: '#004D40', icon: '🗄' };
  if (action.startsWith('admin.'))  return { label: action.replace('admin.', ''), bg: '#fbe9e7', color: '#BF360C', icon: '⚙' };
  return { label: action, bg: '#f5f5f5', color: '#666', icon: '•' };
}

const ACTION_PREFIXES = [
  { value: '', label: '전체 액션' },
  { value: 'file.', label: '파일' },
  { value: 'lock.', label: '잠금' },
  { value: 'share.', label: '공유' },
  { value: 'backup.', label: '백업' },
  { value: 'repo.', label: '저장소' },
  { value: 'admin.', label: '관리자' },
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

  const topActionMeta = stats?.topAction ? getActionMeta(stats.topAction) : null;

  return (
    <div style={page.root}>
      <h1 style={page.title}>📊 활동 로그</h1>
      <p style={page.desc}>시스템 전체의 활동 기록을 조회하고 CSV로 내보냅니다.</p>

      {/* 통계 카드 */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <StatCard label="전체 기록" value={String(stats?.totalCount ?? 0)} sub="건" color={colors.blue} />
        <StatCard
          label="최다 액션"
          value={topActionMeta?.label ?? (stats?.topAction || '—')}
          sub={topActionMeta ? undefined : undefined}
          color={topActionMeta?.color ?? colors.green}
          bg={topActionMeta?.bg}
        />
        <StatCard label="최다 사용자" value={stats?.topUser || '시스템'} color={colors.purple} />
        <StatCard label="액션 종류" value={String(stats?.actionTypes ?? 0)} sub="종" color={colors.orange} />
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
            {repos.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div>
          <label style={filterLabelStyle}>액션</label>
          <select
            value={filterAction}
            onChange={(e) => { setFilterAction(e.target.value); setPageIdx(0); }}
            style={filterInputStyle}
          >
            {ACTION_PREFIXES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <button style={btn.ghost} onClick={resetFilter}>필터 초기화</button>
        <div style={{ flex: 1 }} />
        <button style={btn.primary} onClick={handleExport}>⬇ CSV 내보내기</button>
      </div>

      {/* 로그 테이블 */}
      <div style={{ ...card.root, padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8f9fb' }}>
              <Th style={{ width: 148 }}>일시</Th>
              <Th style={{ width: 100 }}>저장소</Th>
              <Th style={{ width: 148 }}>액션</Th>
              <Th>파일</Th>
              <Th style={{ width: 60 }}>리비전</Th>
              <Th style={{ width: 80 }}>사용자</Th>
              <Th>상세</Th>
            </tr>
          </thead>
          <tbody>
            {activities.map((a, idx) => (
              <LogRow key={a.id} activity={a} even={idx % 2 === 0} />
            ))}
            {activities.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: colors.textMuted, padding: 48, fontSize: 13 }}>
                  {pageIdx > 0 ? '더 이상 결과가 없습니다.' : '활동 기록이 없습니다.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* 페이지네이션 */}
        <div style={{
          display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12,
          padding: '14px 0', borderTop: `1px solid ${colors.border}`,
        }}>
          <button
            style={{ ...btn.ghost, ...btn.small, opacity: pageIdx === 0 ? 0.4 : 1 }}
            onClick={() => setPageIdx(p => Math.max(0, p - 1))}
            disabled={pageIdx === 0}
          >
            ← 이전
          </button>
          <span style={{ fontSize: 12, color: colors.textSub }}>
            {pageIdx * PAGE_SIZE + 1} – {pageIdx * PAGE_SIZE + activities.length}건
          </span>
          <button
            style={{ ...btn.ghost, ...btn.small, opacity: activities.length < PAGE_SIZE ? 0.4 : 1 }}
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

/* ────────── 테이블 행 ────────── */

function LogRow({ activity: a, even }: { activity: any; even: boolean }) {
  const meta = getActionMeta(a.action);
  const [hovered, setHovered] = useState(false);

  const rowStyle: CSSProperties = {
    background: hovered ? '#f0f4ff' : even ? '#ffffff' : '#fafbfc',
    transition: 'background 0.1s',
    cursor: 'default',
  };

  const cellBase: CSSProperties = {
    padding: '9px 12px',
    fontSize: 13,
    color: colors.text,
    borderBottom: `1px solid ${colors.borderLight}`,
    verticalAlign: 'middle',
  };

  return (
    <tr
      style={rowStyle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* 일시 */}
      <td style={{ ...cellBase, whiteSpace: 'nowrap', fontSize: 12, color: colors.textSub }}>
        {formatDate(a.createdAt)}
      </td>

      {/* 저장소 */}
      <td style={{ ...cellBase, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        <span title={a.repoName} style={{ fontSize: 12 }}>{a.repoName || '—'}</span>
      </td>

      {/* 액션 뱃지 */}
      <td style={cellBase}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '3px 9px', borderRadius: 12,
          fontSize: 11, fontWeight: 600,
          background: meta.bg, color: meta.color,
          whiteSpace: 'nowrap',
        }}>
          <span>{meta.icon}</span>
          <span>{meta.label}</span>
        </span>
      </td>

      {/* 파일 경로 */}
      <td style={{ ...cellBase, maxWidth: 220 }}>
        {a.filePath ? (
          <span
            title={a.filePath}
            style={{
              display: 'block', overflow: 'hidden', textOverflow: 'ellipsis',
              whiteSpace: 'nowrap', fontSize: 12, color: colors.textSub,
              fontFamily: 'monospace',
            }}
          >
            {a.filePath}
          </span>
        ) : <span style={{ color: colors.textMuted }}>—</span>}
      </td>

      {/* 리비전 */}
      <td style={{ ...cellBase, textAlign: 'center' }}>
        {a.revision != null ? (
          <span style={{
            fontSize: 11, fontWeight: 600, color: colors.blue,
            background: '#e8f4ff', padding: '2px 6px', borderRadius: 4,
          }}>
            r{a.revision}
          </span>
        ) : <span style={{ color: colors.textMuted }}>—</span>}
      </td>

      {/* 사용자 */}
      <td style={{ ...cellBase, fontSize: 12 }}>
        {a.username || <span style={{ color: colors.textMuted }}>시스템</span>}
      </td>

      {/* 상세 */}
      <td style={{ ...cellBase, maxWidth: 200 }}>
        {a.detail ? (
          <span
            title={a.detail}
            style={{
              display: 'block', overflow: 'hidden', textOverflow: 'ellipsis',
              whiteSpace: 'nowrap', fontSize: 12, color: colors.textSub,
            }}
          >
            {a.detail}
          </span>
        ) : <span style={{ color: colors.textMuted }}>—</span>}
      </td>
    </tr>
  );
}

/* ────────── 헬퍼 컴포넌트 ────────── */

function Th({ children, style }: { children?: React.ReactNode; style?: CSSProperties }) {
  return (
    <th style={{
      padding: '10px 12px',
      textAlign: 'left',
      fontSize: 11,
      fontWeight: 700,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: '0.3px',
      borderBottom: `2px solid ${colors.border}`,
      ...style,
    }}>
      {children}
    </th>
  );
}

function StatCard({ label, value, sub, color, bg }: {
  label: string; value: string; sub?: string; color: string; bg?: string
}) {
  return (
    <div style={{
      flex: 1, minWidth: 160, padding: '14px 18px',
      background: colors.bgPrimary, border: `1px solid ${colors.border}`,
      borderRadius: 8, borderLeft: `4px solid ${color}`,
    }}>
      <div style={{ fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{
          fontSize: 20, fontWeight: 700, color,
          background: bg, borderRadius: bg ? 6 : 0,
          padding: bg ? '2px 8px' : 0,
          wordBreak: 'break-all',
        }}>
          {value}
        </span>
        {sub && <span style={{ fontSize: 12, color: colors.textSub }}>{sub}</span>}
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
