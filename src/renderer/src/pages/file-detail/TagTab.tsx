/**
 * 태그 관리 탭
 *
 * 역할: 파일에 태그를 부착/해제합니다. 전체 태그 목록에서 선택하여 추가.
 */

import { useState, type CSSProperties } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@renderer/services/ipcClient';
import { colors } from '@renderer/design/theme';
import { X } from '@renderer/design/Icons';
import type { Tag } from '@shared/types/ipc';

interface TagTabProps {
  repoId: number;
  filePath: string;
}

const S: Record<string, CSSProperties> = {
  inputRow: {
    display: 'flex',
    gap: 8,
    marginBottom: 20,
  },
  input: {
    flex: 1,
    padding: '8px 12px',
    borderRadius: 6,
    border: `1px solid ${colors.border}`,
    fontSize: 13,
    outline: 'none',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: 10,
  },
  tagList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
  },
  empty: {
    fontSize: 13,
    color: colors.textMuted,
    padding: '8px 0',
  },
  infoBox: {
    padding: '12px 16px',
    borderRadius: 8,
    background: colors.purpleBg,
    border: `1px solid ${colors.purple}20`,
    fontSize: 12,
    color: colors.textSub,
    lineHeight: 1.6,
  },
};

function TagPill({ name, color: tagColor, onRemove }: { name: string; color: string | null; onRemove?: () => void }) {
  const c = tagColor || colors.blue;
  const pillStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    borderRadius: 14,
    background: `${c}18`,
    border: `1px solid ${c}40`,
    color: c,
    fontSize: 12,
    fontWeight: 500,
  };
  const removeStyle: CSSProperties = {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    display: 'flex',
    opacity: 0.6,
  };

  return (
    <span style={pillStyle}>
      {name}
      {onRemove && (
        <button style={removeStyle} onClick={onRemove} title="태그 제거">
          <X width={12} height={12} color={c} />
        </button>
      )}
    </span>
  );
}

export default function TagTab({ repoId, filePath }: TagTabProps) {
  const queryClient = useQueryClient();
  const [inputValue, setInputValue] = useState('');

  /* 파일의 현재 태그 */
  const { data: fileTags = [] } = useQuery({
    queryKey: ['tag:file-tags', repoId, filePath],
    queryFn: () => invoke('tag:file-tags', { repoId, filePath }),
  });

  /* 전체 태그 목록 */
  const { data: allTags = [] } = useQuery({
    queryKey: ['tag:list'],
    queryFn: () => invoke('tag:list'),
  });

  const attachMutation = useMutation({
    mutationFn: (tagId: number) => invoke('tag:attach', { repoId, filePath, tagId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tag:file-tags', repoId, filePath] });
    },
  });

  const detachMutation = useMutation({
    mutationFn: (tagId: number) => invoke('tag:detach', { repoId, filePath, tagId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tag:file-tags', repoId, filePath] });
    },
  });

  const fileTagList = fileTags as Tag[];
  const allTagList = allTags as Tag[];
  const fileTagIds = new Set(fileTagList.map((t) => t.id));

  const handleAttach = () => {
    const name = inputValue.trim();
    if (!name) return;
    const found = allTagList.find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (!found) {
      alert(`"${name}" 태그를 찾을 수 없습니다. 사이드바에서 먼저 태그를 생성해 주세요.`);
      return;
    }
    if (fileTagIds.has(found.id)) {
      alert('이미 부착된 태그입니다.');
      return;
    }
    attachMutation.mutate(found.id);
    setInputValue('');
  };

  /* 미부착 태그 (빠른 추가용) */
  const availableTags = allTagList.filter((t) => !fileTagIds.has(t.id));

  return (
    <div>
      {/* 태그 입력 */}
      <div style={S.inputRow}>
        <input
          style={S.input}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="태그명 입력 후 Enter"
          onKeyDown={(e) => { if (e.key === 'Enter') handleAttach(); }}
        />
      </div>

      {/* 현재 태그 */}
      <div style={S.section}>
        <div style={S.sectionTitle}>현재 태그</div>
        <div style={S.tagList}>
          {fileTagList.length === 0 ? (
            <div style={S.empty}>태그가 없습니다.</div>
          ) : (
            fileTagList.map((tag) => (
              <TagPill
                key={tag.id}
                name={tag.name}
                color={tag.color}
                onRemove={() => detachMutation.mutate(tag.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* 사용 가능한 태그 (빠른 추가) */}
      {availableTags.length > 0 && (
        <div style={S.section}>
          <div style={S.sectionTitle}>태그 추가</div>
          <div style={S.tagList}>
            {availableTags.map((tag) => (
              <button
                key={tag.id}
                onClick={() => attachMutation.mutate(tag.id)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '4px 10px', borderRadius: 14,
                  background: `${tag.color || colors.blue}10`,
                  border: `1px dashed ${tag.color || colors.blue}40`,
                  color: tag.color || colors.blue,
                  fontSize: 12, cursor: 'pointer',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = `${tag.color || colors.blue}20`; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = `${tag.color || colors.blue}10`; }}
              >
                + {tag.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 안내 */}
      <div style={S.infoBox}>
        태그 규칙이 설정된 경우, 파일 업로드 시 이름/확장자에 따라 자동으로 태그가 부착됩니다.
      </div>
    </div>
  );
}
