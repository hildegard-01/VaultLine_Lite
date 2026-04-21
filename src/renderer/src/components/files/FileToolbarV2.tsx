/**
 * FileToolbarV2 — V2 인라인 스타일 파일 툴바
 *
 * 역할: 파일 탐색기 상단 툴바. 기본 모드(업로드/새폴더/잠금규칙)와
 *       벌크 모드(선택항목 개수 + 이동/잠금/공유/삭제)를 전환해서 표시합니다.
 * 구성: FileToolbarV2 (메인) / BtnPrimary / BtnGhost / BtnDanger (인라인 버튼 헬퍼)
 */

import { useState, useCallback, type CSSProperties, type ReactNode } from 'react';
import { colors } from '@renderer/design/theme';

interface FileToolbarV2Props {
  itemCount: number;
  checkedCount: number;
  onUpload: () => Promise<void> | void;
  onNewFolder: () => Promise<void> | void;
  onLockRules?: () => void;
  onBulkDelete?: () => void;
  onBulkMove?: () => void;
  onBulkLock?: () => void;
  onBulkShare?: () => void;
  onClearChecked?: () => void;
}

const rowStyle: CSSProperties = {
  height: 44,
  display: 'flex',
  alignItems: 'center',
  padding: '0 16px',
  gap: 8,
  borderBottom: `1px solid ${colors.border}`,
  background: colors.bgPrimary,
  flexShrink: 0,
};

const btnBase: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 12px',
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 6,
  cursor: 'pointer',
  border: '1px solid transparent',
  lineHeight: 1,
  whiteSpace: 'nowrap',
};

function BtnPrimary({ children, onClick, disabled }: { children: ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...btnBase,
        background: colors.navy,
        color: '#fff',
        opacity: disabled ? 0.6 : 1,
        cursor: disabled ? 'wait' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function BtnGhost({ children, onClick, color }: { children: ReactNode; onClick?: () => void; color?: string }) {
  const c = color || colors.text;
  return (
    <button
      onClick={onClick}
      style={{
        ...btnBase,
        background: colors.bgPrimary,
        color: c,
        borderColor: colors.border,
      }}
      onMouseEnter={(e) => { (e.currentTarget.style.background = colors.bgSecondary); }}
      onMouseLeave={(e) => { (e.currentTarget.style.background = colors.bgPrimary); }}
    >
      {children}
    </button>
  );
}

function BtnDanger({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...btnBase,
        background: colors.bgPrimary,
        color: colors.red,
        borderColor: colors.redBg,
      }}
      onMouseEnter={(e) => { (e.currentTarget.style.background = colors.redBg); }}
      onMouseLeave={(e) => { (e.currentTarget.style.background = colors.bgPrimary); }}
    >
      {children}
    </button>
  );
}

export function FileToolbarV2({
  itemCount, checkedCount, onUpload, onNewFolder, onLockRules,
  onBulkDelete, onBulkMove, onBulkLock, onBulkShare, onClearChecked,
}: FileToolbarV2Props): React.JSX.Element {
  const [uploading, setUploading] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);

  const handleUpload = useCallback(async () => {
    if (uploading) return;
    setUploading(true);
    try { await onUpload(); } finally { setUploading(false); }
  }, [onUpload, uploading]);

  const handleNewFolder = useCallback(async () => {
    if (creatingFolder) return;
    setCreatingFolder(true);
    try { await onNewFolder(); } finally { setCreatingFolder(false); }
  }, [onNewFolder, creatingFolder]);

  if (checkedCount > 0) {
    // ─── 벌크 액션 바 ───
    return (
      <div style={{ ...rowStyle, background: colors.blueBg, borderBottom: `1px solid ${colors.border}` }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: colors.navy }}>✓ {checkedCount}개 선택됨</span>
        <div style={{ width: 1, height: 18, background: colors.border, margin: '0 4px' }} />
        {onBulkMove && <BtnGhost onClick={onBulkMove} color={colors.blue}>이동</BtnGhost>}
        {onBulkLock && <BtnGhost onClick={onBulkLock} color={colors.purple}>잠금</BtnGhost>}
        {onBulkShare && <BtnGhost onClick={onBulkShare} color={colors.green}>공유</BtnGhost>}
        {onBulkDelete && <BtnDanger onClick={onBulkDelete}>삭제</BtnDanger>}
        <div style={{ flex: 1 }} />
        <button
          onClick={onClearChecked}
          style={{
            background: 'transparent',
            border: 'none',
            color: colors.textSub,
            fontSize: 11,
            cursor: 'pointer',
            padding: '4px 8px',
          }}
        >
          선택 해제
        </button>
      </div>
    );
  }

  // ─── 기본 모드 ───
  return (
    <div style={rowStyle}>
      <BtnPrimary onClick={handleUpload} disabled={uploading}>
        <span style={{ fontSize: 13 }}>⬆</span>
        {uploading ? '처리 중...' : '업로드'}
      </BtnPrimary>
      <BtnGhost onClick={handleNewFolder}>
        <span style={{ fontSize: 13 }}>＋</span>
        {creatingFolder ? '생성 중...' : '새 폴더'}
      </BtnGhost>
      {onLockRules && (
        <BtnGhost onClick={onLockRules}>
          <span style={{ fontSize: 13 }}>🔒</span>
          잠금 규칙
        </BtnGhost>
      )}
      <div style={{ flex: 1 }} />
      <span style={{ fontSize: 11, color: colors.textMuted }}>{itemCount}개 항목</span>
    </div>
  );
}
