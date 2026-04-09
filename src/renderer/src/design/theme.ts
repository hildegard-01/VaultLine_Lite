/**
 * V2 디자인 시스템 — 컬러/레이아웃 상수
 *
 * 역할: V2 디자인의 컬러 팔레트, 레이아웃 사이즈, 폰트 등 전역 디자인 토큰을 정의합니다.
 * 구성: colors 객체 / layout 객체 / font 상수
 */

export const colors = {
  /** 네이비 — 사이드바/헤더 배경 */
  navy: '#1B2A4A',
  /** 페이지 전체 배경 */
  bg: '#f7f8fa',
  /** 카드/패널 기본 배경 */
  bgPrimary: '#fff',
  /** 보조 배경 (호버, 비활성) */
  bgSecondary: '#f5f5f5',
  /** 구분선/보더 */
  border: '#e0e0e0',
  /** 얇은 구분선 */
  borderLight: '#eee',
  /** 기본 텍스트 */
  text: '#1a1a2e',
  /** 보조 텍스트 */
  textSub: '#5f6368',
  /** 비활성 텍스트 */
  textMuted: '#999',

  /** 파란색 — 강조, 링크 */
  blue: '#1565C0',
  /** 파란색 배경 */
  blueBg: '#E3F2FD',
  /** 초록색 — 성공, 활성 */
  green: '#2E7D32',
  /** 초록색 배경 */
  greenBg: '#E8F5E9',
  /** 주황색 — 경고 */
  orange: '#E65100',
  /** 주황색 배경 */
  orangeBg: '#FFF3E0',
  /** 빨간색 — 오류, 삭제 */
  red: '#E74C3C',
  /** 빨간색 배경 */
  redBg: '#FFEBEE',
  /** 보라색 — 특수 태그 */
  purple: '#6A1B9A',
  /** 보라색 배경 */
  purpleBg: '#EDE7F6',
} as const;

export const layout = {
  /** 헤더 높이 (px) */
  headerHeight: 52,
  /** 사이드바 너비 (px) */
  sidebarWidth: 220,
  /** 우측 패널 너비 (px) */
  rightPanelWidth: 320,
  /** 우측 패널 축소 너비 (px) */
  rightPanelCollapsed: 260,
  /** 기본 border-radius (px) */
  radius: 8,
  /** 큰 border-radius (px) */
  radiusLg: 12,
} as const;

/** Pretendard 웹폰트 font-family 선언 */
export const fontFamily =
  "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, 'Helvetica Neue', 'Segoe UI', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', sans-serif";

export type ThemeColors = typeof colors;
export type ThemeLayout = typeof layout;
