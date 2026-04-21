/**
 * AdminSidebarV2 — 관리자 모드 전용 사이드바 (220px)
 *
 * 역할: /admin/* 경로 진입 시 ShellV2가 SidebarV2 대신 이 컴포넌트를 렌더합니다.
 *       상단에 "← 파일로 돌아가기" 버튼 + 3섹션(관리/설정/모니터링) 메뉴를 표시합니다.
 * 구성: AdminSidebarV2 (메인) / Section / Item — 와이어프레임 섹션 4의 관리자 사이드바를 그대로 따름
 */

import { type CSSProperties, type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { colors, layout, fontFamily } from '@renderer/design/theme';

interface ItemDef {
  path: string;
  label: string;
  icon: string;
}

interface SectionDef {
  title: string;
  items: ItemDef[];
}

const SECTIONS: SectionDef[] = [
  {
    title: '관리',
    items: [
      { path: '/admin',            label: '대시보드',   icon: '⊞' },
      { path: '/admin/users',      label: '사용자',     icon: '👥' },
      { path: '/admin/groups',     label: '그룹',       icon: '⊟' },
      { path: '/admin/repos',      label: '저장소',     icon: '🗄' },
    ],
  },
  {
    title: '설정',
    items: [
      { path: '/admin/settings',         label: '일반설정',   icon: '⚙' },
      { path: '/admin/approval-rules',   label: '승인규칙',   icon: '✓' },
    ],
  },
  {
    title: '모니터링',
    items: [
      { path: '/admin/activity-log', label: '활동 로그',  icon: '📊' },
      { path: '/admin/system',       label: '시스템',     icon: '🛡' },
      { path: '/admin/backup',       label: '백업',       icon: '💾' },
    ],
  },
];

/* 스타일 */
const sidebarStyle: CSSProperties = {
  width: layout.sidebarWidth,
  height: '100%',
  background: colors.bgPrimary,
  borderRight: '1px solid #e8eaed',
  display: 'flex',
  flexDirection: 'column',
  flexShrink: 0,
  overflowY: 'auto',
  fontFamily,
};

const backBtnStyle: CSSProperties = {
  margin: '12px',
  padding: '8px 12px',
  background: '#f0f4ff',
  borderRadius: 6,
  color: colors.navy,
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  border: 'none',
  textAlign: 'left',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
};

const sectionTitleStyle: CSSProperties = {
  padding: '8px 16px 4px',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  color: colors.textMuted,
};

function Item({
  def, active, onClick,
}: { def: ItemDef; active: boolean; onClick: () => void }) {
  const style: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '7px 16px',
    fontSize: 13,
    color: active ? colors.navy : colors.textSub,
    fontWeight: active ? 600 : 400,
    background: active ? '#e8f4fd' : 'transparent',
    borderRight: active ? `3px solid ${colors.navy}` : '3px solid transparent',
    cursor: 'pointer',
    userSelect: 'none',
    transition: 'background 0.15s',
  };

  return (
    <div
      style={style}
      onClick={onClick}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = '#f5f7fa'; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >
      <span style={{ flexShrink: 0, width: 16, textAlign: 'center' }}>{def.icon}</span>
      <span>{def.label}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div style={sectionTitleStyle}>{title}</div>
      <div>{children}</div>
    </div>
  );
}

export default function AdminSidebarV2(): React.JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string): boolean => {
    if (path === '/admin') return location.pathname === '/admin';
    return location.pathname.startsWith(path);
  };

  return (
    <aside style={sidebarStyle}>
      <button style={backBtnStyle} onClick={() => navigate('/')}>
        ← 파일로 돌아가기
      </button>

      {SECTIONS.map((sec) => (
        <Section key={sec.title} title={sec.title}>
          {sec.items.map((item) => (
            <Item
              key={item.path}
              def={item}
              active={isActive(item.path)}
              onClick={() => navigate(item.path)}
            />
          ))}
        </Section>
      ))}
    </aside>
  );
}
