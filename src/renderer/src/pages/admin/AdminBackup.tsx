/**
 * AdminBackup — 백업 관리 (와이어프레임 섹션 20)
 *
 * 역할: 즉시 백업 생성(DB/SVN 선택 가능), 백업 이력 목록, 복원(부분), 삭제.
 * 구성: AdminBackup (메인) / 생성 카드 / 이력 테이블 / 복원 모달
 *
 * 연동 IPC: backup:create/list/restore/delete
 */

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@renderer/services/ipcClient';
import { colors } from '@renderer/design/theme';
import { page, card, table, btn, formatBytes, formatDate } from './adminStyles';
import type { BackupEntry } from '@shared/types/ipc';

export default function AdminBackup() {
  const qc = useQueryClient();
  const [createOpts, setCreateOpts] = useState({ includeDB: true, includeSVN: true });
  const [creating, setCreating] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<BackupEntry | null>(null);

  const { data: backups = [] } = useQuery({
    queryKey: ['backup:list'],
    queryFn: () => invoke('backup:list'),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['backup:list'] });

  const handleCreate = async () => {
    if (!createOpts.includeDB && !createOpts.includeSVN) {
      alert('DB 또는 SVN 저장소 중 하나는 선택해야 합니다.');
      return;
    }
    setCreating(true);
    try {
      await invoke('backup:create', createOpts);
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : '백업 생성 실패');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (b: BackupEntry) => {
    if (!window.confirm(`"${b.fileName}" 백업을 삭제하시겠습니까?`)) return;
    try {
      await invoke('backup:delete', { id: b.id });
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : '삭제 실패');
    }
  };

  return (
    <div style={page.root}>
      <h1 style={page.title}>💾 백업 관리</h1>
      <p style={page.desc}>DB + SVN 저장소를 ZIP으로 묶어서 백업하고 복원합니다.</p>

      {/* 백업 생성 */}
      <div style={card.root}>
        <h2 style={card.title}>새 백업 생성</h2>

        <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={createOpts.includeDB}
              onChange={(e) => setCreateOpts(prev => ({ ...prev, includeDB: e.target.checked }))}
            />
            <span style={{ fontSize: 13 }}>DB 포함 (SQLite)</span>
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={createOpts.includeSVN}
              onChange={(e) => setCreateOpts(prev => ({ ...prev, includeSVN: e.target.checked }))}
            />
            <span style={{ fontSize: 13 }}>SVN 저장소 포함</span>
          </label>
        </div>

        <button
          style={{ ...btn.primary, opacity: creating ? 0.6 : 1, cursor: creating ? 'wait' : 'pointer' }}
          onClick={handleCreate}
          disabled={creating}
        >
          {creating ? '백업 생성 중...' : '지금 백업 생성'}
        </button>

        <p style={{ fontSize: 11, color: colors.textMuted, marginTop: 12, lineHeight: 1.5 }}>
          백업 파일은 앱 데이터 디렉토리 내 backups 폴더에 저장됩니다.
          최근 10개만 자동 보관되며 오래된 백업은 자동 제거됩니다.
        </p>
      </div>

      {/* 백업 이력 */}
      <div style={card.root}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={card.title}>백업 이력 ({backups.length}개)</h2>
        </div>

        <table style={table.root}>
          <thead>
            <tr>
              <th style={table.th}>파일명</th>
              <th style={table.th}>크기</th>
              <th style={table.th}>저장소 수</th>
              <th style={table.th}>생성일</th>
              <th style={{ ...table.th, width: 200 }}>작업</th>
            </tr>
          </thead>
          <tbody>
            {backups.map(b => (
              <tr key={b.id}>
                <td style={table.td}><code style={{ fontSize: 12 }}>{b.fileName}</code></td>
                <td style={table.td}>{formatBytes(b.sizeBytes)}</td>
                <td style={table.td}>{b.repoCount}개</td>
                <td style={table.td}>{formatDate(b.createdAt)}</td>
                <td style={table.td}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      style={{ ...btn.ghost, ...btn.small, color: colors.blue, borderColor: colors.blueBg }}
                      onClick={() => setRestoreTarget(b)}
                    >
                      복원
                    </button>
                    <button style={{ ...btn.danger, ...btn.small }} onClick={() => handleDelete(b)}>
                      삭제
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {backups.length === 0 && (
              <tr>
                <td colSpan={5} style={{ ...table.td, textAlign: 'center', color: colors.textMuted, padding: 48 }}>
                  백업이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {restoreTarget && (
        <RestoreModal
          target={restoreTarget}
          onClose={() => setRestoreTarget(null)}
          onDone={() => { setRestoreTarget(null); refresh(); }}
        />
      )}
    </div>
  );
}

/* ────────────────────── 복원 모달 ────────────────────── */

function RestoreModal({
  target, onClose, onDone,
}: { target: BackupEntry; onClose: () => void; onDone: () => void }) {
  const [opts, setOpts] = useState({ includeDB: true, includeSVN: true });
  const [restoring, setRestoring] = useState(false);

  const handleRestore = async () => {
    if (!opts.includeDB && !opts.includeSVN) {
      alert('DB 또는 SVN 중 하나는 선택해야 합니다.');
      return;
    }
    if (!window.confirm(`${target.fileName}에서 복원하시겠습니까?\n\n현재 데이터가 덮어쓰기됩니다.`)) return;

    setRestoring(true);
    try {
      await invoke('backup:restore', { id: target.id, includeDB: opts.includeDB, includeSVN: opts.includeSVN });
      alert('복원이 완료되었습니다. 앱을 재시작해 주세요.');
      onDone();
    } catch (err) {
      alert(err instanceof Error ? err.message : '복원 실패');
    } finally {
      setRestoring(false);
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
        style={{ background: '#fff', borderRadius: 8, padding: 24, width: 440, border: `1px solid ${colors.border}` }}
      >
        <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700 }}>백업 복원</h3>
        <p style={{ fontSize: 12, color: colors.textMuted, margin: '0 0 16px' }}>
          원본: <code>{target.fileName}</code> · {formatBytes(target.sizeBytes)}
        </p>

        <div style={{ marginBottom: 16, padding: 12, background: colors.orangeBg, borderRadius: 4, fontSize: 12, color: colors.orange }}>
          ⚠ 복원 시 현재 데이터가 덮어쓰기됩니다. 복원 전에 현재 상태를 백업하는 것을 권장합니다.
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>복원 대상</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '6px 0' }}>
            <input
              type="checkbox"
              checked={opts.includeDB}
              onChange={(e) => setOpts(prev => ({ ...prev, includeDB: e.target.checked }))}
            />
            <span style={{ fontSize: 13 }}>DB (설정·태그·북마크·활동 로그)</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '6px 0' }}>
            <input
              type="checkbox"
              checked={opts.includeSVN}
              onChange={(e) => setOpts(prev => ({ ...prev, includeSVN: e.target.checked }))}
            />
            <span style={{ fontSize: 13 }}>SVN 저장소 (파일 + 커밋 이력)</span>
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button style={btn.ghost} onClick={onClose}>취소</button>
          <button
            style={{ ...btn.primary, opacity: restoring ? 0.6 : 1 }}
            onClick={handleRestore}
            disabled={restoring}
          >
            {restoring ? '복원 중...' : '복원'}
          </button>
        </div>
      </div>
    </div>
  );
}
