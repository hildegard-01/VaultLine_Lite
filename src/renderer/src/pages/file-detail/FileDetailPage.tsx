/**
 * 파일 상세보기 페이지 — 메인 셸 + 탭바
 *
 * 역할: 파일 헤더(아이콘, 파일명, 메타정보) + 5탭 전환 + 우측 MetadataPanel 조합.
 * 구성: FileDetailPage (메인) / FileHeader / TabBar
 */

import { useState, type CSSProperties } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { invoke } from '@renderer/services/ipcClient';
import { colors, layout, fontFamily } from '@renderer/design/theme';
import {
  PDF, Doc, Excel, Image, DefaultFile, ArrowLeft, Lock,
} from '@renderer/design/Icons';
import type { FileEntry, Tag } from '@shared/types/ipc';

import PreviewTab from './PreviewTab';
import HistoryTab from './HistoryTab';
import DiffTab from './DiffTab';
import ApprovalTab from './ApprovalTab';
import TagTab from './TagTab';
import MetadataPanel from './MetadataPanel';

/* ────────────────────── 탭 정의 ────────────────────── */

export type TabId = 'preview' | 'history' | 'diff' | 'approval' | 'tag';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'preview', label: '미리보기' },
  { id: 'history', label: '커밋 이력' },
  { id: 'diff', label: 'Diff' },
  { id: 'approval', label: '결재' },
  { id: 'tag', label: '태그' },
];

/* ────────────────────── 유틸 ────────────────────── */

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
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

export function getFileIcon(fileName: string, size = 24) {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (ext === 'pdf') return <PDF width={size} height={size} />;
  if (['doc', 'docx', 'hwp', 'hwpx'].includes(ext)) return <Doc width={size} height={size} />;
  if (['xls', 'xlsx', 'csv'].includes(ext)) return <Excel width={size} height={size} />;
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp'].includes(ext)) return <Image width={size} height={size} />;
  return <DefaultFile width={size} height={size} />;
}

/* ────────────────────── 스타일 ────────────────────── */

const S: Record<string, CSSProperties> = {
  page: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
    fontFamily,
  },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  headerBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '16px 24px 12px',
    borderBottom: `1px solid ${colors.borderLight}`,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: layout.radius,
    background: colors.bgSecondary,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  fileName: {
    fontSize: 16,
    fontWeight: 600,
    color: colors.text,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  fileMeta: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  backBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 12px',
    borderRadius: 6,
    background: 'none',
    border: `1px solid ${colors.border}`,
    cursor: 'pointer',
    fontSize: 13,
    color: colors.textSub,
    marginLeft: 'auto',
    flexShrink: 0,
  },
  tabBar: {
    display: 'flex',
    gap: 0,
    padding: '0 24px',
    borderBottom: `1px solid ${colors.borderLight}`,
  },
  tabContent: {
    flex: 1,
    overflow: 'auto',
    padding: 24,
  },
};

/* ────────────────────── FileHeader ────────────────────── */

function FileHeader({
  info,
  fileName,
  onBack,
}: {
  info: FileEntry;
  fileName: string;
  onBack: () => void;
}) {
  return (
    <div style={S.headerBar}>
      <div style={S.iconBox}>{getFileIcon(fileName, 24)}</div>
      <div>
        <div style={S.fileName}>
          {fileName}
          {info.locked && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: colors.orange, fontWeight: 500 }}>
              <Lock width={13} height={13} color={colors.orange} />
              {info.lockOwner || '잠금'}
            </span>
          )}
        </div>
        <div style={S.fileMeta}>
          {info.author} · r.{info.revision} · {formatFileSize(info.size)} · {formatRelativeTime(info.date)}
        </div>
      </div>
      <button
        style={S.backBtn}
        onClick={onBack}
        onMouseEnter={(e) => { e.currentTarget.style.background = colors.bgSecondary; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
      >
        <ArrowLeft width={14} height={14} />
        돌아가기
      </button>
    </div>
  );
}

/* ────────────────────── TabBar ────────────────────── */

function TabBar({ activeTab, onTabChange }: { activeTab: TabId; onTabChange: (t: TabId) => void }) {
  return (
    <div style={S.tabBar}>
      {TABS.map((tab) => {
        const active = tab.id === activeTab;
        const tabStyle: CSSProperties = {
          padding: '10px 18px',
          fontSize: 13,
          fontWeight: active ? 600 : 400,
          color: active ? colors.navy : colors.textSub,
          background: 'none',
          border: 'none',
          borderBottom: active ? `2px solid ${colors.navy}` : '2px solid transparent',
          cursor: 'pointer',
          transition: 'color 0.15s',
        };
        return (
          <button
            key={tab.id}
            style={tabStyle}
            onClick={() => onTabChange(tab.id)}
            onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = colors.text; }}
            onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = colors.textSub; }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/* ────────────────────── FileDetailPage ────────────────────── */

export default function FileDetailPage() {
  const { repoId } = useParams<{ repoId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>('preview');

  const numRepoId = Number(repoId) || 0;
  const filePath = searchParams.get('path') || '';
  const fileName = filePath.split('/').pop() || filePath;

  /* 파일 정보 */
  const { data: fileInfo, isLoading } = useQuery({
    queryKey: ['file:info', numRepoId, filePath],
    queryFn: () => invoke('file:info', { repoId: numRepoId, path: filePath }),
    enabled: numRepoId > 0 && filePath.length > 0,
  });

  /* 파일 태그 */
  const { data: fileTags = [] } = useQuery({
    queryKey: ['tag:file-tags', numRepoId, filePath],
    queryFn: () => invoke('tag:file-tags', { repoId: numRepoId, filePath }),
    enabled: numRepoId > 0 && filePath.length > 0,
  });

  const handleBack = () => {
    const parts = filePath.split('/');
    parts.pop();
    const parentPath = parts.join('/');
    navigate(`/repo/${repoId}`, {
      state: { navigateTo: parentPath, selectFile: filePath, ts: Date.now() },
    });
  };

  if (isLoading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.textMuted }}>
        파일 정보를 불러오는 중...
      </div>
    );
  }

  if (!fileInfo) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: colors.textMuted }}>
        <span style={{ fontSize: 16 }}>파일을 찾을 수 없습니다.</span>
        <button
          onClick={handleBack}
          style={{ padding: '8px 16px', borderRadius: 6, background: colors.navy, color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13 }}
        >
          돌아가기
        </button>
      </div>
    );
  }

  const info = fileInfo as FileEntry;

  return (
    <div style={S.page}>
      {/* 메인 영역 */}
      <div style={S.main}>
        <FileHeader info={info} fileName={fileName} onBack={handleBack} />
        <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
        <div style={S.tabContent}>
          {activeTab === 'preview' && <PreviewTab repoId={numRepoId} path={filePath} fileName={fileName} />}
          {activeTab === 'history' && <HistoryTab repoId={numRepoId} path={filePath} />}
          {activeTab === 'diff' && <DiffTab repoId={numRepoId} path={filePath} />}
          {activeTab === 'approval' && <ApprovalTab />}
          {activeTab === 'tag' && <TagTab repoId={numRepoId} filePath={filePath} />}
        </div>
      </div>

      {/* 우측 메타데이터 패널 */}
      <MetadataPanel
        info={info}
        fileName={fileName}
        tags={fileTags as Tag[]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
    </div>
  );
}
