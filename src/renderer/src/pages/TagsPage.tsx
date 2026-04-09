/**
 * 태그 관리 페이지
 *
 * 역할: 전체 태그 목록과 태그별 파일 목록을 표시합니다.
 *       태그 선택 시 해당 태그가 부착된 파일 목록을 로드합니다.
 */

import { useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@renderer/services/ipcClient';
import { colors, fontFamily } from '@renderer/design/theme';
import { Tag as TagIcon, X } from '@renderer/design/Icons';
import { getFileIcon } from './file-detail/FileDetailPage';
import type { Tag } from '@shared/types/ipc';

/* ────────────────────── 스타일 ────────────────────── */

const S: Record<string, CSSProperties> = {
  page: { display: 'flex', flex: 1, overflow: 'hidden', fontFamily },
  leftPanel: {
    width: 240, flexShrink: 0, borderRight: `1px solid ${colors.borderLight}`,
    overflowY: 'auto', padding: '20px 0',
  },
  title: { fontSize: 16, fontWeight: 600, color: colors.text, padding: '0 16px 16px', display: 'flex', alignItems: 'center', gap: 8 },
  tagItem: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 16px', cursor: 'pointer', transition: 'background 0.15s',
    fontSize: 13,
  },
  tagDot: { width: 10, height: 10, borderRadius: 3, flexShrink: 0 },
  tagCount: { marginLeft: 'auto', fontSize: 11, color: colors.textMuted },
  rightPanel: { flex: 1, overflowY: 'auto', padding: 24 },
  fileItem: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '10px 14px', borderRadius: 8,
    cursor: 'pointer', transition: 'background 0.15s',
  },
  fileName: { fontSize: 13, fontWeight: 500, color: colors.text },
  fileMeta: { fontSize: 11, color: colors.textMuted },
  empty: { textAlign: 'center', padding: 60, color: colors.textMuted, fontSize: 14 },
  deleteBtn: { background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', opacity: 0 },
};

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

/* ────────────────────── 컴포넌트 ────────────────────── */

export function TagsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedTag, setSelectedTag] = useState<Tag | null>(null);

  const { data: tags = [] } = useQuery({
    queryKey: ['tag:list'],
    queryFn: () => invoke('tag:list'),
  });

  const { data: tagFiles = [], isLoading: filesLoading } = useQuery({
    queryKey: ['tag:files', selectedTag?.id],
    queryFn: () => invoke('tag:files', { tagId: selectedTag!.id }),
    enabled: !!selectedTag,
  });

  const tagList = tags as Tag[];
  const files = tagFiles as Array<{ repoId: number; repoName: string; filePath: string; fileSize: number; modifiedAt: string }>;

  const handleDeleteTag = async (e: React.MouseEvent, tag: Tag) => {
    e.stopPropagation();
    if (!window.confirm(`"${tag.name}" 태그를 삭제하시겠습니까?`)) return;
    try {
      await invoke('tag:delete', { id: tag.id });
      queryClient.invalidateQueries({ queryKey: ['tag:list'] });
      if (selectedTag?.id === tag.id) setSelectedTag(null);
    } catch { /* 무시 */ }
  };

  const handleFileClick = (file: typeof files[0]) => {
    const parts = file.filePath.split('/');
    parts.pop();
    const parentPath = parts.join('/');
    navigate(`/repo/${file.repoId}`, {
      state: { navigateTo: parentPath, selectFile: file.filePath, ts: Date.now() },
    });
  };

  return (
    <div style={S.page}>
      {/* 좌측: 태그 목록 */}
      <div style={S.leftPanel}>
        <div style={S.title}>
          <TagIcon width={18} height={18} color={colors.navy} />
          태그 ({tagList.length})
        </div>
        {tagList.length === 0 && (
          <div style={{ ...S.empty, padding: 30 }}>태그가 없습니다.</div>
        )}
        {tagList.map((tag) => {
          const active = selectedTag?.id === tag.id;
          return (
            <div
              key={tag.id}
              style={{
                ...S.tagItem,
                background: active ? `${tag.color || colors.blue}12` : 'transparent',
                color: active ? colors.text : colors.textSub,
                fontWeight: active ? 600 : 400,
                borderRight: active ? `3px solid ${tag.color || colors.blue}` : '3px solid transparent',
              }}
              onClick={() => setSelectedTag(tag)}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = colors.bgSecondary; }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = active ? `${tag.color || colors.blue}12` : 'transparent'; }}
            >
              <div style={{ ...S.tagDot, background: tag.color || colors.blue }} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tag.name}</span>
              <button
                style={S.deleteBtn}
                onClick={(e) => handleDeleteTag(e, tag)}
                title="태그 삭제"
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '0'; }}
              >
                <X width={12} height={12} color={colors.red} />
              </button>
            </div>
          );
        })}
      </div>

      {/* 우측: 파일 목록 */}
      <div style={S.rightPanel}>
        {!selectedTag && (
          <div style={S.empty}>
            <TagIcon width={32} height={32} color={colors.textMuted} style={{ margin: '0 auto 12px', display: 'block' }} />
            좌측에서 태그를 선택하세요.
          </div>
        )}

        {selectedTag && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 12, height: 12, borderRadius: 3, background: selectedTag.color || colors.blue }} />
              <span style={{ fontSize: 16, fontWeight: 600, color: colors.text }}>{selectedTag.name}</span>
              <span style={{ fontSize: 13, color: colors.textMuted }}>({files.length}개 파일)</span>
            </div>

            {filesLoading && <div style={S.empty}>파일 목록을 불러오는 중...</div>}

            {!filesLoading && files.length === 0 && (
              <div style={S.empty}>이 태그가 부착된 파일이 없습니다.</div>
            )}

            {!filesLoading && files.map((file, i) => {
              const fileName = file.filePath.split('/').pop() || file.filePath;
              return (
                <div
                  key={i}
                  style={S.fileItem}
                  onClick={() => handleFileClick(file)}
                  onMouseEnter={(e) => { e.currentTarget.style.background = colors.bgSecondary; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  {getFileIcon(fileName, 18)}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={S.fileName}>{fileName}</div>
                    <div style={S.fileMeta}>
                      {file.repoName} · {file.filePath} · {formatSize(file.fileSize)}
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
