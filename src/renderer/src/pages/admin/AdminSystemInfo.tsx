/**
 * AdminSystemInfo — 시스템 정보 (와이어프레임 섹션 19)
 *
 * 역할: 시스템 버전/런타임/플랫폼/업타임 + 서비스 헬스체크 + 디스크 사용량 표시.
 *       30초마다 헬스체크 자동 갱신.
 * 구성: AdminSystemInfo (메인) / InfoRow / ServiceRow / 3섹션
 *
 * 연동 IPC: system:info-full, system:health-check, settings:disk-usage
 */

import { useQuery } from '@tanstack/react-query';
import { invoke } from '@renderer/services/ipcClient';
import { colors } from '@renderer/design/theme';
import { page, card, formatBytes } from './adminStyles';

export default function AdminSystemInfo() {
  const { data: info } = useQuery({
    queryKey: ['system:info-full'],
    queryFn: () => invoke('system:info-full'),
  });

  const { data: health } = useQuery({
    queryKey: ['system:health-check'],
    queryFn: () => invoke('system:health-check'),
    refetchInterval: 30000,
  });

  const { data: disk } = useQuery({
    queryKey: ['settings:disk-usage'],
    queryFn: () => invoke('settings:disk-usage'),
    refetchInterval: 30000,
  });

  return (
    <div style={page.root}>
      <h1 style={page.title}>🛡 시스템 정보</h1>
      <p style={page.desc}>앱 버전, 서비스 상태, 디스크 사용량을 실시간으로 확인합니다.</p>

      {/* 1. 시스템 */}
      <div style={card.root}>
        <h2 style={card.title}>시스템</h2>
        {info ? (
          <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', rowGap: 8, fontSize: 13 }}>
            <InfoRow label="앱 버전" value={`v${info.version}`} />
            <InfoRow label="Electron" value={info.electron} />
            <InfoRow label="Node.js" value={info.node} />
            <InfoRow label="Chromium" value={info.chrome} />
            <InfoRow label="플랫폼" value={`${info.platform} (${info.arch})`} />
            <InfoRow label="OS" value={info.osRelease} />
            <InfoRow label="앱 가동 시간" value={formatUptime(info.uptime)} />
            <InfoRow label="DB 크기" value={formatBytes(info.dbSizeBytes)} />
            <InfoRow label="데이터 디렉토리" value={info.dataDir} mono />
          </div>
        ) : (
          <div style={{ color: colors.textMuted, fontSize: 12 }}>정보를 불러오는 중...</div>
        )}
      </div>

      {/* 2. 서비스 상태 */}
      <div style={card.root}>
        <h2 style={card.title}>서비스 상태 <span style={{ fontSize: 11, fontWeight: 400, color: colors.textMuted }}>· 30초마다 자동 갱신</span></h2>
        {health ? (
          <div>
            <ServiceRow
              label="SVN (Subversion)"
              ok={health.svn.ok}
              detail={health.svn.version || (health.svn.ok ? '' : 'SVN 바이너리를 찾을 수 없습니다')}
            />
            <ServiceRow
              label="LibreOffice"
              ok={health.libreoffice.ok}
              detail={health.libreoffice.path || '미리보기 변환 불가 — LibreOffice를 설치하면 docx/xlsx/pptx 미리보기가 활성화됩니다'}
            />
            <ServiceRow
              label="svnserve (P2P 공유)"
              ok={health.svnserve.ok}
              detail={health.svnserve.ok ? '번들 바이너리 사용 가능' : '번들 바이너리를 찾을 수 없음'}
            />
            <ServiceRow
              label="파일 감시 (Watcher)"
              ok={health.watcher.ok}
              detail={health.watcher.ok ? '정상 작동 중' : '비활성'}
            />
          </div>
        ) : (
          <div style={{ color: colors.textMuted, fontSize: 12 }}>상태 확인 중...</div>
        )}
      </div>

      {/* 3. 디스크 사용량 */}
      <div style={card.root}>
        <h2 style={card.title}>디스크 사용량</h2>
        {disk ? (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
              <span>사용 <strong>{formatBytes(disk.used)}</strong> / 전체 {formatBytes(disk.total)}</span>
              <span style={{ color: diskColor(disk.used, disk.total), fontWeight: 600 }}>
                {disk.total > 0 ? Math.round((disk.used / disk.total) * 100) : 0}%
              </span>
            </div>
            <div style={{ height: 10, background: colors.border, borderRadius: 5, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${disk.total > 0 ? Math.min((disk.used / disk.total) * 100, 100) : 0}%`,
                background: diskColor(disk.used, disk.total),
                transition: 'width 0.3s ease',
              }} />
            </div>
            <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 6 }}>
              여유 공간: {formatBytes(disk.total - disk.used)}
            </div>
          </div>
        ) : (
          <div style={{ color: colors.textMuted, fontSize: 12 }}>계산 중...</div>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <div style={{ color: colors.textMuted }}>{label}</div>
      <div style={{ fontFamily: mono ? 'monospace' : 'inherit', wordBreak: 'break-all' }}>{value}</div>
    </>
  );
}

function ServiceRow({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 0', borderBottom: `1px solid ${colors.borderLight}`,
    }}>
      <div style={{
        width: 12, height: 12, borderRadius: '50%',
        background: ok ? colors.green : colors.red,
        flexShrink: 0,
      }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
        {detail && (
          <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>{detail}</div>
        )}
      </div>
      <div style={{ fontSize: 11, color: ok ? colors.green : colors.red, fontWeight: 600 }}>
        {ok ? '정상' : '불가'}
      </div>
    </div>
  );
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}시간 ${m}분`;
  if (m > 0) return `${m}분 ${s}초`;
  return `${s}초`;
}

function diskColor(used: number, total: number): string {
  if (total === 0) return colors.green;
  const pct = used / total;
  if (pct > 0.9) return colors.red;
  if (pct > 0.75) return colors.orange;
  return colors.green;
}
