/**
 * 활동 로그 페이지
 *
 * 역할: 파일 변경, 커밋, 공유, 백업 등 활동 내역을 타임라인으로 표시합니다.
 * 구성: ActivityPage (메인) / ActivityItem / 필터
 */

import { useState, type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { invoke } from '@renderer/services/ipcClient';
import { colors, fontFamily } from '@renderer/design/theme';
import { Activity, Clock } from '@renderer/design/Icons';

/* ────────────────────── 액션 라벨/색상 매핑 ────────────────────── */

const ACTION_MAP: Record<string, { label: string; color: string; bg: string }> = {
  'file.upload': { label: '파일 업로드', color: colors.blue, bg: colors.blueBg },
  'file.commit': { label: '커밋', color: colors.green, bg: colors.greenBg },
  'file.delete': { label: '파일 삭제', color: colors.red, bg: colors.redBg },
  'file.rename': { label: '이름 변경', color: colors.blue, bg: colors.blueBg },
  'file.move': { label: '파일 이동', color: colors.blue, bg: colors.blueBg },
  'file.lock': { label: '잠금', color: colors.purple, bg: colors.purpleBg },
  'file.unlock': { label: '잠금 해제', color: colors.purple, bg: colors.purpleBg },
  'file.export': { label: '내보내기', color: colors.orange, bg: colors.orangeBg },
  'file.restore': { label: '복원', color: colors.green, bg: colors.greenBg },
  'share.create': { label: '공유 생성', color: colors.blue, bg: colors.blueBg },
  'share.invite': { label: '초대', color: colors.blue, bg: colors.blueBg },
  'share.user-add': { label: '사용자 추가', color: colors.green, bg: colors.greenBg },
  'share.user-remove': { label: '사용자 제거', color: colors.red, bg: colors.redBg },
  'repo.create': { label: '저장소 생성', color: colors.green, bg: colors.greenBg },
  'repo.delete': { label: '저장소 삭제', color: colors.red, bg: colors.redBg },
  'backup.create': { label: '백업 생성', color: colors.orange, bg: colors.orangeBg },
  'backup.restore': { label: '백업 복원', color: colors.orange, bg: colors.orangeBg },
  'svnserve.start': { label: 'P2P 시작', color: colors.green, bg: colors.greenBg },
  'svnserve.stop': { label: 'P2P 중지', color: colors.red, bg: colors.redBg },
  'sync.join': { label: '원격 연결', color: colors.blue, bg: colors.blueBg },
  'sync.disconnect': { label: '원격 해제', color: colors.red, bg: colors.redBg },
  'sync.conflict': { label: '충돌 발생', color: colors.orange, bg: colors.orangeBg },
  'sync.resolve': { label: '충돌 해결', color: colors.green, bg: colors.greenBg },
};

function getActionInfo(action: string) {
  return ACTION_MAP[action] || { label: action, color: colors.textSub, bg: colors.bgSecondary };
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = Date.now();
  const diff = Math.floor((now - d.getTime()) / 1000);
  if (diff < 60) return '방금 전';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}일 전`;
  return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/* ────────────────────── 필터 옵션 ────────────────────── */

const FILTERS = [
  { value: '', label: '전체' },
  { value: 'file', label: '파일' },
  { value: 'share', label: '공유' },
  { value: 'repo', label: '저장소' },
  { value: 'backup', label: '백업' },
  { value: 'sync', label: '동기화' },
];

/* ────────────────────── 스타일 ────────────────────── */

const S: Record<string, CSSProperties> = {
  page: { padding: 24, fontFamily, overflow: 'auto', flex: 1 },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  title: { fontSize: 18, fontWeight: 600, color: colors.text, display: 'flex', alignItems: 'center', gap: 10 },
  filters: { display: 'flex', gap: 4 },
  filterBtn: { padding: '4px 12px', borderRadius: 14, border: 'none', fontSize: 12, cursor: 'pointer', fontWeight: 500 },
  timeline: { display: 'flex', flexDirection: 'column', gap: 0 },
  item: {
    display: 'flex', gap: 14, padding: '12px 0',
    borderBottom: `1px solid ${colors.borderLight}`,
  },
  dot: {
    width: 8, height: 8, borderRadius: '50%', marginTop: 6, flexShrink: 0,
  },
  badge: {
    display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
  },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  empty: { textAlign: 'center', padding: 60, color: colors.textMuted, fontSize: 14 },
};

/* ────────────────────── 컴포넌트 ────────────────────── */

export function ActivityPage() {
  const [filter, setFilter] = useState('');

  const { data: activities = [], isLoading } = useQuery({
    queryKey: ['activity:list', filter],
    queryFn: () => invoke('activity:list', { action: filter || undefined, limit: 200 }),
  });

  const items = activities as Array<{
    id: number; repoId: number | null; repoName: string | null;
    action: string; filePath: string | null; revision: number | null;
    username: string | null; detail: string | null; createdAt: string;
  }>;

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div style={S.title}>
          <Activity width={20} height={20} color={colors.navy} />
          활동 로그
        </div>
        <div style={S.filters}>
          {FILTERS.map((f) => (
            <button
              key={f.value}
              style={{
                ...S.filterBtn,
                background: filter === f.value ? colors.navy : colors.bgSecondary,
                color: filter === f.value ? '#fff' : colors.textSub,
              }}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <div style={S.empty}>활동 로그를 불러오는 중...</div>}

      {!isLoading && items.length === 0 && (
        <div style={S.empty}>
          <Clock width={32} height={32} color={colors.textMuted} style={{ margin: '0 auto 12px', display: 'block' }} />
          활동 내역이 없습니다.
        </div>
      )}

      {!isLoading && items.length > 0 && (
        <div style={S.timeline}>
          {items.map((item) => {
            const info = getActionInfo(item.action);
            return (
              <div key={item.id} style={S.item}>
                <div style={{ ...S.dot, background: info.color }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ ...S.badge, background: info.bg, color: info.color }}>{info.label}</span>
                    {item.filePath && (
                      <span style={{ fontSize: 13, color: colors.text, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.filePath}
                      </span>
                    )}
                    {item.revision && (
                      <span style={{ fontSize: 11, color: colors.blue, fontWeight: 600 }}>r.{item.revision}</span>
                    )}
                  </div>
                  <div style={S.meta}>
                    {item.repoName && <span>{item.repoName}</span>}
                    {item.detail && <span> · {item.detail}</span>}
                    <span> · {formatTime(item.createdAt)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
