/**
 * AdminShares — 서버 공유 관리 (시스템 관리자 전용)
 *
 * 역할: 서버에 등록된 전체 공유 목록 조회 및 강제 삭제.
 * 연동 IPC: admin:share-list, admin:share-delete
 */

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@renderer/services/ipcClient';
import { colors } from '@renderer/design/theme';
import { page, card, table, btn, formatDate } from './adminStyles';

interface AdminShareItem {
  id: number
  repo_id: number
  repo_name: string | null
  file_path: string | null
  share_token: string
  created_by: number
  creator_name: string | null
  creator_username: string | null
  permission: string
  has_password: boolean
  expires_at: string | null
  max_downloads: number | null
  download_count: number
  is_active: boolean
  created_at: string
  recipients: Array<{
    user_id: number
    username: string
    display_name: string | null
    accessed_at: string | null
  }>
}

export default function AdminShares() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin:share-list'],
    queryFn: () => invoke('admin:share-list' as any, { skip: 0, limit: 200 }),
  });

  const allItems: AdminShareItem[] = (data as any)?.items ?? [];
  const total: number = (data as any)?.total ?? 0;

  const filtered = search
    ? allItems.filter(s =>
        s.file_path?.toLowerCase().includes(search.toLowerCase()) ||
        s.repo_name?.toLowerCase().includes(search.toLowerCase()) ||
        s.creator_username?.toLowerCase().includes(search.toLowerCase()) ||
        s.creator_name?.toLowerCase().includes(search.toLowerCase())
      )
    : allItems;

  const activeCount = allItems.filter(s => s.is_active).length;

  const refresh = () => qc.invalidateQueries({ queryKey: ['admin:share-list'] });

  const handleDelete = async (s: AdminShareItem) => {
    const target = s.file_path
      ? `"${s.file_path}" (${s.repo_name ?? `레포 #${s.repo_id}`})`
      : `레포 전체 (${s.repo_name ?? `#${s.repo_id}`})`;
    if (!window.confirm(`${target} 공유를 강제 삭제하시겠습니까?\n\n공유자: ${s.creator_name || s.creator_username}`)) return;
    try {
      await invoke('admin:share-delete' as any, { shareId: s.id });
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : '공유 삭제 실패');
    }
  };

  return (
    <div style={page.root}>
      <h1 style={page.title}>↗ 공유 관리</h1>
      <p style={page.desc}>서버에 등록된 모든 공유 링크를 관리합니다.</p>

      {/* 통계 + 검색 */}
      <div style={{ ...card.root, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
          <span><strong>{total}</strong>건 전체</span>
          <span style={{ color: colors.green }}>활성 {activeCount}</span>
          <span style={{ color: colors.textMuted }}>비활성 {total - activeCount}</span>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="파일 경로 · 저장소 · 공유자 검색"
          style={{
            flex: 1, minWidth: 200, padding: '6px 10px', fontSize: 13,
            border: `1px solid ${colors.border}`, borderRadius: 4,
          }}
        />
        <button style={btn.ghost} onClick={refresh}>새로고침</button>
      </div>

      {/* 공유 테이블 */}
      <div style={card.root}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 40, color: colors.textMuted }}>불러오는 중...</div>
        ) : (
          <table style={table.root}>
            <thead>
              <tr>
                <th style={table.th}>저장소 / 파일</th>
                <th style={table.th}>공유자</th>
                <th style={table.th}>권한</th>
                <th style={table.th}>수신자</th>
                <th style={table.th}>접근</th>
                <th style={table.th}>만료일</th>
                <th style={table.th}>상태</th>
                <th style={table.th}>생성일</th>
                <th style={{ ...table.th, width: 80 }}>작업</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id} style={{ opacity: s.is_active ? 1 : 0.5 }}>
                  <td style={table.td}>
                    <div style={{ fontWeight: 500 }}>{s.repo_name ?? `레포 #${s.repo_id}`}</div>
                    <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
                      {s.file_path ?? '저장소 전체'}
                    </div>
                  </td>
                  <td style={table.td}>
                    <div>{s.creator_name || s.creator_username || '—'}</div>
                    {s.creator_name && s.creator_username && (
                      <div style={{ fontSize: 11, color: colors.textMuted }}>{s.creator_username}</div>
                    )}
                  </td>
                  <td style={table.td}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                      background: s.permission === 'edit' ? '#fff0f0' : '#f0f4ff',
                      color: s.permission === 'edit' ? colors.red : colors.blue,
                    }}>
                      {s.permission === 'edit' ? '편집' : s.permission === 'download' ? '다운로드' : '보기'}
                    </span>
                    {s.has_password && <span style={{ marginLeft: 4, fontSize: 11, color: colors.textMuted }}>🔑</span>}
                  </td>
                  <td style={table.td}>
                    {s.recipients.length === 0 ? (
                      <span style={{ fontSize: 12, color: colors.textMuted }}>링크 공유</span>
                    ) : (
                      <div>
                        {s.recipients.slice(0, 2).map(r => (
                          <div key={r.user_id} style={{ fontSize: 12 }}>
                            {r.display_name || r.username}
                            {r.accessed_at && <span style={{ color: colors.green, marginLeft: 4 }}>✓</span>}
                          </div>
                        ))}
                        {s.recipients.length > 2 && (
                          <div style={{ fontSize: 11, color: colors.textMuted }}>+{s.recipients.length - 2}명</div>
                        )}
                      </div>
                    )}
                  </td>
                  <td style={table.td}>
                    <span style={{ fontSize: 12 }}>
                      {s.max_downloads != null
                        ? `${s.download_count} / ${s.max_downloads}`
                        : s.download_count > 0 ? s.download_count : '—'}
                    </span>
                  </td>
                  <td style={table.td}>
                    <span style={{ fontSize: 12, color: s.expires_at ? colors.orange : colors.textMuted }}>
                      {s.expires_at ? formatDate(s.expires_at) : '영구'}
                    </span>
                  </td>
                  <td style={table.td}>
                    <span style={{ color: s.is_active ? colors.green : colors.textMuted, fontWeight: 600 }}>
                      ● {s.is_active ? '활성' : '비활성'}
                    </span>
                  </td>
                  <td style={table.td}><span style={{ fontSize: 12 }}>{formatDate(s.created_at)}</span></td>
                  <td style={table.td}>
                    <button
                      style={{ ...btn.danger, ...btn.small }}
                      onClick={() => handleDelete(s)}
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ ...table.td, textAlign: 'center', color: colors.textMuted, padding: 48 }}>
                    {search ? '검색 결과가 없습니다.' : '공유 데이터가 없습니다.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
