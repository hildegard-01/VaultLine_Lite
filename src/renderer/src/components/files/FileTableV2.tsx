/**
 * FileTableV2 — V2 인라인 스타일 파일 테이블
 *
 * 역할: 와이어프레임 섹션 3 기준의 7컬럼 파일 테이블
 *       (체크박스 / ★북마크 / 이름+칩 / 크기 / 리비전 / 수정일 / ⋮)
 *       + 드래그앤드롭 OUT(앱→외부) + 내부이동(폴더에 드롭) 지원
 * 구성: FileTableV2 (메인) / formatSize / formatDate / 정렬 + 칩(잠금/태그) 렌더
 */

import { useState, useCallback, useMemo, type CSSProperties } from 'react';
import { FileIcon } from '@renderer/components/shared/FileIcon';
import { colors } from '@renderer/design/theme';
import type { FileEntry } from '@shared/types/ipc';

interface FileTableV2Props {
  files: FileEntry[];
  selectedFile: FileEntry | null;
  onSelect: (file: FileEntry) => void;
  onDoubleClick: (file: FileEntry) => void;
  onDragExport?: (file: FileEntry) => void;
  onMoveToFolder?: (srcFile: FileEntry, destFolder: FileEntry) => void;
  onBookmarkToggle?: (file: FileEntry) => void;
  bookmarkedPaths?: Set<string>;
  fileTagsMap?: Map<string, Array<{ name: string; color: string }>>;
  modifiedPaths?: Set<string>;
  checkedPaths?: Set<string>;
  onCheckedChange?: (paths: Set<string>) => void;
}

type SortKey = 'name' | 'size' | 'date' | 'revision';
type SortDir = 'asc' | 'desc';

function formatSize(bytes: number): string {
  if (!bytes) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (diffMin < 1) return '방금';
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}일 전`;
  return date.toLocaleDateString('ko-KR');
}

const thStyle: CSSProperties = {
  padding: '10px 8px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 700,
  color: colors.textMuted,
  textTransform: 'uppercase',
  letterSpacing: '0.3px',
  borderBottom: `2px solid ${colors.border}`,
  background: colors.bgSecondary,
  cursor: 'default',
  userSelect: 'none',
};

const tdBase: CSSProperties = {
  padding: '10px 8px',
  fontSize: 12,
  color: colors.text,
  borderBottom: `1px solid ${colors.borderLight}`,
};

export function FileTableV2({
  files, selectedFile, onSelect, onDoubleClick,
  onDragExport, onMoveToFolder, onBookmarkToggle,
  bookmarkedPaths = new Set(), fileTagsMap = new Map(),
  modifiedPaths = new Set(), checkedPaths, onCheckedChange,
}: FileTableV2Props): React.JSX.Element {
  const [internalChecked, setInternalChecked] = useState<Set<string>>(new Set());
  const checked = checkedPaths ?? internalChecked;
  const setChecked = onCheckedChange ?? setInternalChecked;

  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const sortedFiles = useMemo(() => {
    const sorted = [...files].sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      let cmp = 0;
      switch (sortKey) {
        case 'name': cmp = a.name.localeCompare(b.name, 'ko'); break;
        case 'size': cmp = a.size - b.size; break;
        case 'date': cmp = new Date(a.date).getTime() - new Date(b.date).getTime(); break;
        case 'revision': cmp = (a.revision ?? 0) - (b.revision ?? 0); break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [files, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const indicator = (key: SortKey) => sortKey !== key ? '' : sortDir === 'asc' ? ' ▲' : ' ▼';

  const toggleCheck = (path: string) => {
    const next = new Set(checked);
    next.has(path) ? next.delete(path) : next.add(path);
    setChecked(next);
  };
  const toggleAll = () => {
    if (checked.size === sortedFiles.length) setChecked(new Set());
    else setChecked(new Set(sortedFiles.map(f => f.path)));
  };
  const allChecked = sortedFiles.length > 0 && checked.size === sortedFiles.length;

  // 드래그 시작 (OUT + 내부 이동)
  const handleDragStart = useCallback((e: React.DragEvent, file: FileEntry) => {
    e.dataTransfer.setData('application/vaultline-file', JSON.stringify({
      path: file.path, name: file.name, type: file.type,
    }));
    e.dataTransfer.effectAllowed = 'copyMove';
    if (file.type === 'file' && onDragExport) onDragExport(file);
  }, [onDragExport]);

  const handleDragOverRow = useCallback((e: React.DragEvent, file: FileEntry) => {
    if (file.type !== 'dir') return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget(file.path);
  }, []);

  const handleDragLeave = useCallback(() => setDropTarget(null), []);

  const handleDropRow = useCallback((e: React.DragEvent, destFolder: FileEntry) => {
    e.preventDefault();
    setDropTarget(null);
    if (destFolder.type !== 'dir') return;
    const data = e.dataTransfer.getData('application/vaultline-file');
    if (!data) return;
    try {
      const src = JSON.parse(data) as { path: string; name: string; type: string };
      if (src.path === destFolder.path) return;
      onMoveToFolder?.(src as FileEntry, destFolder);
    } catch { /* 무시 */ }
  }, [onMoveToFolder]);

  return (
    <div style={{ flex: 1, overflow: 'auto', background: colors.bgPrimary }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, width: 36, textAlign: 'center' }}>
              <input type="checkbox" checked={allChecked} onChange={toggleAll} style={{ accentColor: colors.navy }} />
            </th>
            <th style={{ ...thStyle, width: 28, textAlign: 'center' }}>★</th>
            <th style={{ ...thStyle, cursor: 'pointer' }} onClick={() => handleSort('name')}>이름{indicator('name')}</th>
            <th style={{ ...thStyle, width: 80, textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSort('size')}>크기{indicator('size')}</th>
            <th style={{ ...thStyle, width: 70, textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSort('revision')}>리비전{indicator('revision')}</th>
            <th style={{ ...thStyle, width: 100, textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSort('date')}>최종 수정{indicator('date')}</th>
            <th style={{ ...thStyle, width: 36, textAlign: 'center' }}></th>
          </tr>
        </thead>
        <tbody>
          {sortedFiles.map(file => {
            const isSelected = selectedFile?.path === file.path;
            const isDrop = dropTarget === file.path;
            const tags = fileTagsMap.get(file.path);
            const isBookmarked = bookmarkedPaths.has(file.path);
            const isModified = modifiedPaths.has(file.path);

            const rowBg = isDrop
              ? colors.blueBg
              : isSelected ? colors.blueBg
              : 'transparent';

            return (
              <tr
                key={file.path}
                draggable
                onClick={() => onSelect(file)}
                onDoubleClick={() => onDoubleClick(file)}
                onDragStart={(e) => handleDragStart(e, file)}
                onDragOver={(e) => handleDragOverRow(e, file)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDropRow(e, file)}
                style={{
                  background: rowBg,
                  cursor: 'pointer',
                  outline: isDrop ? `2px solid ${colors.blue}` : 'none',
                  outlineOffset: -2,
                }}
                onMouseEnter={(e) => {
                  if (!isSelected && !isDrop) (e.currentTarget.style.background = colors.bgSecondary);
                }}
                onMouseLeave={(e) => {
                  if (!isSelected && !isDrop) (e.currentTarget.style.background = 'transparent');
                }}
              >
                <td style={{ ...tdBase, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={checked.has(file.path)}
                    onChange={() => toggleCheck(file.path)}
                    onClick={e => e.stopPropagation()}
                    style={{ accentColor: colors.navy }}
                  />
                </td>
                <td style={{ ...tdBase, textAlign: 'center' }}>
                  <span
                    onClick={(e) => { e.stopPropagation(); onBookmarkToggle?.(file); }}
                    style={{
                      cursor: 'pointer',
                      color: isBookmarked ? '#F9A825' : colors.textMuted,
                      fontSize: 14,
                    }}
                  >
                    {isBookmarked ? '★' : '☆'}
                  </span>
                </td>
                <td style={{ ...tdBase }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FileIcon type={file.type} name={file.name} size={18} />
                    <span style={{ fontWeight: 500, fontSize: 13 }}>{file.name}</span>
                    {file.locked && (
                      <span style={chipStyle(colors.purple, colors.purpleBg)}>🔒 보호</span>
                    )}
                    {isModified && (
                      <span style={chipStyle(colors.orange, colors.orangeBg)}>수정됨</span>
                    )}
                    {tags && tags.length > 0 && (
                      <span style={chipStyle(tags[0].color, tags[0].color + '20')}>
                        {tags[0].name}
                        {tags.length > 1 && <span style={{ opacity: 0.6 }}> +{tags.length - 1}</span>}
                      </span>
                    )}
                  </div>
                </td>
                <td style={{ ...tdBase, textAlign: 'right', color: colors.textSub }}>
                  {file.type === 'dir' ? '—' : formatSize(file.size)}
                </td>
                <td style={{ ...tdBase, textAlign: 'right', color: colors.textSub }}>
                  {file.revision ? `r${file.revision}` : '—'}
                </td>
                <td style={{ ...tdBase, textAlign: 'right', color: colors.textSub }}>
                  {formatDate(file.date)}
                </td>
                <td style={{ ...tdBase, textAlign: 'center', color: colors.textMuted, cursor: 'default' }}>
                  ⋮
                </td>
              </tr>
            );
          })}
          {files.length === 0 && (
            <tr>
              <td colSpan={7} style={{ padding: 64, textAlign: 'center', fontSize: 13, color: colors.textMuted }}>
                파일이 없습니다. 파일을 업로드하거나 드래그해 주세요.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function chipStyle(color: string, bg: string): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 2,
    padding: '2px 6px',
    fontSize: 10,
    fontWeight: 600,
    borderRadius: 3,
    background: bg,
    color,
    whiteSpace: 'nowrap',
  };
}
