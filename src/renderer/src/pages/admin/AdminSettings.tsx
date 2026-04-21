/**
 * AdminSettings — 시스템 설정 (와이어프레임 섹션 18)
 *
 * 역할: 카테고리별(일반/파일) 설정 조회·변경·초기화.
 * 구성: AdminSettings (메인) / CategoryTab / SettingRow / 카테고리 정의
 *
 * 연동 IPC: settings:get, settings:update, settings:reset-category
 */

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@renderer/services/ipcClient';
import { colors } from '@renderer/design/theme';
import { page, card, btn } from './adminStyles';
import type { AppSettings } from '@shared/types/ipc';

type CategoryId = 'general' | 'file';

interface FieldDef {
  key: keyof AppSettings;
  label: string;
  type: 'text' | 'number' | 'toggle' | 'select';
  help?: string;
  options?: Array<{ value: string; label: string }>;
}

interface CategoryDef {
  id: CategoryId;
  label: string;
  icon: string;
  fields: FieldDef[];
}

const CATEGORIES: CategoryDef[] = [
  {
    id: 'general',
    label: '일반',
    icon: '⚙',
    fields: [
      {
        key: 'theme', label: '테마', type: 'select',
        options: [
          { value: 'system', label: '시스템 기본' },
          { value: 'light', label: '라이트' },
          { value: 'dark', label: '다크' },
        ],
      },
      {
        key: 'language', label: '언어', type: 'select',
        options: [{ value: 'ko', label: '한국어' }, { value: 'en', label: 'English' }],
      },
      { key: 'sidebarWidth', label: '사이드바 너비 (px)', type: 'number' },
      {
        key: 'defaultView', label: '기본 보기', type: 'select',
        options: [{ value: 'list', label: '목록' }, { value: 'grid', label: '격자' }],
      },
    ],
  },
  {
    id: 'file',
    label: '파일',
    icon: '📁',
    fields: [
      { key: 'svnBinaryPath', label: 'SVN 바이너리 경로', type: 'text', help: '비워두면 번들 SVN + 시스템 탐색' },
      { key: 'libreOfficePath', label: 'LibreOffice 경로', type: 'text', help: '미리보기 변환용 (자동 감지)' },
      { key: 'autoCommit', label: '자동 커밋', type: 'toggle', help: '파일 감시 후 자동 커밋' },
      { key: 'autoCommitDelay', label: '자동 커밋 지연 (초)', type: 'number' },
    ],
  },
];

export default function AdminSettings() {
  const qc = useQueryClient();
  const [active, setActive] = useState<CategoryId>('general');
  const [draft, setDraft] = useState<Partial<AppSettings>>({});
  const [dirty, setDirty] = useState(false);

  const { data: settings } = useQuery({
    queryKey: ['settings:get'],
    queryFn: () => invoke('settings:get'),
  });

  useEffect(() => {
    if (settings) { setDraft({}); setDirty(false); }
  }, [settings]);

  if (!settings) return <div style={page.root}>로딩 중...</div>;

  const current: AppSettings = { ...settings, ...draft };
  const currentCategory = CATEGORIES.find(c => c.id === active)!;

  const updateField = (key: keyof AppSettings, value: AppSettings[keyof AppSettings]) => {
    setDraft(prev => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSave = async () => {
    try {
      await invoke('settings:update', draft as AppSettings);
      await qc.invalidateQueries({ queryKey: ['settings:get'] });
      setDraft({}); setDirty(false);
      alert('설정이 저장되었습니다.');
    } catch (err) {
      alert(err instanceof Error ? err.message : '저장 실패');
    }
  };

  const handleResetCategory = async () => {
    if (!window.confirm(`"${currentCategory.label}" 카테고리를 기본값으로 초기화하시겠습니까?`)) return;
    try {
      await invoke('settings:reset-category', { category: active });
      await qc.invalidateQueries({ queryKey: ['settings:get'] });
      setDraft({}); setDirty(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : '초기화 실패');
    }
  };

  return (
    <div style={page.root}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4, marginBottom: 4 }}>
        <h1 style={{ ...page.title, margin: 0 }}>⚙ 시스템 설정</h1>
      </div>
      <p style={page.desc}>DB 저장 설정 (환경변수 &gt; config &gt; DB 우선순위)</p>

      {/* 카테고리 탭 */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {CATEGORIES.map(cat => {
          const isActive = active === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setActive(cat.id)}
              style={{
                padding: '10px 18px',
                fontSize: 13,
                fontWeight: isActive ? 600 : 400,
                background: isActive ? colors.bgPrimary : 'transparent',
                color: isActive ? colors.navy : colors.textSub,
                border: `1px solid ${colors.border}`,
                borderBottom: isActive ? `1px solid ${colors.bgPrimary}` : `1px solid ${colors.border}`,
                borderRadius: '6px 6px 0 0',
                cursor: 'pointer',
                marginBottom: -1,
              }}
            >
              {cat.icon} {cat.label}
            </button>
          );
        })}
      </div>

      {/* 필드 카드 */}
      <div style={card.root}>
        <h2 style={card.title}>{currentCategory.label} 설정</h2>

        {currentCategory.fields.map(f => (
          <SettingRow key={String(f.key)} def={f} value={current[f.key]} onChange={(v) => updateField(f.key, v)} />
        ))}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20, paddingTop: 16, borderTop: `1px solid ${colors.borderLight}` }}>
          <button style={btn.ghost} onClick={handleResetCategory}>카테고리 초기화</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              style={btn.ghost}
              onClick={() => { setDraft({}); setDirty(false); }}
              disabled={!dirty}
            >
              되돌리기
            </button>
            <button
              style={{ ...btn.primary, opacity: dirty ? 1 : 0.5, cursor: dirty ? 'pointer' : 'not-allowed' }}
              onClick={handleSave}
              disabled={!dirty}
            >
              저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────── SettingRow ────────────────────── */

function SettingRow({
  def, value, onChange,
}: { def: FieldDef; value: AppSettings[keyof AppSettings]; onChange: (v: AppSettings[keyof AppSettings]) => void }) {
  const rowStyle = { padding: '12px 0', borderBottom: `1px solid ${colors.borderLight}`, display: 'flex', alignItems: 'center', gap: 16 };
  const labelStyle = { flexBasis: 200, flexShrink: 0, fontSize: 13, fontWeight: 500, color: colors.text };
  const helpStyle = { fontSize: 11, color: colors.textMuted, marginTop: 2 };
  const inputBaseStyle = { padding: '6px 10px', fontSize: 13, border: `1px solid ${colors.border}`, borderRadius: 4, minWidth: 240 };

  return (
    <div style={rowStyle}>
      <div style={labelStyle}>
        {def.label}
        {def.help && <div style={helpStyle}>{def.help}</div>}
      </div>
      <div>
        {def.type === 'text' && (
          <input
            type="text"
            value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value as AppSettings[keyof AppSettings])}
            style={inputBaseStyle}
            placeholder={def.help}
          />
        )}
        {def.type === 'number' && (
          <input
            type="number"
            value={Number(value ?? 0)}
            onChange={(e) => onChange(Number(e.target.value) as AppSettings[keyof AppSettings])}
            style={{ ...inputBaseStyle, minWidth: 120 }}
          />
        )}
        {def.type === 'toggle' && (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={Boolean(value)}
              onChange={(e) => onChange(e.target.checked as AppSettings[keyof AppSettings])}
            />
            <span style={{ fontSize: 13 }}>{value ? '켜짐' : '꺼짐'}</span>
          </label>
        )}
        {def.type === 'select' && (
          <select
            value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value as AppSettings[keyof AppSettings])}
            style={inputBaseStyle}
          >
            {def.options?.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
