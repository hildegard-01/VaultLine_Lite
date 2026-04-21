/**
 * AdminUsers — 사용자 관리 (와이어프레임 섹션 15, P2P shared-user 기반)
 *
 * 역할: Lite 오프라인 환경의 사용자 관리 = P2P 저장소별 공유 사용자 관리.
 *       저장소를 선택하면 해당 저장소의 사용자 목록 + 추가/수정/상태변경/비번 변경.
 * 구성: AdminUsers (메인) / 저장소 셀렉터 / 사용자 테이블 / 추가 모달 / 비번 변경 모달
 *
 * 연동 IPC: repo:list, shared-user:list/create/update/delete/reset-password
 */

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@renderer/services/ipcClient';
import { colors } from '@renderer/design/theme';
import { page, card, table, btn, formatDate } from './adminStyles';
import type { SharedUser } from '@shared/types/ipc';

export default function AdminUsers() {
  const qc = useQueryClient();
  const [selectedRepoId, setSelectedRepoId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [passwordTarget, setPasswordTarget] = useState<SharedUser | null>(null);

  const { data: repos = [] } = useQuery({
    queryKey: ['repo:list'],
    queryFn: () => invoke('repo:list'),
  });

  // 기본 저장소 자동 선택
  useEffect(() => {
    if (selectedRepoId == null && repos.length > 0) {
      setSelectedRepoId(repos[0].id);
    }
  }, [repos, selectedRepoId]);

  const { data: users = [] } = useQuery({
    queryKey: ['shared-user:list', selectedRepoId],
    queryFn: () => invoke('shared-user:list', { repoId: selectedRepoId! }),
    enabled: selectedRepoId != null,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['shared-user:list', selectedRepoId] });

  // 통계
  const active = users.filter(u => (u.status ?? 'active') === 'active').length;
  const locked = users.filter(u => u.status === 'locked').length;
  const inactive = users.filter(u => u.status === 'inactive').length;

  const handleSetStatus = async (id: number, status: 'active' | 'locked' | 'inactive') => {
    try {
      await invoke('shared-user:update', { id, status });
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : '상태 변경 실패');
    }
  };

  const handleDelete = async (u: SharedUser) => {
    if (!window.confirm(`"${u.displayName}" 사용자를 삭제하시겠습니까?`)) return;
    try {
      await invoke('shared-user:delete', { id: u.id });
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : '삭제 실패');
    }
  };

  return (
    <div style={page.root}>
      <h1 style={page.title}>👥 사용자 관리</h1>
      <p style={page.desc}>
        P2P 공유에 사용되는 저장소별 사용자 계정을 관리합니다.
        (Lite 오프라인 모드 — 전체 계정 관리는 서버 연결 시 지원)
      </p>

      {/* 저장소 셀렉터 + 통계 */}
      <div style={{ ...card.root, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <label style={{ fontSize: 11, color: colors.textMuted, display: 'block', marginBottom: 4 }}>저장소</label>
          <select
            value={selectedRepoId ?? ''}
            onChange={(e) => setSelectedRepoId(Number(e.target.value))}
            style={{ padding: '6px 10px', fontSize: 13, border: `1px solid ${colors.border}`, borderRadius: 4, minWidth: 200 }}
          >
            {repos.length === 0 && <option>저장소 없음</option>}
            {repos.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
          <div><strong>{users.length}</strong> 명 전체</div>
          <div style={{ color: colors.green }}>활성 {active}</div>
          <div style={{ color: colors.orange }}>잠김 {locked}</div>
          <div style={{ color: colors.textMuted }}>비활성 {inactive}</div>
        </div>
        <div style={{ flex: 1 }} />
        <button
          style={btn.primary}
          onClick={() => setShowCreate(true)}
          disabled={selectedRepoId == null}
        >
          ＋ 사용자 추가
        </button>
      </div>

      {/* 사용자 테이블 */}
      <div style={card.root}>
        <table style={table.root}>
          <thead>
            <tr>
              <th style={table.th}>사용자 ID</th>
              <th style={table.th}>표시 이름</th>
              <th style={table.th}>권한</th>
              <th style={table.th}>상태</th>
              <th style={table.th}>실패 횟수</th>
              <th style={table.th}>마지막 로그인</th>
              <th style={{ ...table.th, width: 260 }}>작업</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => {
              const st = u.status ?? 'active';
              const stColor = st === 'active' ? colors.green : st === 'locked' ? colors.orange : colors.textMuted;
              const stLabel = st === 'active' ? '활성' : st === 'locked' ? '잠김' : '비활성';
              return (
                <tr key={u.id}>
                  <td style={table.td}><code>{u.username}</code></td>
                  <td style={table.td}>{u.displayName}</td>
                  <td style={table.td}>{u.permission === 'rw' ? '읽기/쓰기' : '읽기'}</td>
                  <td style={table.td}>
                    <span style={{ color: stColor, fontWeight: 600 }}>● {stLabel}</span>
                  </td>
                  <td style={table.td}>
                    <span style={{ color: (u.failedLoginCount ?? 0) > 0 ? colors.orange : colors.textMuted }}>
                      {u.failedLoginCount ?? 0}회
                    </span>
                  </td>
                  <td style={table.td}>{formatDate(u.lastLoginAt)}</td>
                  <td style={table.td}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      <button
                        style={{ ...btn.ghost, ...btn.small }}
                        onClick={() => setPasswordTarget(u)}
                      >
                        비밀번호
                      </button>
                      {st !== 'active' && (
                        <button
                          style={{ ...btn.ghost, ...btn.small, color: colors.green, borderColor: colors.greenBg }}
                          onClick={() => handleSetStatus(u.id, 'active')}
                        >
                          활성화
                        </button>
                      )}
                      {st === 'active' && (
                        <button
                          style={{ ...btn.ghost, ...btn.small, color: colors.orange, borderColor: colors.orangeBg }}
                          onClick={() => handleSetStatus(u.id, 'locked')}
                        >
                          잠금
                        </button>
                      )}
                      <button
                        style={{ ...btn.danger, ...btn.small }}
                        onClick={() => handleDelete(u)}
                      >
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {users.length === 0 && (
              <tr>
                <td colSpan={7} style={{ ...table.td, textAlign: 'center', color: colors.textMuted, padding: 48 }}>
                  {selectedRepoId == null ? '저장소를 먼저 선택하세요.' : '사용자가 없습니다.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showCreate && selectedRepoId != null && (
        <CreateUserModal
          repoId={selectedRepoId}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); refresh(); }}
        />
      )}

      {passwordTarget && (
        <PasswordModal
          user={passwordTarget}
          onClose={() => setPasswordTarget(null)}
          onChanged={() => { setPasswordTarget(null); refresh(); }}
        />
      )}
    </div>
  );
}

/* ────────────────────── 사용자 추가 모달 ────────────────────── */

function CreateUserModal({
  repoId, onClose, onCreated,
}: { repoId: number; onClose: () => void; onCreated: () => void }) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [permission, setPermission] = useState<'r' | 'rw'>('rw');

  const handleCreate = async () => {
    if (!username.trim() || !displayName.trim() || !password.trim()) {
      alert('모든 필드를 입력하세요.');
      return;
    }
    try {
      await invoke('shared-user:create', {
        repoId, username: username.trim(), displayName: displayName.trim(),
        password, permission,
      });
      onCreated();
    } catch (err) {
      alert(err instanceof Error ? err.message : '사용자 추가 실패');
    }
  };

  return (
    <ModalFrame title="사용자 추가" onClose={onClose}>
      <Field label="사용자 ID" value={username} onChange={setUsername} placeholder="user01" mono />
      <Field label="표시 이름" value={displayName} onChange={setDisplayName} placeholder="홍길동" />
      <Field label="비밀번호" value={password} onChange={setPassword} placeholder="" type="password" />
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 11, color: colors.textMuted, display: 'block', marginBottom: 4 }}>권한</label>
        <select
          value={permission}
          onChange={(e) => setPermission(e.target.value as 'r' | 'rw')}
          style={{ width: '100%', padding: '6px 10px', fontSize: 13, border: `1px solid ${colors.border}`, borderRadius: 4 }}
        >
          <option value="rw">읽기/쓰기</option>
          <option value="r">읽기 전용</option>
        </select>
      </div>
      <ModalButtons onClose={onClose} primaryLabel="추가" onPrimary={handleCreate} />
    </ModalFrame>
  );
}

/* ────────────────────── 비밀번호 변경 모달 ────────────────────── */

function PasswordModal({
  user, onClose, onChanged,
}: { user: SharedUser; onClose: () => void; onChanged: () => void }) {
  const [newPassword, setNewPassword] = useState('');

  const handleChange = async () => {
    if (!newPassword.trim()) { alert('새 비밀번호를 입력하세요.'); return; }
    try {
      await invoke('shared-user:reset-password', { id: user.id, newPassword });
      onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : '비밀번호 변경 실패');
    }
  };

  return (
    <ModalFrame title="비밀번호 변경" onClose={onClose}>
      <p style={{ fontSize: 12, color: colors.textMuted, margin: '0 0 12px' }}>
        대상: <strong>{user.displayName}</strong> ({user.username})
      </p>
      <Field label="새 비밀번호" value={newPassword} onChange={setNewPassword} type="password" />
      <ModalButtons onClose={onClose} primaryLabel="변경" onPrimary={handleChange} />
    </ModalFrame>
  );
}

/* ────────────────────── 공통 모달 헬퍼 ────────────────────── */

function ModalFrame({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
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
        <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700 }}>{title}</h3>
        {children}
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, type, mono,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; mono?: boolean }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 11, color: colors.textMuted, display: 'block', marginBottom: 4 }}>{label}</label>
      <input
        type={type || 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', padding: '6px 10px', fontSize: 13,
          border: `1px solid ${colors.border}`, borderRadius: 4,
          fontFamily: mono ? 'monospace' : 'inherit',
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
}

function ModalButtons({
  onClose, primaryLabel, onPrimary,
}: { onClose: () => void; primaryLabel: string; onPrimary: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
      <button style={btn.ghost} onClick={onClose}>취소</button>
      <button style={btn.primary} onClick={onPrimary}>{primaryLabel}</button>
    </div>
  );
}
