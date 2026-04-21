/**
 * AdminRepos — 저장소 관리 (와이어프레임 섹션 17)
 *
 * 역할: 저장소 목록(쿼터/사용량/상태/예약삭제일) + 쿼터 설정 + 예약삭제/취소.
 * 구성: AdminRepos (메인) / 테이블 / 쿼터 모달 내부화
 *
 * 연동 IPC: repo:admin-list, repo:set-quota, repo:mark-deletion, repo:cancel-deletion
 */

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@renderer/services/ipcClient';
import { colors } from '@renderer/design/theme';
import { page, card, table, btn, formatBytes, formatDate } from './adminStyles';

export default function AdminRepos() {
  const qc = useQueryClient();
  const [quotaEdit, setQuotaEdit] = useState<{ id: number; name: string; currentQuota: number | null } | null>(null);

  const { data: repos = [] } = useQuery({
    queryKey: ['repo:admin-list'],
    queryFn: () => invoke('repo:admin-list'),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['repo:admin-list'] });

  const handleMarkDeletion = async (id: number, name: string) => {
    if (!window.confirm(`"${name}" 저장소를 예약 삭제하시겠습니까?\n\n30일 후 자동 제거되며 그 전까지는 복구 가능합니다.`)) return;
    try {
      await invoke('repo:mark-deletion', { id });
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : '예약 삭제 실패');
    }
  };

  const handleCancelDeletion = async (id: number) => {
    try {
      await invoke('repo:cancel-deletion', { id });
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : '예약 삭제 취소 실패');
    }
  };

  return (
    <div style={page.root}>
      <h1 style={page.title}>🗄 저장소 관리</h1>
      <p style={page.desc}>저장소별 쿼터를 설정하고 예약 삭제를 관리합니다.</p>

      <div style={card.root}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={card.title}>저장소 목록 ({repos.length}개)</h2>
        </div>

        <table style={table.root}>
          <thead>
            <tr>
              <th style={table.th}>이름</th>
              <th style={table.th}>사용량</th>
              <th style={table.th}>쿼터</th>
              <th style={table.th}>리비전</th>
              <th style={table.th}>상태</th>
              <th style={table.th}>생성일</th>
              <th style={{ ...table.th, width: 180 }}>작업</th>
            </tr>
          </thead>
          <tbody>
            {repos.map(r => {
              const over = r.quotaBytes != null && r.usedBytes > r.quotaBytes;
              const pct = r.quotaBytes != null && r.quotaBytes > 0
                ? Math.min(Math.round((r.usedBytes / r.quotaBytes) * 100), 100)
                : 0;
              const isPending = r.status === 'pending_deletion';

              return (
                <tr key={r.id}>
                  <td style={table.td}>
                    <div style={{ fontWeight: 600 }}>{r.name}</div>
                    {r.description && (
                      <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>{r.description}</div>
                    )}
                  </td>
                  <td style={table.td}>
                    <div>{formatBytes(r.usedBytes)}</div>
                    <div style={{ fontSize: 11, color: colors.textMuted }}>{r.fileCount}개 파일</div>
                  </td>
                  <td style={table.td}>
                    {r.quotaBytes == null ? (
                      <span style={{ color: colors.textMuted }}>무제한</span>
                    ) : (
                      <div>
                        <div style={{ color: over ? colors.red : colors.text }}>
                          {formatBytes(r.quotaBytes)}
                        </div>
                        <div style={{ height: 4, background: colors.border, borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
                          <div style={{
                            width: `${pct}%`, height: '100%',
                            background: over ? colors.red : colors.blue,
                          }} />
                        </div>
                      </div>
                    )}
                  </td>
                  <td style={table.td}>r.{r.revisions}</td>
                  <td style={table.td}>
                    {isPending ? (
                      <span style={{ color: colors.red, fontWeight: 600 }}>예약 삭제</span>
                    ) : (
                      <span style={{ color: colors.green }}>정상</span>
                    )}
                    {isPending && r.pendingDeletionAt && (
                      <div style={{ fontSize: 10, color: colors.textMuted }}>
                        {formatDate(r.pendingDeletionAt)}
                      </div>
                    )}
                  </td>
                  <td style={table.td}>{formatDate(r.createdAt)}</td>
                  <td style={table.td}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button
                        style={{ ...btn.ghost, ...btn.small }}
                        onClick={() => setQuotaEdit({ id: r.id, name: r.name, currentQuota: r.quotaBytes })}
                      >
                        쿼터
                      </button>
                      {isPending ? (
                        <button
                          style={{ ...btn.ghost, ...btn.small, color: colors.blue, borderColor: colors.blueBg }}
                          onClick={() => handleCancelDeletion(r.id)}
                        >
                          복구
                        </button>
                      ) : (
                        <button
                          style={{ ...btn.danger, ...btn.small }}
                          onClick={() => handleMarkDeletion(r.id, r.name)}
                        >
                          예약 삭제
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {repos.length === 0 && (
              <tr>
                <td colSpan={7} style={{ ...table.td, textAlign: 'center', color: colors.textMuted, padding: 48 }}>
                  저장소가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {quotaEdit && (
        <QuotaModal
          target={quotaEdit}
          onClose={() => setQuotaEdit(null)}
          onSaved={() => { setQuotaEdit(null); refresh(); }}
        />
      )}
    </div>
  );
}

/* ────────────────────── 쿼터 설정 모달 ────────────────────── */

function QuotaModal({
  target, onClose, onSaved,
}: {
  target: { id: number; name: string; currentQuota: number | null };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState<'unlimited' | 'custom'>(target.currentQuota == null ? 'unlimited' : 'custom');
  const [valueMB, setValueMB] = useState(
    target.currentQuota != null ? Math.floor(target.currentQuota / (1024 * 1024)) : 1024
  );

  const handleSave = async () => {
    const quotaBytes = mode === 'unlimited' ? null : valueMB * 1024 * 1024;
    try {
      await invoke('repo:set-quota', { id: target.id, quotaBytes });
      onSaved();
    } catch (err) {
      alert(err instanceof Error ? err.message : '쿼터 설정 실패');
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 8, padding: 24, width: 420, border: `1px solid ${colors.border}` }}
      >
        <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700 }}>쿼터 설정</h3>
        <p style={{ fontSize: 12, color: colors.textMuted, margin: '0 0 16px' }}>
          대상: <strong>{target.name}</strong>
        </p>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '6px 0' }}>
            <input type="radio" checked={mode === 'unlimited'} onChange={() => setMode('unlimited')} />
            <span>무제한 (기본)</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '6px 0' }}>
            <input type="radio" checked={mode === 'custom'} onChange={() => setMode('custom')} />
            <span>직접 지정</span>
          </label>
          {mode === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, paddingLeft: 20 }}>
              <input
                type="number"
                value={valueMB}
                onChange={(e) => setValueMB(Math.max(1, Number(e.target.value)))}
                style={{ width: 120, padding: '6px 10px', fontSize: 13, border: `1px solid ${colors.border}`, borderRadius: 4 }}
              />
              <span style={{ fontSize: 13, color: colors.textSub }}>MB</span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button style={btn.ghost} onClick={onClose}>취소</button>
          <button style={btn.primary} onClick={handleSave}>저장</button>
        </div>
      </div>
    </div>
  );
}
