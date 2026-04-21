/**
 * 미구현 페이지 임시 placeholder
 *
 * 역할: Step 4에서 실제 페이지로 교체될 때까지 빈 화면 방지용 안내를 표시합니다.
 */

import { colors, fontFamily } from '@renderer/design/theme';

interface PlaceholderPageProps {
  title: string;
  description?: string;
  icon?: string;
}

export function PlaceholderPage({ title, description, icon }: PlaceholderPageProps) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily,
        color: colors.textSub,
        gap: 12,
        padding: 40,
      }}
    >
      {icon && <span style={{ fontSize: 48, opacity: 0.4 }}>{icon}</span>}
      <h2 style={{ fontSize: 18, fontWeight: 600, color: colors.text, margin: 0 }}>{title}</h2>
      {description && (
        <p style={{ fontSize: 14, color: colors.textMuted, margin: 0, textAlign: 'center' }}>
          {description}
        </p>
      )}
    </div>
  );
}
