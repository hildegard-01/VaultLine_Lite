/**
 * AdminServerSettings — 서버 설정 조회 (시스템 관리자 전용)
 *
 * 역할: GET /admin/system 응답의 config 섹션 + 런타임 상태를 표시합니다.
 *       현재 서버는 설정 수정 API가 없으므로 읽기 전용으로 제공합니다.
 * 연동 IPC: admin:server-system
 */

import { useQuery } from '@tanstack/react-query';
import { invoke } from '@renderer/services/ipcClient';
import { colors } from '@renderer/design/theme';
import { page, card, formatBytes } from './adminStyles';
import type { CSSProperties } from 'react';

interface SystemInfo {
  uptime_seconds: number
  uptime_display: string
  db_size_bytes: number
  cache_size_bytes: number
  active_sessions: number
  config: {
    host: string
    port: number
    debug: boolean
    preview_max_size_mb: number
    preview_max_age_days: number
    heartbeat_timeout_sec: number
  }
}

export default function AdminServerSettings() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin:server-system'],
    queryFn: () => invoke('admin:server-system' as any),
    refetchInterval: 30000,
  });

  const info = data as SystemInfo | undefined;

  return (
    <div style={page.root}>
      <h1 style={page.title}>⚙ 서버 설정</h1>
      <p style={page.desc}>
        현재 서버의 구성 값과 런타임 상태를 조회합니다. 설정 변경은 서버의 <code>config.yaml</code> 파일을 직접 수정 후 재시작하세요.
      </p>

      {isLoading && (
        <div style={{ textAlign: 'center', padding: 40, color: colors.textMuted }}>불러오는 중...</div>
      )}

      {info && (
        <>
          {/* 런타임 상태 */}
          <div style={card.root}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ ...card.title, margin: 0 }}>런타임 상태</h2>
              <button
                onClick={() => refetch()}
                style={{ fontSize: 11, color: colors.blue, background: 'none', border: 'none', cursor: 'pointer' }}
              >
                새로고침
              </button>
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <StatChip label="업타임" value={info.uptime_display} color={colors.green} />
              <StatChip label="활성 세션" value={`${info.active_sessions}개`} color={colors.blue} />
              <StatChip label="DB 크기" value={formatBytes(info.db_size_bytes)} color={colors.navy} />
              <StatChip label="캐시 크기" value={formatBytes(info.cache_size_bytes)} color={colors.textSub} />
            </div>
          </div>

          {/* 서버 설정 */}
          <div style={card.root}>
            <h2 style={card.title}>서버 구성</h2>
            <SettingSection title="서버">
              <SettingRow label="호스트" value={info.config.host} />
              <SettingRow label="포트" value={String(info.config.port)} />
              <SettingRow
                label="디버그 모드"
                value={info.config.debug ? '활성' : '비활성'}
                valueColor={info.config.debug ? colors.orange : colors.green}
              />
            </SettingSection>

            <SettingSection title="미리보기 캐시">
              <SettingRow label="최대 크기" value={`${info.config.preview_max_size_mb.toLocaleString()} MB`} />
              <SettingRow label="캐시 보존 기간" value={`${info.config.preview_max_age_days}일`} />
            </SettingSection>

            <SettingSection title="동기화">
              <SettingRow label="하트비트 타임아웃" value={`${info.config.heartbeat_timeout_sec}초`} />
            </SettingSection>
          </div>

          {/* 안내 */}
          <div style={{
            ...card.root,
            background: '#fffbf0',
            border: `1px solid #ffe58f`,
          }}>
            <div style={{ fontSize: 13, color: colors.textSub }}>
              <strong style={{ color: colors.orange }}>설정 변경 방법</strong><br />
              서버 머신의 <code style={{ background: '#f5f0e8', padding: '2px 6px', borderRadius: 4 }}>config.yaml</code> 파일을 직접 수정하고 서버를 재시작하면 반영됩니다.
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ────────────────────── UI 헬퍼 ────────────────────── */

function StatChip({ label, value, color }: { label: string; value: string; color: string }) {
  const style: CSSProperties = {
    flex: '1 1 140px',
    padding: '12px 16px',
    background: colors.bg,
    borderRadius: 8,
    border: `1px solid ${colors.border}`,
    borderLeft: `4px solid ${color}`,
  };
  return (
    <div style={style}>
      <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function SettingSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: colors.textMuted,
        textTransform: 'uppercase', letterSpacing: '0.5px',
        borderBottom: `1px solid ${colors.border}`, paddingBottom: 6, marginBottom: 8,
      }}>
        {title}
      </div>
      <div>{children}</div>
    </div>
  );
}

function SettingRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '7px 0', borderBottom: `1px solid ${colors.borderLight}`,
    }}>
      <span style={{ fontSize: 13, color: colors.textSub }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: valueColor ?? colors.text }}>{value}</span>
    </div>
  );
}
