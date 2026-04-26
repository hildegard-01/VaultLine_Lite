/**
 * AdminUsers — 서버 사용자 관리 (시스템 관리자 전용)
 *
 * 역할: 서버 JWT 사용자 목록 조회, 생성, 상태 변경(잠금 해제 포함),
 *       비밀번호 초기화, 강제 로그아웃, 삭제.
 *
 * 연동 IPC: admin:user-list/create/update/delete/reset-password/force-logout
 */

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@renderer/services/ipcClient';
import { colors } from '@renderer/design/theme';
import { page, card, table, btn, formatDate } from './adminStyles';
import type { CSSProperties } from 'react';

interface ServerUser {
  id: number
  username: string
  display_name: string | null
  email: string | null
  role: string
  status: string
  is_online: boolean
  last_seen: string | null
  created_at: string
}

export default function AdminUsers() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingUser, setEditingUser] = useState<ServerUser | null>(null);
  const [tempPassword, setTempPassword] = useState<{ username: string; pw: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin:user-list', search],
    queryFn: () => invoke('admin:user-list' as any, { skip: 0, limit: 100, search: search || undefined }),
  });

  const users: ServerUser[] = (data as any)?.items ?? [];
  const total: number = (data as any)?.total ?? 0;
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin:user-list'] });

  const activeCount = users.filter(u => u.status === 'active').length;
  const lockedCount = users.filter(u => u.status === 'locked').length;
  const inactiveCount = users.filter(u => u.status === 'inactive').length;

  const handleStatusChange = async (userId: number, status: string) => {
    try {
      await invoke('admin:user-update' as any, { userId, status });
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : '상태 변경 실패');
    }
  };

  const handleDelete = async (u: ServerUser) => {
    if (!window.confirm(`"${u.display_name || u.username}" 계정을 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`)) return;
    try {
      await invoke('admin:user-delete' as any, { userId: u.id });
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : '삭제 실패');
    }
  };

  const handleResetPassword = async (u: ServerUser) => {
    if (!window.confirm(`"${u.display_name || u.username}"의 비밀번호를 초기화하시겠습니까?\n\n임시 비밀번호가 발급되고 기존 세션은 모두 만료됩니다.`)) return;
    try {
      const result = await invoke('admin:user-reset-password' as any, { userId: u.id }) as any;
      setTempPassword({ username: u.display_name || u.username, pw: result.temp_password });
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : '비밀번호 초기화 실패');
    }
  };

  const handleForceLogout = async (u: ServerUser) => {
    if (!window.confirm(`"${u.display_name || u.username}"을(를) 강제 로그아웃하시겠습니까?`)) return;
    try {
      await invoke('admin:user-force-logout' as any, { userId: u.id });
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : '강제 로그아웃 실패');
    }
  };

  const statusBadge = (status: string, isOnline: boolean) => {
    if (status === 'locked') return <span style={{ color: colors.red, fontWeight: 700 }}>● 잠김</span>;
    if (status === 'inactive') return <span style={{ color: colors.textMuted, fontWeight: 600 }}>● 비활성</span>;
    return (
      <span style={{ color: isOnline ? colors.green : colors.textSub, fontWeight: 600 }}>
        ● {isOnline ? '온라인' : '활성'}
      </span>
    );
  };

  return (
    <div style={page.root}>
      <h1 style={page.title}>👥 사용자 관리</h1>
      <p style={page.desc}>서버에 등록된 사용자 계정을 관리합니다.</p>

      {/* 통계 + 검색 + 추가 버튼 */}
      <div style={{ ...card.root, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
          <span><strong>{total}</strong>명 전체</span>
          <span style={{ color: colors.green }}>활성 {activeCount}</span>
          <span style={{ color: colors.red }}>잠김 {lockedCount}</span>
          <span style={{ color: colors.textMuted }}>비활성 {inactiveCount}</span>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="사용자명 · 이름 · 이메일 검색"
          style={{
            flex: 1, minWidth: 200, padding: '6px 10px', fontSize: 13,
            border: `1px solid ${colors.border}`, borderRadius: 4,
          }}
        />
        <button style={btn.primary} onClick={() => setShowCreate(true)}>＋ 사용자 추가</button>
      </div>

      {/* 사용자 테이블 */}
      <div style={card.root}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 40, color: colors.textMuted }}>불러오는 중...</div>
        ) : (
          <table style={table.root}>
            <thead>
              <tr>
                <th style={table.th}>사용자명</th>
                <th style={table.th}>표시 이름</th>
                <th style={table.th}>이메일</th>
                <th style={table.th}>역할</th>
                <th style={table.th}>상태</th>
                <th style={table.th}>마지막 접속</th>
                <th style={{ ...table.th, width: 280 }}>작업</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td style={table.td}><code style={{ fontSize: 12 }}>{u.username}</code></td>
                  <td style={table.td}>{u.display_name || '—'}</td>
                  <td style={table.td} ><span style={{ fontSize: 12, color: colors.textSub }}>{u.email || '—'}</span></td>
                  <td style={table.td}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                      background: u.role === 'admin' ? '#fff0f0' : '#f0f4ff',
                      color: u.role === 'admin' ? colors.red : colors.blue,
                    }}>
                      {u.role === 'admin' ? '관리자' : '일반'}
                    </span>
                  </td>
                  <td style={table.td}>{statusBadge(u.status, u.is_online)}</td>
                  <td style={table.td}><span style={{ fontSize: 12 }}>{formatDate(u.last_seen)}</span></td>
                  <td style={table.td}>
                    <ActionButtons
                      user={u}
                      onEdit={setEditingUser}
                      onStatusChange={handleStatusChange}
                      onResetPassword={handleResetPassword}
                      onForceLogout={handleForceLogout}
                      onDelete={handleDelete}
                    />
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ ...table.td, textAlign: 'center', color: colors.textMuted, padding: 48 }}>
                    {search ? '검색 결과가 없습니다.' : '사용자가 없습니다.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); refresh(); }}
        />
      )}

      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={() => { setEditingUser(null); refresh(); }}
        />
      )}

      {tempPassword && (
        <TempPasswordModal
          username={tempPassword.username}
          tempPassword={tempPassword.pw}
          onClose={() => setTempPassword(null)}
        />
      )}
    </div>
  );
}

/* ────────────────────── 작업 버튼 그룹 ────────────────────── */

function ActionButtons({ user, onEdit, onStatusChange, onResetPassword, onForceLogout, onDelete }: {
  user: ServerUser
  onEdit: (u: ServerUser) => void
  onStatusChange: (id: number, status: string) => void
  onResetPassword: (u: ServerUser) => void
  onForceLogout: (u: ServerUser) => void
  onDelete: (u: ServerUser) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      <button
        style={{ ...btn.ghost, ...btn.small, color: colors.blue }}
        onClick={() => onEdit(user)}
      >
        수정
      </button>
      {/* 잠금 해제 — locked 상태에서 강조 표시 */}
      {user.status === 'locked' && (
        <button
          style={{ ...btn.ghost, ...btn.small, color: colors.green, borderColor: '#c8f0d8', background: '#f0faf4', fontWeight: 700 }}
          onClick={() => onStatusChange(user.id, 'active')}
          title="로그인 잠금 해제"
        >
          🔓 잠금 해제
        </button>
      )}
      {/* 활성화 — inactive 상태 */}
      {user.status === 'inactive' && (
        <button
          style={{ ...btn.ghost, ...btn.small, color: colors.blue, borderColor: colors.blueBg }}
          onClick={() => onStatusChange(user.id, 'active')}
        >
          활성화
        </button>
      )}
      {/* 비활성화 — active 상태 */}
      {user.status === 'active' && (
        <button
          style={{ ...btn.ghost, ...btn.small, color: colors.textMuted }}
          onClick={() => onStatusChange(user.id, 'inactive')}
        >
          비활성화
        </button>
      )}
      <button
        style={{ ...btn.ghost, ...btn.small }}
        onClick={() => onResetPassword(user)}
        title="임시 비밀번호 발급"
      >
        비번 초기화
      </button>
      {user.is_online && (
        <button
          style={{ ...btn.ghost, ...btn.small, color: colors.orange }}
          onClick={() => onForceLogout(user)}
        >
          강제 로그아웃
        </button>
      )}
      <button
        style={{ ...btn.danger, ...btn.small }}
        onClick={() => onDelete(user)}
      >
        삭제
      </button>
    </div>
  );
}

/* ────────────────────── 사용자 수정 모달 ────────────────────── */

function EditUserModal({ user, onClose, onSaved }: { user: ServerUser; onClose: () => void; onSaved: () => void }) {
  const [displayName, setDisplayName] = useState(user.display_name || '');
  const [email, setEmail] = useState(user.email || '');
  const [role, setRole] = useState<'user' | 'admin'>(user.role as 'user' | 'admin');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      await invoke('admin:user-update' as any, {
        userId: user.id,
        display_name: displayName.trim() || null,
        email: email.trim() || null,
        role,
      });
      onSaved();
    } catch (err) {
      alert(err instanceof Error ? err.message : '수정 실패');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalFrame title={`사용자 수정 — ${user.username}`} onClose={onClose}>
      <div style={{ marginBottom: 10, padding: '6px 10px', background: '#f5f7fa', borderRadius: 4, fontSize: 12, color: colors.textSub }}>
        사용자명(ID)은 변경할 수 없습니다: <code>{user.username}</code>
      </div>
      <Field label="표시 이름" value={displayName} onChange={setDisplayName} placeholder="홍길동" />
      <Field label="이메일" value={email} onChange={setEmail} placeholder="user@example.com" type="email" />
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 11, color: colors.textMuted, display: 'block', marginBottom: 4 }}>역할</label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as 'user' | 'admin')}
          style={{ width: '100%', padding: '6px 10px', fontSize: 13, border: `1px solid ${colors.border}`, borderRadius: 4 }}
        >
          <option value="user">일반 사용자</option>
          <option value="admin">관리자</option>
        </select>
      </div>
      <ModalButtons onClose={onClose} primaryLabel={loading ? '저장 중...' : '저장'} onPrimary={handleSave} disabled={loading} />
    </ModalFrame>
  );
}

/* ────────────────────── 사용자 추가 모달 ────────────────────── */

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'user' | 'admin'>('user');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!username.trim() || !password.trim()) {
      alert('사용자명과 비밀번호는 필수입니다.');
      return;
    }
    setLoading(true);
    try {
      await invoke('admin:user-create' as any, {
        username: username.trim(),
        display_name: displayName.trim() || undefined,
        email: email.trim() || undefined,
        password,
        role,
      });
      onCreated();
    } catch (err) {
      alert(err instanceof Error ? err.message : '사용자 추가 실패');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalFrame title="사용자 추가" onClose={onClose}>
      <Field label="사용자명 *" value={username} onChange={setUsername} placeholder="user01" mono />
      <Field label="표시 이름" value={displayName} onChange={setDisplayName} placeholder="홍길동" />
      <Field label="이메일" value={email} onChange={setEmail} placeholder="user@example.com" type="email" />
      <Field label="비밀번호 * (8자 이상)" value={password} onChange={setPassword} type="password" />
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 11, color: colors.textMuted, display: 'block', marginBottom: 4 }}>역할</label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as 'user' | 'admin')}
          style={{ width: '100%', padding: '6px 10px', fontSize: 13, border: `1px solid ${colors.border}`, borderRadius: 4 }}
        >
          <option value="user">일반 사용자</option>
          <option value="admin">관리자</option>
        </select>
      </div>
      <ModalButtons onClose={onClose} primaryLabel={loading ? '추가 중...' : '추가'} onPrimary={handleCreate} disabled={loading} />
    </ModalFrame>
  );
}

/* ────────────────────── 임시 비밀번호 표시 모달 ────────────────────── */

function TempPasswordModal({ username, tempPassword, onClose }: {
  username: string
  tempPassword: string
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(tempPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const pwBoxStyle: CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8,
    background: '#f5f7fa', borderRadius: 6, padding: '10px 14px',
    marginBottom: 12, border: `1px solid ${colors.border}`,
  };

  return (
    <ModalFrame title="임시 비밀번호 발급 완료" onClose={onClose}>
      <p style={{ fontSize: 13, color: colors.textSub, margin: '0 0 12px' }}>
        <strong>{username}</strong>의 임시 비밀번호가 발급되었습니다.<br />
        사용자에게 전달 후 즉시 변경을 안내하세요.
      </p>
      <div style={pwBoxStyle}>
        <code style={{ flex: 1, fontSize: 15, fontWeight: 700, letterSpacing: 1, color: colors.navy }}>
          {tempPassword}
        </code>
        <button
          style={{ ...btn.ghost, ...btn.small, color: copied ? colors.green : colors.blue }}
          onClick={handleCopy}
        >
          {copied ? '복사됨' : '복사'}
        </button>
      </div>
      <p style={{ fontSize: 11, color: colors.red, margin: '0 0 16px' }}>
        ※ 이 창을 닫으면 임시 비밀번호를 다시 확인할 수 없습니다.
      </p>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button style={btn.primary} onClick={onClose}>확인</button>
      </div>
    </ModalFrame>
  );
}

/* ────────────────────── 공통 UI 헬퍼 ────────────────────── */

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
        style={{ background: '#fff', borderRadius: 8, padding: 24, width: 440, border: `1px solid ${colors.border}` }}
      >
        <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700 }}>{title}</h3>
        {children}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type, mono }: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; type?: string; mono?: boolean
}) {
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

function ModalButtons({ onClose, primaryLabel, onPrimary, disabled }: {
  onClose: () => void; primaryLabel: string; onPrimary: () => void; disabled?: boolean
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
      <button style={btn.ghost} onClick={onClose}>취소</button>
      <button style={{ ...btn.primary, opacity: disabled ? 0.6 : 1 }} onClick={onPrimary} disabled={disabled}>
        {primaryLabel}
      </button>
    </div>
  );
}
