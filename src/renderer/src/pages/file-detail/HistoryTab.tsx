/**
 * 커밋 이력 탭
 *
 * 역할: 파일의 전체 커밋 이력을 테이블로 표시합니다.
 *       각 리비전에서 이전 버전 복원을 지원합니다.
 */

import { type CSSProperties } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@renderer/services/ipcClient';
import { colors } from '@renderer/design/theme';
import type { CommitLogEntry } from '@shared/types/ipc';

interface HistoryTabProps {
  repoId: number;
  path: string;
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const d = new Date(dateStr).getTime();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return '방금 전';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}일 전`;
  return new Date(dateStr).toLocaleDateString('ko-KR');
}

const S: Record<string, CSSProperties> = {
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
  },
  th: {
    textAlign: 'left',
    padding: '10px 12px',
    fontWeight: 600,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: colors.textMuted,
    borderBottom: `2px solid ${colors.border}`,
  },
  td: {
    padding: '10px 12px',
    borderBottom: `1px solid ${colors.borderLight}`,
    color: colors.text,
  },
  revBadge: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 10,
    background: colors.blueBg,
    color: colors.blue,
    fontSize: 12,
    fontWeight: 600,
  },
  actionBtn: {
    padding: '4px 10px',
    borderRadius: 4,
    border: 'none',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 500,
    marginRight: 6,
  },
  empty: {
    textAlign: 'center',
    padding: 40,
    color: colors.textMuted,
    fontSize: 14,
  },
};

export default function HistoryTab({ repoId, path }: HistoryTabProps) {
  const queryClient = useQueryClient();

  const { data: logs, isLoading, error } = useQuery({
    queryKey: ['commit:log', repoId, path],
    queryFn: () => invoke('commit:log', { repoId, path, limit: 50 }),
  });

  const restoreMutation = useMutation({
    mutationFn: async ({ targetRevision, message }: { targetRevision: number; message: string }) => {
      return invoke('file:restore-version', { repoId, path, targetRevision, commitMessage: message });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commit:log', repoId, path] });
      queryClient.invalidateQueries({ queryKey: ['file:info', repoId, path] });
    },
  });

  const handleRestore = (revision: number) => {
    if (!window.confirm(`리비전 r.${revision}으로 복원하시겠습니까?`)) return;
    const message = window.prompt('커밋 메시지', `r.${revision}으로 복원`) || `r.${revision}으로 복원`;
    restoreMutation.mutate({ targetRevision: revision, message });
  };

  if (isLoading) return <div style={S.empty}>커밋 이력을 불러오는 중...</div>;
  if (error) return <div style={S.empty}>커밋 이력을 불러오지 못했습니다.</div>;

  const entries = (logs || []) as CommitLogEntry[];
  if (entries.length === 0) return <div style={S.empty}>커밋 이력이 없습니다.</div>;

  return (
    <table style={S.table}>
      <thead>
        <tr>
          <th style={S.th}>리비전</th>
          <th style={S.th}>작성자</th>
          <th style={S.th}>메시지</th>
          <th style={S.th}>날짜</th>
          <th style={{ ...S.th, textAlign: 'right' }}>액션</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry, idx) => (
          <tr
            key={entry.revision}
            onMouseEnter={(e) => { e.currentTarget.style.background = colors.bgSecondary; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <td style={S.td}>
              <span style={S.revBadge}>r.{entry.revision}</span>
            </td>
            <td style={S.td}>{entry.author}</td>
            <td style={{ ...S.td, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {entry.message || '-'}
            </td>
            <td style={{ ...S.td, color: colors.textMuted }}>{formatRelativeTime(entry.date)}</td>
            <td style={{ ...S.td, textAlign: 'right' }}>
              {idx > 0 && (
                <button
                  style={{
                    ...S.actionBtn,
                    background: '#FFF8E1',
                    color: colors.orange,
                  }}
                  onClick={() => handleRestore(entry.revision)}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#FFF3E0'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#FFF8E1'; }}
                  disabled={restoreMutation.isPending}
                >
                  복원
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
