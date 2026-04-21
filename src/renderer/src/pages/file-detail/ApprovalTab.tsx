/**
 * 결재 탭 — 오프라인 모드 placeholder
 *
 * 역할: 서버 연결 시 승인 워크플로우를 표시합니다. 현재는 안내 메시지만 표시.
 */

import { colors } from '@renderer/design/theme';
import { useMode } from '@renderer/hooks/useMode';

export default function ApprovalTab() {
  const { connected } = useMode();

  if (!connected) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 12, padding: 60,
        color: colors.textMuted, fontSize: 14,
      }}>
        <span style={{ fontSize: 48, opacity: 0.3 }}>📋</span>
        <span>결재/승인 기능은 서버 연결 시 사용할 수 있습니다.</span>
        <span style={{ fontSize: 12, color: colors.textMuted }}>
          설정에서 서버에 연결하면 승인 요청, 검토, 반려 등의 워크플로우를 이용할 수 있습니다.
        </span>
      </div>
    );
  }

  /* Phase C에서 서버 연동 시 실제 승인 UI 구현 */
  return (
    <div style={{ padding: 20, color: colors.textSub, fontSize: 14 }}>
      서버 승인 기능 로딩 중...
    </div>
  );
}
