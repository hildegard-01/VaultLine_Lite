/**
 * 즐겨찾기 페이지
 *
 * 역할: 전체 즐겨찾기 목록을 저장소별로 그룹화하여 표시합니다.
 *       클릭 시 해당 파일 위치로 이동합니다.
 */

import { type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@renderer/services/ipcClient';
import { colors, fontFamily } from '@renderer/design/theme';
import { Star, Folder as FolderIcon, X } from '@renderer/design/Icons';
import { getFileIcon } from './file-detail/FileDetailPage';

/* ────────────────────── 스타일 ────────────────────── */

const S: Record<string, CSSProperties> = {
  page: { padding: 24, fontFamily, overflow: 'auto', flex: 1 },
  title: { fontSize: 18, fontWeight: 600, color: colors.text, display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 },
  group: { marginBottom: 24 },
  groupTitle: { fontSize: 13, fontWeight: 600, color: colors.textSub, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
  item: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '10px 14px', borderRadius: 8,
    cursor: 'pointer', transition: 'background 0.15s',
  },
  fileName: { fontSize: 13, fontWeight: 500, color: colors.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  filePath: { fontSize: 11, color: colors.textMuted },
  removeBtn: { background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', opacity: 0.4 },
  empty: { textAlign: 'center', padding: 60, color: colors.textMuted, fontSize: 14 },
};

/* ────────────────────── 컴포넌트 ────────────────────── */

export function BookmarksPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: bookmarks = [], isLoading } = useQuery({
    queryKey: ['bookmark:list'],
    queryFn: () => invoke('bookmark:list'),
  });

  const { data: repos = [] } = useQuery({
    queryKey: ['repo:list'],
    queryFn: () => invoke('repo:list'),
  });

  const items = bookmarks as Array<{ id: number; repoId: number; filePath: string; alias: string | null; createdAt: string }>;
  const repoMap = new Map((repos as Array<{ id: number; name: string }>).map(r => [r.id, r.name]));

  /* 저장소별 그룹화 */
  const groups = new Map<number, typeof items>();
  for (const item of items) {
    const group = groups.get(item.repoId) || [];
    group.push(item);
    groups.set(item.repoId, group);
  }

  const handleClick = (b: typeof items[0]) => {
    const parts = b.filePath.split('/');
    parts.pop();
    const parentPath = parts.join('/');
    navigate(`/repo/${b.repoId}`, {
      state: { navigateTo: parentPath, selectFile: b.filePath, ts: Date.now() },
    });
  };

  const handleRemove = async (e: React.MouseEvent, b: typeof items[0]) => {
    e.stopPropagation();
    try {
      await invoke('bookmark:toggle', { repoId: b.repoId, filePath: b.filePath });
      queryClient.invalidateQueries({ queryKey: ['bookmark:list'] });
    } catch { /* 무시 */ }
  };

  return (
    <div style={S.page}>
      <div style={S.title}>
        <Star width={20} height={20} color="#F59E0B" filled />
        즐겨찾기
        {items.length > 0 && <span style={{ fontSize: 13, fontWeight: 400, color: colors.textMuted }}>({items.length})</span>}
      </div>

      {isLoading && <div style={S.empty}>불러오는 중...</div>}

      {!isLoading && items.length === 0 && (
        <div style={S.empty}>
          <Star width={32} height={32} color={colors.textMuted} style={{ margin: '0 auto 12px', display: 'block' }} />
          즐겨찾기한 파일이 없습니다.
        </div>
      )}

      {!isLoading && Array.from(groups.entries()).map(([repoId, group]) => (
        <div key={repoId} style={S.group}>
          <div style={S.groupTitle}>
            <FolderIcon width={16} height={16} />
            {repoMap.get(repoId) || `저장소 #${repoId}`}
          </div>
          {group.map((b) => {
            const fileName = b.filePath.split('/').pop() || b.filePath;
            return (
              <div
                key={b.id}
                style={S.item}
                onClick={() => handleClick(b)}
                onMouseEnter={(e) => { e.currentTarget.style.background = colors.bgSecondary; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                {getFileIcon(fileName, 18)}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={S.fileName}>{fileName}</div>
                  <div style={S.filePath}>{b.filePath}</div>
                </div>
                <button
                  style={S.removeBtn}
                  onClick={(e) => handleRemove(e, b)}
                  title="즐겨찾기 해제"
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.4'; }}
                >
                  <X width={14} height={14} color={colors.red} />
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
