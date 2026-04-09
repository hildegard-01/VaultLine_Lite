/**
 * 우측 메타데이터 패널
 *
 * 역할: 파일 상세 정보, 상태, 태그, 빠른 탭 이동을 우측 260px 패널에 표시합니다.
 */

import { type CSSProperties } from 'react';
import { colors, fontFamily } from '@renderer/design/theme';
import { ChevronRight } from '@renderer/design/Icons';
import type { FileEntry, Tag } from '@shared/types/ipc';
import type { TabId } from './FileDetailPage';

interface MetadataPanelProps {
  info: FileEntry;
  fileName: string;
  tags: Tag[];
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

/* ────────────────────── 유틸 ────────────────────── */

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

/* ────────────────────── 스타일 ────────────────────── */

const S: Record<string, CSSProperties> = {
  panel: {
    width: 260,
    background: colors.bgPrimary,
    borderLeft: `1px solid ${colors.borderLight}`,
    overflowY: 'auto',
    flexShrink: 0,
    fontFamily,
    fontSize: 13,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: colors.textMuted,
    padding: '14px 16px 6px',
    borderBottom: `1px solid ${colors.borderLight}`,
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '6px 16px',
    fontSize: 12,
  },
  label: {
    color: colors.textMuted,
  },
  value: {
    color: colors.text,
    fontWeight: 500,
    maxWidth: 140,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    textAlign: 'right',
  },
  tagList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    padding: '8px 16px',
  },
  tagPill: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 10,
    fontSize: 11,
    fontWeight: 500,
  },
  navBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '8px 16px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 13,
    textAlign: 'left',
    transition: 'background 0.15s',
  },
};

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'preview', label: '미리보기' },
  { id: 'history', label: '커밋 이력' },
  { id: 'diff', label: 'Diff' },
  { id: 'approval', label: '결재' },
  { id: 'tag', label: '태그' },
];

/* ────────────────────── MetaRow ────────────────────── */

function MetaRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={S.row}>
      <span style={S.label}>{label}</span>
      <span style={{ ...S.value, color: valueColor || colors.text }} title={value}>{value}</span>
    </div>
  );
}

/* ────────────────────── 컴포넌트 ────────────────────── */

export default function MetadataPanel({ info, fileName, tags, activeTab, onTabChange }: MetadataPanelProps) {
  const ext = fileName.split('.').pop()?.toUpperCase() || '-';

  return (
    <aside style={S.panel}>
      {/* 파일 정보 */}
      <div style={S.sectionTitle}>파일 정보</div>
      <div style={{ padding: '4px 0 8px' }}>
        <MetaRow label="파일명" value={fileName} />
        <MetaRow label="형식" value={ext} />
        <MetaRow label="크기" value={formatFileSize(info.size)} />
        <MetaRow label="리비전" value={`r.${info.revision}`} />
        <MetaRow label="작성자" value={info.author || '-'} />
        <MetaRow label="수정일" value={info.date ? new Date(info.date).toLocaleDateString('ko-KR') : '-'} />
      </div>

      {/* 상태 */}
      <div style={S.sectionTitle}>상태</div>
      <div style={{ padding: '4px 0 8px' }}>
        <MetaRow
          label="잠금"
          value={info.locked ? (info.lockOwner || '잠금됨') : '없음'}
          valueColor={info.locked ? colors.orange : undefined}
        />
      </div>

      {/* 태그 */}
      <div style={S.sectionTitle}>태그</div>
      <div style={S.tagList}>
        {tags.length === 0 ? (
          <span style={{ fontSize: 12, color: colors.textMuted }}>태그 없음</span>
        ) : (
          tags.map((tag) => (
            <span
              key={tag.id}
              style={{
                ...S.tagPill,
                background: `${tag.color || colors.blue}18`,
                color: tag.color || colors.blue,
              }}
            >
              {tag.name}
            </span>
          ))
        )}
      </div>

      {/* 빠른 이동 */}
      <div style={S.sectionTitle}>빠른 이동</div>
      <div style={{ padding: '4px 0' }}>
        {TABS.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              style={{
                ...S.navBtn,
                background: active ? colors.navy + '10' : 'transparent',
                color: active ? colors.navy : colors.textSub,
                fontWeight: active ? 600 : 400,
              }}
              onClick={() => onTabChange(tab.id)}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = colors.bgSecondary; }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = active ? colors.navy + '10' : 'transparent'; }}
            >
              <ChevronRight width={12} height={12} color={active ? colors.navy : colors.textMuted} />
              {tab.label}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
