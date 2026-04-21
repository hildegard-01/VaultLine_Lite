/**
 * FileRightPanelV2 — V2 인라인 스타일 우측 패널 (320px)
 *
 * 역할: 파일 탐색기 우측 패널. 파일 선택 시 와이어 섹션 3 기준 5섹션을 표시하고,
 *       미선택 시 저장소 현황 4개 메트릭을 표시합니다.
 * 구성: FileRightPanelV2 (메인) / Section / MetaRow / TagChips / 태그 attach/detach 로직
 */

import { useState, type CSSProperties, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { invoke } from '@renderer/services/ipcClient';
import { FileIcon } from '@renderer/components/shared/FileIcon';
import { colors, layout } from '@renderer/design/theme';
import type { FileEntry, CommitLogEntry, Tag } from '@shared/types/ipc';

interface FileRightPanelV2Props {
  file: FileEntry | null;
  repoId?: number;
  recentCommits?: CommitLogEntry[];
  repoStats?: { fileCount: number; totalSize: number; revisions: number };
  onLockToggle?: (file: FileEntry) => void;
  onShare?: (file: FileEntry) => void;
  onDelete?: (file: FileEntry) => void;
  onPreview?: (file: FileEntry) => void;
  onRestoreVersion?: (file: FileEntry, revision: number) => void;
  onClearSelection?: () => void;
  onTagsChanged?: () => void;
  onDetail?: (file: FileEntry) => void;
  onUploadNewVersion?: (file: FileEntry) => void;
}

function formatSize(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
}
function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  const diffMin = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diffMin < 1) return '방금';
  if (diffMin < 60) return `${diffMin}분 전`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}일 전`;
  return date.toLocaleDateString('ko-KR');
}

const asideStyle: CSSProperties = {
  width: layout.rightPanelWidth,
  minWidth: layout.rightPanelWidth,
  borderLeft: `1px solid ${colors.border}`,
  background: colors.bgSecondary,
  overflowY: 'auto',
  padding: 16,
  boxSizing: 'border-box',
};

const sectionStyle: CSSProperties = {
  background: colors.bgPrimary,
  border: `1px solid ${colors.border}`,
  borderRadius: 6,
  padding: 12,
  marginBottom: 12,
};

const sectionTitleStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: colors.textMuted,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  marginBottom: 8,
};

const metaRowStyle: CSSProperties = {
  fontSize: 11,
  color: colors.textSub,
  marginBottom: 4,
  display: 'flex',
  justifyContent: 'space-between',
};

const btnStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
  padding: '6px 10px',
  fontSize: 11,
  fontWeight: 600,
  borderRadius: 4,
  cursor: 'pointer',
  border: `1px solid ${colors.border}`,
  background: colors.bgPrimary,
  color: colors.text,
  lineHeight: 1,
};

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div style={sectionStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={sectionTitleStyle}>{title}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

export function FileRightPanelV2({
  file, repoId, recentCommits = [], repoStats,
  onLockToggle, onShare, onDelete, onPreview, onRestoreVersion,
  onClearSelection, onTagsChanged, onDetail, onUploadNewVersion,
}: FileRightPanelV2Props): React.JSX.Element {
  const [showTagPicker, setShowTagPicker] = useState(false);

  const { data: fileTags = [], refetch: refetchFileTags } = useQuery({
    queryKey: ['tag:file-tags', repoId, file?.path],
    queryFn: () => invoke('tag:file-tags', { repoId: repoId!, filePath: file!.path }),
    enabled: !!repoId && !!file && file.type === 'file',
  });

  const { data: allTags = [] } = useQuery({
    queryKey: ['tag:list'],
    queryFn: () => invoke('tag:list'),
    enabled: showTagPicker,
  });

  const handleAttach = async (tag: Tag) => {
    if (!repoId || !file) return;
    try {
      await invoke('tag:attach', { repoId, filePath: file.path, tagId: tag.id });
      refetchFileTags();
      setShowTagPicker(false);
      onTagsChanged?.();
    } catch { /* 무시 */ }
  };
  const handleDetach = async (tag: Tag) => {
    if (!repoId || !file) return;
    try {
      await invoke('tag:detach', { repoId, filePath: file.path, tagId: tag.id });
      refetchFileTags();
      onTagsChanged?.();
    } catch { /* 무시 */ }
  };

  // ─── 파일 미선택: 저장소 현황 ───
  if (!file) {
    return (
      <aside style={asideStyle}>
        <div style={sectionTitleStyle}>저장소 현황</div>
        {repoStats ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { label: '파일', value: `${repoStats.fileCount}개` },
              { label: '리비전', value: `r.${repoStats.revisions}` },
              { label: '크기', value: formatSize(repoStats.totalSize) },
              { label: '보호됨', value: '—' },
            ].map(m => (
              <div key={m.label} style={{
                padding: 10, background: colors.bgPrimary, borderRadius: 6,
                border: `1px solid ${colors.border}`,
              }}>
                <div style={{ fontSize: 10, color: colors.textMuted }}>{m.label}</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2, color: colors.text }}>{m.value}</div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: 11, color: colors.textMuted }}>저장소를 선택하세요</p>
        )}
      </aside>
    );
  }

  const isFile = file.type === 'file';

  return (
    <aside style={asideStyle}>
      <button
        onClick={onClearSelection}
        style={{
          background: 'transparent', border: 'none', color: colors.textSub,
          fontSize: 11, cursor: 'pointer', padding: 0, marginBottom: 12,
        }}
      >
        ← 저장소 현황
      </button>

      {/* 1. 선택 파일 */}
      <Section title="선택 파일">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <FileIcon type={file.type} name={file.name} size={24} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: colors.text, wordBreak: 'break-all' }}>{file.name}</div>
            <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
              {isFile ? formatSize(file.size) : '폴더'} · {formatDate(file.date)}
            </div>
          </div>
        </div>
        {isFile && onUploadNewVersion && (
          <button
            onClick={() => onUploadNewVersion(file)}
            style={{ ...btnStyle, width: '100%', background: colors.navy, color: '#fff', borderColor: colors.navy }}
          >
            새 버전 업로드
          </button>
        )}
      </Section>

      {/* 2. 메타데이터 + 태그 */}
      <Section
        title="메타데이터"
        action={isFile && (
          <button
            onClick={() => setShowTagPicker(v => !v)}
            style={{ background: 'transparent', border: 'none', color: colors.blue, fontSize: 10, cursor: 'pointer' }}
          >
            + 태그
          </button>
        )}
      >
        <div style={metaRowStyle}>
          <span>크기</span>
          <span>{isFile ? formatSize(file.size) : '—'}</span>
        </div>
        <div style={metaRowStyle}>
          <span>리비전</span>
          <span>{file.revision ? `r${file.revision}` : '—'}</span>
        </div>
        {file.locked && (
          <div style={metaRowStyle}>
            <span>잠금</span>
            <span style={{ color: colors.purple }}>🔒 보호 잠금</span>
          </div>
        )}
        {/* 태그 */}
        {isFile && showTagPicker && (
          <div style={{
            marginTop: 8, padding: 8, background: colors.bgSecondary,
            borderRadius: 4, border: `1px solid ${colors.border}`,
          }}>
            {allTags.length === 0 ? (
              <p style={{ fontSize: 11, color: colors.textMuted, margin: 0 }}>태그가 없습니다</p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {allTags.filter(t => !fileTags.some(ft => ft.id === t.id)).map(tag => (
                  <button
                    key={tag.id}
                    onClick={() => handleAttach(tag)}
                    style={{
                      padding: '2px 6px', fontSize: 10, fontWeight: 600,
                      background: tag.color + '20', color: tag.color,
                      border: `1px solid ${tag.color}40`, borderRadius: 3, cursor: 'pointer',
                    }}
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {isFile && fileTags.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {fileTags.map(tag => (
              <span
                key={tag.id}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 2,
                  padding: '2px 6px', fontSize: 10, fontWeight: 600,
                  background: tag.color + '20', color: tag.color, borderRadius: 3,
                }}
              >
                {tag.name}
                <button
                  onClick={() => handleDetach(tag)}
                  style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 10, padding: 0 }}
                >✕</button>
              </span>
            ))}
          </div>
        )}
      </Section>

      {/* 3. 버전 이력 */}
      {isFile && (
        <Section
          title="버전 이력"
          action={onDetail && (
            <button
              onClick={() => onDetail(file)}
              style={{ background: 'transparent', border: 'none', color: colors.blue, fontSize: 10, cursor: 'pointer' }}
            >
              전체 보기 →
            </button>
          )}
        >
          {recentCommits.length > 0 ? recentCommits.slice(0, 5).map((c, i) => (
            <div key={c.revision} style={{
              padding: '6px 0',
              borderBottom: i < Math.min(recentCommits.length, 5) - 1 ? `1px solid ${colors.borderLight}` : 'none',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: colors.blue }}>r.{c.revision}</span>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 10, color: colors.textMuted }}>{formatDate(c.date)}</span>
                  <button
                    onClick={() => onRestoreVersion?.(file, c.revision)}
                    style={{
                      padding: '2px 6px', fontSize: 10, fontWeight: 600,
                      border: `1px solid ${colors.orangeBg}`, color: colors.orange,
                      background: 'transparent', borderRadius: 3, cursor: 'pointer',
                    }}
                  >
                    복원
                  </button>
                </div>
              </div>
              <div style={{ fontSize: 11, color: colors.textSub, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.message}
              </div>
            </div>
          )) : (
            <p style={{ fontSize: 11, color: colors.textMuted, margin: 0 }}>커밋 이력이 없습니다</p>
          )}
        </Section>
      )}

      {/* 4. 공유 */}
      {isFile && (
        <Section title="공유">
          <p style={{ fontSize: 11, color: colors.textMuted, margin: '0 0 6px' }}>
            ZIP 내보내기, 임시 공유 서버, P2P 공유를 지원합니다.
          </p>
          <button
            onClick={() => onShare?.(file)}
            style={{ ...btnStyle, width: '100%' }}
          >
            공유 관리
          </button>
        </Section>
      )}

      {/* 5. 작업 */}
      <Section title="작업">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {isFile && onDetail && (
            <button
              onClick={() => onDetail(file)}
              style={{ ...btnStyle, borderColor: colors.blueBg, color: colors.blue }}
            >
              상세보기
            </button>
          )}
          {isFile && (
            <button onClick={() => onPreview?.(file)} style={btnStyle}>미리보기</button>
          )}
          {isFile && (
            <button
              onClick={() => onLockToggle?.(file)}
              style={{ ...btnStyle, borderColor: file.locked ? colors.purpleBg : colors.border, color: file.locked ? colors.purple : colors.text }}
            >
              {file.locked ? '잠금 해제' : '보호 잠금'}
            </button>
          )}
          <button
            onClick={() => onDelete?.(file)}
            style={{ ...btnStyle, borderColor: colors.redBg, color: colors.red }}
          >
            삭제
          </button>
        </div>
      </Section>
    </aside>
  );
}
