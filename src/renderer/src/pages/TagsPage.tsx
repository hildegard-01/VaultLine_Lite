/**
 * 태그 관리 페이지 (V2)
 *
 * 역할: 태그 CRUD + 복수 태그 AND/OR 파일 검색 + 자동 태그 룰 관리
 * 구성: 좌측 태그 목록 패널 / 우측 [파일 검색] [자동 규칙] 탭 패널
 */

import { useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { invoke } from '@renderer/services/ipcClient'
import { colors, fontFamily } from '@renderer/design/theme'
import { Tag as TagIcon, X } from '@renderer/design/Icons'
import { getFileIcon } from './file-detail/FileDetailPage'
import type { Tag } from '@shared/types/ipc'

/* ─── 상수 ─── */

const TAG_COLORS = ['#1565C0', '#2E7D32', '#E65100', '#6A1B9A', '#C62828', '#00838F', '#4E342E', '#37474F']

const PATTERN_TYPES = [
  { value: 'extension', label: '확장자', placeholder: '.docx' },
  { value: 'path',      label: '경로 prefix', placeholder: '/계약서/' },
  { value: 'name',      label: '파일명 포함', placeholder: '보고서' },
]

/* ─── 스타일 ─── */

type StyleFn = CSSProperties | ((...args: any[]) => CSSProperties)

const S = {
  page:       { display: 'flex', flex: 1, overflow: 'hidden', fontFamily },
  leftPanel:  { width: 280, flexShrink: 0, borderRight: `1px solid ${colors.borderLight}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  leftHeader: { padding: '14px 14px 10px', borderBottom: `1px solid ${colors.borderLight}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 },
  leftTitle:  { fontSize: 14, fontWeight: 700, color: colors.text, display: 'flex', alignItems: 'center', gap: 8 },
  leftScroll: { flex: 1, overflowY: 'auto' },
  tagRow:     { display: 'flex', alignItems: 'center', gap: 7, padding: '7px 12px', cursor: 'default' },
  tagDot:     { width: 10, height: 10, borderRadius: 3, flexShrink: 0 },
  tagCount:   { fontSize: 11, color: colors.textMuted, marginLeft: 'auto', flexShrink: 0 },
  iconBtn:    { background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', display: 'flex', alignItems: 'center', color: colors.textMuted },
  btn: (variant: 'primary' | 'ghost' = 'primary'): CSSProperties => ({
    border: 'none', cursor: 'pointer', borderRadius: 6,
    padding: '5px 12px', fontSize: 12, fontWeight: 500,
    background: variant === 'primary' ? colors.navy : colors.bgSecondary,
    color: variant === 'primary' ? '#fff' : colors.text,
  }),
  rightPanel:  { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  tabBar:      { display: 'flex', borderBottom: `1px solid ${colors.borderLight}`, padding: '0 20px', flexShrink: 0 },
  tab: (active: boolean): CSSProperties => ({
    padding: '10px 18px', fontSize: 13, fontWeight: active ? 600 : 400,
    color: active ? colors.navy : colors.textMuted,
    borderBottom: active ? `2px solid ${colors.navy}` : '2px solid transparent',
    cursor: 'pointer', background: 'none', border: 'none',
  }),
  content:    { flex: 1, overflowY: 'auto', padding: 20 },
  chip:       { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 500 },
  fileRow:    { display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', marginBottom: 2 },
  ruleRow:    { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, marginBottom: 4, background: colors.bgSecondary, fontSize: 13 },
  formBox:    { background: '#f9fafb', border: `1px solid ${colors.border}`, borderRadius: 8, padding: 12, marginBottom: 14 },
  input:      { border: `1px solid ${colors.border}`, borderRadius: 6, padding: '5px 9px', fontSize: 12, outline: 'none', fontFamily },
  select:     { border: `1px solid ${colors.border}`, borderRadius: 6, padding: '5px 8px', fontSize: 12, outline: 'none', fontFamily, background: '#fff' },
  empty:      { textAlign: 'center', padding: '48px 0', color: colors.textMuted, fontSize: 13 },
  swatch: (c: string, selected: boolean): CSSProperties => ({
    width: 18, height: 18, borderRadius: 4, background: c, cursor: 'pointer', flexShrink: 0,
    border: selected ? '2px solid #333' : '2px solid transparent',
    transform: selected ? 'scale(1.2)' : 'none', transition: 'transform 0.1s',
  }),
} satisfies Record<string, StyleFn>

function formatSize(bytes: number): string {
  if (!bytes) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

/* ─── 메인 컴포넌트 ─── */

export function TagsPage() {
  const navigate    = useNavigate()
  const queryClient = useQueryClient()

  /* 탭 */
  const [activeTab, setActiveTab] = useState<'search' | 'rules'>('search')

  /* 태그 생성 */
  const [showCreate, setShowCreate]   = useState(false)
  const [newName, setNewName]         = useState('')
  const [newColor, setNewColor]       = useState('#1565C0')

  /* 태그 인라인 수정 */
  const [editingTag, setEditingTag]   = useState<Tag | null>(null)
  const [editName, setEditName]       = useState('')
  const [editColor, setEditColor]     = useState('')

  /* 파일 검색 */
  const [selectedTags, setSelectedTags] = useState<Tag[]>([])
  const [searchMode, setSearchMode]     = useState<'and' | 'or'>('or')
  const [showPicker, setShowPicker]     = useState(false)

  /* 자동 규칙 추가 */
  const [showRuleForm, setShowRuleForm]       = useState(false)
  const [ruleTagId, setRuleTagId]             = useState<number | ''>('')
  const [rulePatternType, setRulePatternType] = useState('extension')
  const [rulePattern, setRulePattern]         = useState('')
  const [retroApplying, setRetroApplying]     = useState(false)
  const [retroResult, setRetroResult]         = useState<string | null>(null)

  /* ─ 쿼리 ─ */
  const { data: rawTags = [] } = useQuery({ queryKey: ['tag:list'],   queryFn: () => invoke('tag:list') })
  const { data: rawCounts = {} } = useQuery({ queryKey: ['tag:counts'], queryFn: () => invoke('tag:counts') })
  const { data: rawFiles = [], isLoading: searchLoading } = useQuery({
    queryKey: ['tag:search', selectedTags.map(t => t.id).sort().join(','), searchMode],
    queryFn:  () => invoke('tag:search', { tagIds: selectedTags.map(t => t.id), mode: searchMode }),
    enabled:  selectedTags.length > 0,
  })
  const { data: rawRules = [] } = useQuery({ queryKey: ['tag:rule:list'], queryFn: () => invoke('tag:rule:list') })

  const tagList  = rawTags  as Tag[]
  const counts   = rawCounts as Record<number, number>
  const fileList = rawFiles  as Array<{ repoId: number; repoName: string; filePath: string; fileSize: number; modifiedAt: string }>
  const ruleList = rawRules  as Array<{ id: number; tagId: number; tagName: string; patternType: string; pattern: string; isActive: boolean }>

  /* ─ 핸들러: 태그 CRUD ─ */

  const handleCreate = async () => {
    if (!newName.trim()) return
    try {
      await invoke('tag:create', { name: newName.trim(), color: newColor })
      setNewName(''); setNewColor('#1565C0'); setShowCreate(false)
      queryClient.invalidateQueries({ queryKey: ['tag:list'] })
      queryClient.invalidateQueries({ queryKey: ['tag:counts'] })
    } catch (err) { alert(err instanceof Error ? err.message : '태그 생성 실패') }
  }

  const startEdit = (tag: Tag) => {
    setEditingTag(tag); setEditName(tag.name); setEditColor(tag.color || '#1565C0')
    setShowCreate(false)
  }

  const handleUpdate = async () => {
    if (!editingTag || !editName.trim()) return
    try {
      await invoke('tag:update', { id: editingTag.id, name: editName.trim(), color: editColor })
      setEditingTag(null)
      queryClient.invalidateQueries({ queryKey: ['tag:list'] })
      queryClient.invalidateQueries({ queryKey: ['tag:search'] })
    } catch (err) { alert(err instanceof Error ? err.message : '태그 수정 실패') }
  }

  const handleDelete = async (e: React.MouseEvent, tag: Tag) => {
    e.stopPropagation()
    if (!window.confirm(`"${tag.name}" 태그를 삭제하시겠습니까?\n연결된 파일 정보도 모두 제거됩니다.`)) return
    try {
      await invoke('tag:delete', { id: tag.id })
      setSelectedTags(prev => prev.filter(t => t.id !== tag.id))
      queryClient.invalidateQueries({ queryKey: ['tag:list'] })
      queryClient.invalidateQueries({ queryKey: ['tag:counts'] })
      queryClient.invalidateQueries({ queryKey: ['tag:search'] })
    } catch { /* 무시 */ }
  }

  /* ─ 핸들러: 파일 검색 ─ */

  const toggleSearchTag = (tag: Tag) => {
    setSelectedTags(prev => prev.find(t => t.id === tag.id) ? prev.filter(t => t.id !== tag.id) : [...prev, tag])
    setShowPicker(false)
  }

  const handleFileClick = (file: { repoId: number; filePath: string }) => {
    const parts = file.filePath.split('/')
    parts.pop()
    navigate(`/repo/${file.repoId}`, {
      state: { navigateTo: parts.join('/'), selectFile: file.filePath, ts: Date.now() },
    })
  }

  /* ─ 핸들러: 자동 규칙 ─ */

  const handleCreateRule = async () => {
    if (!ruleTagId || !rulePattern.trim()) return
    try {
      await invoke('tag:rule:create', { tagId: Number(ruleTagId), patternType: rulePatternType, pattern: rulePattern.trim() })
      setRuleTagId(''); setRulePattern(''); setShowRuleForm(false)
      queryClient.invalidateQueries({ queryKey: ['tag:rule:list'] })
    } catch (err) { alert(err instanceof Error ? err.message : '규칙 생성 실패') }
  }

  const handleDeleteRule = async (id: number) => {
    if (!window.confirm('이 자동 태그 규칙을 삭제하시겠습니까?')) return
    try {
      await invoke('tag:rule:delete', { id })
      queryClient.invalidateQueries({ queryKey: ['tag:rule:list'] })
    } catch { /* 무시 */ }
  }

  const handleToggleRule = async (rule: { id: number; isActive: boolean }) => {
    try {
      await invoke('tag:rule:toggle', { id: rule.id, isActive: !rule.isActive })
      queryClient.invalidateQueries({ queryKey: ['tag:rule:list'] })
    } catch { /* 무시 */ }
  }

  /* 기존 파일 소급 적용 */
  const handleRetroApply = async () => {
    if (!window.confirm('활성화된 자동 규칙을 저장소의 모든 기존 파일에 적용하시겠습니까?')) return
    setRetroApplying(true)
    setRetroResult(null)
    try {
      const result = await invoke('tag:rule:apply-retroactive') as { applied: number }
      setRetroResult(`${result.applied}개 파일에 태그가 새로 적용됐습니다.`)
      queryClient.invalidateQueries({ queryKey: ['tag:counts'] })
      queryClient.invalidateQueries({ queryKey: ['tag:search'] })
    } catch (err) {
      setRetroResult(err instanceof Error ? err.message : '소급 적용 실패')
    } finally {
      setRetroApplying(false)
    }
  }

  /* ─ 렌더 ─ */

  return (
    <div style={S.page}>

      {/* ═══ 좌측: 태그 목록 ═══ */}
      <div style={S.leftPanel}>
        <div style={S.leftHeader}>
          <span style={S.leftTitle}>
            <TagIcon width={15} height={15} color={colors.navy} />
            태그 ({tagList.length})
          </span>
          <button style={S.btn()} onClick={() => { setShowCreate(v => !v); setEditingTag(null) }}>
            {showCreate ? '취소' : '+ 새 태그'}
          </button>
        </div>

        {/* 태그 생성 폼 */}
        {showCreate && (
          <div style={{ padding: '10px 12px', borderBottom: `1px solid ${colors.borderLight}`, background: '#f9fafb' }}>
            <input
              value={newName} onChange={e => setNewName(e.target.value)} placeholder="태그 이름" autoFocus
              style={{ ...S.input, width: '100%', boxSizing: 'border-box', marginBottom: 7 }}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowCreate(false) }}
            />
            <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
              {TAG_COLORS.map(c => <div key={c} style={S.swatch(c, newColor === c)} onClick={() => setNewColor(c)} />)}
            </div>
            <button style={{ ...S.btn(), width: '100%' }} onClick={handleCreate}>확인</button>
          </div>
        )}

        {/* 태그 목록 */}
        <div style={S.leftScroll}>
          {tagList.length === 0 && <div style={{ ...S.empty, padding: '28px 16px' }}>태그가 없습니다</div>}
          {tagList.map(tag => {
            const isEditing  = editingTag?.id === tag.id
            const isSelected = selectedTags.some(t => t.id === tag.id)
            return (
              <div key={tag.id}>
                {isEditing ? (
                  <div style={{ padding: '8px 12px', background: '#f9fafb', borderBottom: `1px solid ${colors.borderLight}` }}>
                    <input
                      value={editName} onChange={e => setEditName(e.target.value)} autoFocus
                      style={{ ...S.input, width: '100%', boxSizing: 'border-box', marginBottom: 6 }}
                      onKeyDown={e => { if (e.key === 'Enter') handleUpdate(); if (e.key === 'Escape') setEditingTag(null) }}
                    />
                    <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                      {TAG_COLORS.map(c => <div key={c} style={S.swatch(c, editColor === c)} onClick={() => setEditColor(c)} />)}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button style={{ ...S.btn(), flex: 1 }} onClick={handleUpdate}>저장</button>
                      <button style={{ ...S.btn('ghost'), flex: 1 }} onClick={() => setEditingTag(null)}>취소</button>
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      ...S.tagRow,
                      background: isSelected ? `${tag.color || colors.blue}14` : 'transparent',
                      borderRight: isSelected ? `3px solid ${tag.color || colors.blue}` : '3px solid transparent',
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = colors.bgSecondary }}
                    onMouseLeave={e => { e.currentTarget.style.background = isSelected ? `${tag.color || colors.blue}14` : 'transparent' }}
                  >
                    <div style={{ ...S.tagDot, background: tag.color || colors.blue }} />
                    <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: colors.textSub }}>
                      {tag.name}
                    </span>
                    <span style={S.tagCount}>{counts[tag.id] ?? 0}개</span>
                    <button
                      style={S.iconBtn} title="태그 수정" onClick={e => { e.stopPropagation(); startEdit(tag) }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = colors.blue }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = colors.textMuted }}
                    >
                      ✎
                    </button>
                    <button style={S.iconBtn} title="태그 삭제" onClick={e => handleDelete(e, tag)}>
                      <X width={11} height={11} color={colors.red} />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ═══ 우측: 탭 패널 ═══ */}
      <div style={S.rightPanel}>
        <div style={S.tabBar}>
          <button style={S.tab(activeTab === 'search')} onClick={() => setActiveTab('search')}>파일 검색</button>
          <button style={S.tab(activeTab === 'rules')}  onClick={() => setActiveTab('rules')}>자동 규칙</button>
        </div>

        {/* ─ 파일 검색 탭 ─ */}
        {activeTab === 'search' && (
          <div style={S.content}>
            {/* 태그 선택 영역 */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                {selectedTags.map(tag => (
                  <span key={tag.id} style={{ ...S.chip, background: `${tag.color || colors.blue}1a`, color: tag.color || colors.blue }}>
                    <div style={{ width: 7, height: 7, borderRadius: 2, background: tag.color || colors.blue }} />
                    {tag.name}
                    <button
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}
                      onClick={() => setSelectedTags(prev => prev.filter(t => t.id !== tag.id))}
                    >
                      <X width={10} height={10} color={tag.color || colors.blue} />
                    </button>
                  </span>
                ))}

                {/* 태그 추가 드롭다운 */}
                <div style={{ position: 'relative' }}>
                  <button
                    style={{ ...S.btn('ghost'), border: `1px dashed ${colors.border}`, fontSize: 12 }}
                    onClick={() => setShowPicker(v => !v)}
                  >
                    + 태그 선택
                  </button>
                  {showPicker && (
                    <>
                      <div style={{ position: 'fixed', inset: 0, zIndex: 100 }} onClick={() => setShowPicker(false)} />
                      <div style={{
                        position: 'absolute', top: '110%', left: 0, zIndex: 101,
                        background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 8,
                        boxShadow: '0 4px 16px rgba(0,0,0,0.12)', minWidth: 180, maxHeight: 240, overflowY: 'auto',
                      }}>
                        {tagList.length === 0 && (
                          <div style={{ padding: '10px 14px', fontSize: 12, color: colors.textMuted }}>태그가 없습니다</div>
                        )}
                        {tagList.map(tag => {
                          const already = selectedTags.some(t => t.id === tag.id)
                          return (
                            <div
                              key={tag.id}
                              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', cursor: 'pointer', fontSize: 13, background: already ? `${tag.color || colors.blue}12` : 'transparent' }}
                              onClick={() => toggleSearchTag(tag)}
                              onMouseEnter={e => { if (!already) e.currentTarget.style.background = colors.bgSecondary }}
                              onMouseLeave={e => { e.currentTarget.style.background = already ? `${tag.color || colors.blue}12` : 'transparent' }}
                            >
                              <div style={{ width: 8, height: 8, borderRadius: 2, background: tag.color || colors.blue }} />
                              <span style={{ flex: 1 }}>{tag.name}</span>
                              {already && <span style={{ fontSize: 10, color: tag.color || colors.blue, fontWeight: 700 }}>✓</span>}
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>

                {/* AND / OR 토글 (2개 이상 선택 시) */}
                {selectedTags.length >= 2 && (
                  <div style={{ display: 'flex', border: `1px solid ${colors.border}`, borderRadius: 6, overflow: 'hidden', marginLeft: 4 }}>
                    {(['or', 'and'] as const).map(m => (
                      <button
                        key={m}
                        style={{ padding: '4px 12px', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', background: searchMode === m ? colors.navy : '#fff', color: searchMode === m ? '#fff' : colors.textMuted }}
                        onClick={() => setSearchMode(m)}
                      >
                        {m.toUpperCase()}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {selectedTags.length === 0 && (
                <p style={{ fontSize: 12, color: colors.textMuted }}>검색할 태그를 선택하세요.</p>
              )}
              {selectedTags.length >= 2 && (
                <p style={{ fontSize: 12, color: colors.textMuted }}>
                  {searchMode === 'and' ? '선택한 태그가 모두 부착된' : '선택한 태그 중 하나라도 부착된'} 파일을 표시합니다.
                </p>
              )}
            </div>

            {/* 파일 결과 */}
            {selectedTags.length > 0 && (
              <>
                <div style={{ fontSize: 13, fontWeight: 600, color: colors.text, marginBottom: 10 }}>
                  {searchLoading ? '검색 중...' : `${fileList.length}개 파일`}
                </div>
                {!searchLoading && fileList.length === 0 && (
                  <div style={S.empty}>해당 태그가 부착된 파일이 없습니다.</div>
                )}
                {!searchLoading && fileList.map((file, i) => {
                  const fileName = file.filePath.split('/').pop() || file.filePath
                  return (
                    <div
                      key={i} style={S.fileRow}
                      onClick={() => handleFileClick(file)}
                      onMouseEnter={e => { e.currentTarget.style.background = colors.bgSecondary }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                    >
                      {getFileIcon(fileName, 18)}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: colors.text }}>{fileName}</div>
                        <div style={{ fontSize: 11, color: colors.textMuted }}>
                          {file.repoName} · {file.filePath}{file.fileSize ? ` · ${formatSize(file.fileSize)}` : ''}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </>
            )}

            {selectedTags.length === 0 && (
              <div style={S.empty}>
                <TagIcon width={32} height={32} color={colors.textMuted} style={{ display: 'block', margin: '0 auto 12px' }} />
                태그를 선택하면 해당 파일 목록을 표시합니다.
              </div>
            )}
          </div>
        )}

        {/* ─ 자동 규칙 탭 ─ */}
        {activeTab === 'rules' && (
          <div style={S.content}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: colors.text }}>자동 태그 규칙</div>
                <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
                  커밋 시 파일 경로·이름·확장자에 따라 태그를 자동으로 부착합니다.
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  style={{ ...S.btn('ghost'), border: `1px solid ${colors.border}`, opacity: retroApplying ? 0.6 : 1 }}
                  onClick={handleRetroApply}
                  disabled={retroApplying || ruleList.length === 0}
                  title="활성 규칙을 저장소의 모든 기존 파일에 소급 적용"
                >
                  {retroApplying ? '적용 중...' : '소급 적용'}
                </button>
                <button style={S.btn()} onClick={() => setShowRuleForm(v => !v)}>
                  {showRuleForm ? '취소' : '+ 규칙 추가'}
                </button>
              </div>
            </div>

            {/* 소급 적용 결과 */}
            {retroResult && (
              <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 6, background: '#e8f5e9', border: '1px solid #a5d6a7', fontSize: 12, color: '#2E7D32', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{retroResult}</span>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#666' }} onClick={() => setRetroResult(null)}>✕</button>
              </div>
            )}

            {/* 규칙 추가 폼 */}
            {showRuleForm && (
              <div style={S.formBox}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div>
                    <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>대상 태그</div>
                    <select value={ruleTagId} onChange={e => setRuleTagId(Number(e.target.value))} style={S.select}>
                      <option value="">선택하세요</option>
                      {tagList.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>규칙 유형</div>
                    <select value={rulePatternType} onChange={e => setRulePatternType(e.target.value)} style={S.select}>
                      {PATTERN_TYPES.map(pt => <option key={pt.value} value={pt.value}>{pt.label}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>패턴</div>
                    <input
                      value={rulePattern} onChange={e => setRulePattern(e.target.value)}
                      placeholder={PATTERN_TYPES.find(p => p.value === rulePatternType)?.placeholder ?? ''}
                      style={{ ...S.input, width: '100%', boxSizing: 'border-box' }}
                      onKeyDown={e => { if (e.key === 'Enter') handleCreateRule() }}
                    />
                  </div>
                  <button
                    style={{ ...S.btn(), opacity: (!ruleTagId || !rulePattern.trim()) ? 0.5 : 1 }}
                    onClick={handleCreateRule}
                    disabled={!ruleTagId || !rulePattern.trim()}
                  >
                    추가
                  </button>
                </div>
              </div>
            )}

            {/* 규칙 목록 */}
            {ruleList.length === 0 && (
              <div style={S.empty}>등록된 자동 태그 규칙이 없습니다.</div>
            )}
            {ruleList.map(rule => {
              const tag    = tagList.find(t => t.id === rule.tagId)
              const ptLabel = PATTERN_TYPES.find(p => p.value === rule.patternType)?.label ?? rule.patternType
              return (
                <div key={rule.id} style={{ ...S.ruleRow, opacity: rule.isActive ? 1 : 0.5 }}>
                  {/* 태그 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 90 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: tag?.color || colors.blue, flexShrink: 0 }} />
                    <span style={{ fontWeight: 500, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rule.tagName}</span>
                  </div>
                  {/* 유형 배지 */}
                  <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: '#e8eaf0', color: colors.textSub, flexShrink: 0 }}>{ptLabel}</span>
                  {/* 패턴 */}
                  <code style={{ flex: 1, fontSize: 12, color: colors.textSub, background: '#f0f2f5', padding: '2px 8px', borderRadius: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {rule.pattern}
                  </code>
                  {/* 활성 토글 */}
                  <button
                    style={{ border: `1px solid ${rule.isActive ? '#a5d6a7' : colors.border}`, cursor: 'pointer', borderRadius: 5, padding: '2px 9px', fontSize: 11, fontWeight: 600, background: rule.isActive ? '#e6f4ea' : '#f5f5f5', color: rule.isActive ? '#2E7D32' : colors.textMuted }}
                    onClick={() => handleToggleRule(rule)}
                  >
                    {rule.isActive ? '활성' : '비활성'}
                  </button>
                  {/* 삭제 */}
                  <button style={S.iconBtn} title="규칙 삭제" onClick={() => handleDeleteRule(rule.id)}>
                    <X width={13} height={13} color={colors.red} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
