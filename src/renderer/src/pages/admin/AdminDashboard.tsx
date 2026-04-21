/**
 * AdminDashboard — 관리자 대시보드 (와이어프레임 섹션 4)
 *
 * 역할: 4개 메트릭 카드 (저장소, 파일, 디스크, 경고) + 최근 활동 5건을 표시합니다.
 * 구성: AdminDashboard (메인) / Metric 카드 / 활동 리스트
 *
 * 연동 IPC: repo:list, repo:stats, settings:disk-usage, activity:list, system:health-check
 */

import { useQuery } from '@tanstack/react-query';
import { invoke } from '@renderer/services/ipcClient';
import { colors } from '@renderer/design/theme';
import { page, card, formatBytes } from './adminStyles';
import type { CSSProperties } from 'react';

interface MetricDef {
  label: string;
  value: string;
  sub?: string;
  color: string;
  bg: string;
}

function MetricCard({ m }: { m: MetricDef }) {
  const style: CSSProperties = {
    flex: 1,
    minWidth: 180,
    padding: 20,
    background: colors.bgPrimary,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    borderLeft: `4px solid ${m.color}`,
  };
  return (
    <div style={style}>
      <div style={{ fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
        {m.label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: m.color, marginTop: 4 }}>
        {m.value}
      </div>
      {m.sub && (
        <div style={{ fontSize: 11, color: colors.textSub, marginTop: 2 }}>{m.sub}</div>
      )}
    </div>
  );
}

export default function AdminDashboard() {
  const { data: repos = [] } = useQuery({
    queryKey: ['repo:admin-list'],
    queryFn: () => invoke('repo:admin-list'),
  });

  const { data: disk } = useQuery({
    queryKey: ['settings:disk-usage'],
    queryFn: () => invoke('settings:disk-usage'),
  });

  const { data: activities = [] } = useQuery({
    queryKey: ['activity:list', { limit: 5 }],
    queryFn: () => invoke('activity:list', { limit: 5, offset: 0 }),
  });

  const { data: health } = useQuery({
    queryKey: ['system:health-check'],
    queryFn: () => invoke('system:health-check'),
  });

  /* 메트릭 계산 */
  const totalRepos = repos.length;
  const totalFiles = repos.reduce((sum, r) => sum + r.fileCount, 0);
  const totalUsed = repos.reduce((sum, r) => sum + r.usedBytes, 0);
  const diskPct = disk && disk.total > 0 ? Math.round((disk.used / disk.total) * 100) : 0;

  const quotaOver = repos.filter(r => r.quotaBytes && r.usedBytes > r.quotaBytes).length;
  const healthFail =
    (health && !health.svn.ok ? 1 : 0) +
    (health && !health.libreoffice.ok ? 1 : 0);
  const warnCount = quotaOver + healthFail;

  const metrics: MetricDef[] = [
    { label: '저장소', value: String(totalRepos), sub: `파일 ${totalFiles}개`, color: colors.blue, bg: colors.blueBg },
    { label: '총 사용량', value: formatBytes(totalUsed), sub: '로컬 저장소 합계', color: colors.green, bg: colors.greenBg },
    { label: '디스크 사용량', value: disk ? formatBytes(disk.used) : '—', sub: disk ? `전체 ${formatBytes(disk.total)} 중 ${diskPct}%` : '계산 중', color: colors.navy, bg: colors.blueBg },
    { label: '경고', value: String(warnCount), sub: warnCount === 0 ? '정상' : `${quotaOver > 0 ? `쿼터 초과 ${quotaOver} · ` : ''}${healthFail > 0 ? `서비스 ${healthFail}` : ''}`, color: warnCount > 0 ? colors.red : colors.green, bg: warnCount > 0 ? colors.redBg : colors.greenBg },
  ];

  return (
    <div style={page.root}>
      <h1 style={page.title}>관리자 대시보드</h1>
      <p style={page.desc}>VaultLine Lite의 저장소·디스크·시스템 상태를 한눈에 확인합니다.</p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        {metrics.map(m => <MetricCard key={m.label} m={m} />)}
      </div>

      <div style={card.root}>
        <h2 style={card.title}>최근 활동</h2>
        {activities.length === 0 ? (
          <div style={{ fontSize: 12, color: colors.textMuted, padding: '8px 0' }}>활동 기록이 없습니다.</div>
        ) : (
          <div>
            {activities.map(a => (
              <div
                key={a.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 0',
                  borderBottom: `1px solid ${colors.borderLight}`,
                }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: colors.blueBg, color: colors.blue,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, flexShrink: 0,
                }}>
                  {iconForAction(a.action)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: colors.text }}>
                    <span style={{ fontWeight: 600 }}>{a.repoName || '시스템'}</span>
                    <span style={{ color: colors.textSub }}> · {labelForAction(a.action)}</span>
                    {a.filePath && <span style={{ color: colors.textMuted }}> · {a.filePath}</span>}
                  </div>
                  {a.detail && (
                    <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.detail}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 11, color: colors.textMuted, flexShrink: 0 }}>
                  {relTime(a.createdAt)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function iconForAction(action: string): string {
  if (action.startsWith('file.upload') || action.startsWith('file.commit')) return '⬆';
  if (action.startsWith('file.delete')) return '🗑';
  if (action.startsWith('lock.')) return '🔒';
  if (action.startsWith('share.')) return '↗';
  if (action.startsWith('backup.')) return '💾';
  if (action.startsWith('repo.')) return '📁';
  return '•';
}

function labelForAction(action: string): string {
  const LABELS: Record<string, string> = {
    'file.upload': '파일 업로드',
    'file.commit': '파일 커밋',
    'file.delete': '파일 삭제',
    'file.rename': '이름 변경',
    'file.move': '이동',
    'lock.add': '보호 잠금',
    'lock.remove': '잠금 해제',
    'share.create': '공유 생성',
    'share.user-add': '사용자 추가',
    'share.user-remove': '사용자 삭제',
    'backup.create': '백업 생성',
    'backup.restore': '백업 복원',
    'repo.set-quota': '쿼터 변경',
    'repo.mark-deletion': '저장소 예약 삭제',
    'repo.cancel-deletion': '예약 삭제 취소',
  };
  return LABELS[action] || action;
}

function relTime(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return '방금';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}
