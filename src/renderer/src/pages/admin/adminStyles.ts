/**
 * adminStyles — 관리자 페이지 공통 인라인 스타일 토큰
 *
 * 역할: 관리자 7페이지가 공통으로 쓰는 페이지/카드/테이블/버튼 스타일을 모아둡니다.
 *       각 페이지에서 import 해서 재사용합니다.
 * 구성: page(레이아웃), card(섹션 카드), table(목록), btn(액션 버튼) 4종
 */

import type { CSSProperties } from 'react';
import { colors } from '@renderer/design/theme';

export const page: Record<string, CSSProperties> = {
  root: {
    flex: 1,
    overflow: 'auto',
    background: colors.bg,
    padding: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    color: colors.text,
    margin: '0 0 4px',
  },
  desc: {
    fontSize: 12,
    color: colors.textMuted,
    margin: '0 0 20px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
};

export const card: Record<string, CSSProperties> = {
  root: {
    background: colors.bgPrimary,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    padding: 20,
    marginBottom: 16,
  },
  title: {
    fontSize: 14,
    fontWeight: 700,
    color: colors.text,
    margin: '0 0 12px',
  },
};

export const table: Record<string, CSSProperties> = {
  root: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
  },
  th: {
    padding: '10px 12px',
    textAlign: 'left',
    fontSize: 11,
    fontWeight: 700,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.3px',
    borderBottom: `2px solid ${colors.border}`,
    background: colors.bgSecondary,
  },
  td: {
    padding: '10px 12px',
    fontSize: 13,
    color: colors.text,
    borderBottom: `1px solid ${colors.borderLight}`,
  },
};

export const btn: Record<string, CSSProperties> = {
  primary: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 14px',
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 6,
    background: colors.navy,
    color: '#fff',
    border: 'none',
    cursor: 'pointer',
  },
  ghost: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 14px',
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 6,
    background: colors.bgPrimary,
    color: colors.text,
    border: `1px solid ${colors.border}`,
    cursor: 'pointer',
  },
  danger: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 14px',
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 6,
    background: colors.bgPrimary,
    color: colors.red,
    border: `1px solid ${colors.redBg}`,
    cursor: 'pointer',
  },
  small: {
    padding: '4px 8px',
    fontSize: 11,
  },
};

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || bytes === 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}
