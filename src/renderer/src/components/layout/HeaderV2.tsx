/**
 * V2 헤더 컴포넌트 — 52px 높이, 네이비(#1B2A4A) 배경
 *
 * 역할: 상단 고정 헤더. 로고, 브레드크럼, 검색바, 설정 버튼을 표시합니다.
 *       커넥티드 모드에서만 알림벨/사용자 아바타를 추가 표시합니다.
 * 구성: HeaderV2 (메인) / 검색버튼 / 설정버튼 / 커넥티드 전용(벨, 아바타)
 */

import { type CSSProperties } from 'react';
import { APP_NAME } from '@shared/constants';
import { colors, layout, fontFamily } from '@renderer/design/theme';
import { Search as SearchIcon, Settings as SettingsIcon } from '@renderer/design/Icons';
import { useMode } from '@renderer/hooks/useMode';
import { NotificationBell } from '@renderer/components/connected/NotificationBell';

/* ────────────────────── Props ────────────────────── */

interface HeaderV2Props {
  onOpenSettings?: () => void;
  onOpenSearch?: () => void;
  repoName?: string;
  currentPath?: string;
  onNavigate?: (path: string) => void;
}

/* ────────────────────── 스타일 ────────────────────── */

const S: Record<string, CSSProperties> = {
  header: {
    height: layout.headerHeight,
    background: colors.navy,
    display: 'flex',
    alignItems: 'center',
    padding: '0 16px',
    fontFamily,
    flexShrink: 0,
    position: 'relative',
    zIndex: 100,
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontWeight: 700,
    fontSize: 15,
    color: '#fff',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    padding: 0,
    marginRight: 16,
    whiteSpace: 'nowrap',
  },
  logoIcon: {
    width: 26,
    height: 26,
    borderRadius: 6,
    background: 'linear-gradient(135deg, #4ECDC4 0%, #3BAFA8 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontSize: 12,
    fontWeight: 800,
    flexShrink: 0,
  },
  breadcrumb: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    marginLeft: 8,
  },
  breadcrumbSep: {
    color: 'rgba(255,255,255,0.3)',
    flexShrink: 0,
  },
  breadcrumbLink: {
    color: 'rgba(255,255,255,0.7)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    fontSize: 13,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  breadcrumbCurrent: {
    color: '#fff',
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  searchBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '0 12px',
    height: 32,
    borderRadius: 16,
    background: 'rgba(255,255,255,0.08)',
    border: 'none',
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    cursor: 'pointer',
    marginRight: 8,
    minWidth: 160,
  },
  kbd: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 3,
    padding: '1px 5px',
    marginLeft: 'auto',
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.08)',
    border: 'none',
    color: '#fff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  connectionDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    marginLeft: 12,
    flexShrink: 0,
  },
};

/* ────────────────────── 컴포넌트 ────────────────────── */

export default function HeaderV2({
  onOpenSettings,
  onOpenSearch,
  repoName,
  currentPath,
  onNavigate,
}: HeaderV2Props) {
  const { connected } = useMode();

  /* 브레드크럼 세그먼트 */
  const segments: Array<{ label: string; path: string }> = [];
  if (repoName) {
    segments.push({ label: repoName, path: '' });
    if (currentPath) {
      const parts = currentPath.split('/');
      let accum = '';
      for (const part of parts) {
        accum = accum ? `${accum}/${part}` : part;
        segments.push({ label: part, path: accum });
      }
    }
  }

  return (
    <header style={S.header}>
      {/* 로고 */}
      <button
        style={S.logo}
        onClick={() => onNavigate?.('')}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.8'; }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
      >
        <div style={S.logoIcon}>V</div>
        <span>{APP_NAME}</span>
      </button>

      {/* 브레드크럼 */}
      <div style={S.breadcrumb}>
        {segments.length === 0 ? (
          <>
            <span style={{ color: 'rgba(255,255,255,0.7)' }}>저장소</span>
            <span style={S.breadcrumbSep}>/</span>
            <span style={{ color: 'rgba(255,255,255,0.4)' }}>선택하세요</span>
          </>
        ) : (
          segments.map((seg, i) => (
            <span key={seg.path} style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
              {i > 0 && <span style={S.breadcrumbSep}>/</span>}
              {i < segments.length - 1 ? (
                <button
                  style={S.breadcrumbLink}
                  onClick={() => onNavigate?.(seg.path)}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.9)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}
                >
                  {seg.label}
                </button>
              ) : (
                <span style={S.breadcrumbCurrent}>{seg.label}</span>
              )}
            </span>
          ))
        )}
      </div>

      {/* 검색바 */}
      <button
        style={S.searchBtn}
        onClick={onOpenSearch}
        title="검색 (Ctrl+K)"
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
      >
        <SearchIcon width={14} height={14} color="rgba(255,255,255,0.6)" />
        <span>검색...</span>
        <kbd style={S.kbd}>Ctrl+K</kbd>
      </button>

      {/* 커넥티드 모드: 알림벨 */}
      {connected && <NotificationBell />}

      {/* 설정 */}
      <button
        style={S.iconBtn}
        onClick={onOpenSettings}
        title="설정"
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
      >
        <SettingsIcon width={18} height={18} color="#fff" />
      </button>

      {/* 연결 상태 표시 */}
      <div
        style={{
          ...S.connectionDot,
          background: connected ? '#4CAF50' : '#9E9E9E',
        }}
        title={connected ? '서버 연결됨' : '오프라인'}
      />
    </header>
  );
}
