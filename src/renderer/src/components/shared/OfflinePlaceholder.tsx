/**
 * 서버 전용 기능 — 오프라인 모드 비활성 안내
 *
 * 역할: 커넥티드 모드에서만 사용 가능한 기능에 대해 오프라인 안내를 표시합니다.
 *       커넥티드 모드가 되면 children을 렌더링합니다.
 */

import { type ReactNode } from 'react';
import { colors, fontFamily } from '@renderer/design/theme';
import { useMode } from '@renderer/hooks/useMode';

interface OfflinePlaceholderProps {
  /** 기능 이름 */
  title: string;
  /** 설명 */
  description?: string;
  /** 아이콘 (이모지 또는 컴포넌트) */
  icon?: ReactNode;
  /** 커넥티드 모드일 때 렌더링할 콘텐츠 (Phase C에서 활용) */
  children?: ReactNode;
}

export function OfflinePlaceholder({ title, description, icon, children }: OfflinePlaceholderProps) {
  const { connected } = useMode();

  /* 커넥티드 모드 → children 렌더링 */
  if (connected && children) {
    return <>{children}</>;
  }

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily,
        gap: 16,
        padding: 40,
      }}
    >
      {icon && <div style={{ fontSize: 48, opacity: 0.3, lineHeight: 1 }}>{icon}</div>}
      <h2 style={{ fontSize: 18, fontWeight: 600, color: colors.text, margin: 0 }}>{title}</h2>
      <p style={{ fontSize: 14, color: colors.textMuted, margin: 0, textAlign: 'center', maxWidth: 360, lineHeight: 1.6 }}>
        {description || '서버에 연결하면 이 기능을 사용할 수 있습니다.'}
      </p>
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 16px',
          borderRadius: 8,
          background: colors.bgSecondary,
          fontSize: 13,
          color: colors.textSub,
          marginTop: 8,
        }}
      >
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#9E9E9E' }} />
        오프라인 모드
      </div>
    </div>
  );
}
