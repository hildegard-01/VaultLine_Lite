/**
 * V2 사이드바 컴포넌트 — 220px 너비, 흰색 배경
 *
 * 역할: 좌측 네비게이션. 즐겨찾기, 내 저장소, 태그, 바로가기, 휴지통, 디스크 사용량을 표시합니다.
 *       커넥티드 모드에서만 공유받은문서/관리 메뉴를 추가 표시합니다.
 * 구성: SidebarV2 (메인) / SidebarSection / SidebarItem / TagListV2 / DiskUsageV2
 */

import { useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@renderer/services/ipcClient';
import { CreateRepoModal } from '@renderer/components/modals/CreateRepoModal';
import { colors, layout, fontFamily } from '@renderer/design/theme';
import {
  Folder as FolderIcon,
  Star as StarIcon,
  Tag as TagIcon,
  Trash as TrashIcon,
  Activity as ActivityIcon,
  SharedDocs as SharedDocsIcon,
  Settings as SettingsIcon,
  ChevronDown as ChevronDownIcon,
  ChevronRight as ChevronRightIcon,
  FolderPlus as FolderPlusIcon,
} from '@renderer/design/Icons';
import { useMode } from '@renderer/hooks/useMode';
import type { Repository, Tag } from '@shared/types/ipc';

/* ────────────────────── SidebarSection ────────────────────── */

interface SidebarSectionProps {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
  action?: ReactNode;
}

function SidebarSection({ title, expanded, onToggle, children, action }: SidebarSectionProps) {
  const titleStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 16px 4px',
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: colors.textMuted,
    cursor: 'pointer',
    userSelect: 'none',
  };

  return (
    <div>
      <div style={titleStyle}>
        <span onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
          {expanded
            ? <ChevronDownIcon width={12} height={12} color={colors.textMuted} />
            : <ChevronRightIcon width={12} height={12} color={colors.textMuted} />
          }
          {title}
        </span>
        {action}
      </div>
      {expanded && <div style={{ padding: '2px 0' }}>{children}</div>}
    </div>
  );
}

/* ────────────────────── SidebarItem ────────────────────── */

interface SidebarItemProps {
  icon?: ReactNode;
  label: string;
  active?: boolean;
  badge?: number;
  onClick: () => void;
  onAction?: (e: React.MouseEvent) => void;
  actionLabel?: string;
}

function SidebarItem({ icon, label, active = false, badge, onClick, onAction, actionLabel }: SidebarItemProps) {
  const [hovered, setHovered] = useState(false);

  const itemStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '7px 16px',
    fontSize: 13,
    color: active ? colors.navy : colors.textSub,
    fontWeight: active ? 600 : 400,
    background: active ? '#e8f4fd' : hovered ? '#f5f7fa' : 'transparent',
    borderRight: active ? `3px solid ${colors.navy}` : '3px solid transparent',
    cursor: 'pointer',
    userSelect: 'none',
    transition: 'background 0.15s',
    position: 'relative',
  };

  const badgeStyle: CSSProperties = {
    marginLeft: 'auto',
    background: colors.red,
    color: '#fff',
    fontSize: 10,
    fontWeight: 700,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 5px',
  };

  const actionBtnStyle: CSSProperties = {
    marginLeft: 'auto',
    color: '#ccc',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 10,
    padding: '0 2px',
    opacity: hovered ? 1 : 0,
    transition: 'opacity 0.15s',
  };

  return (
    <div
      style={itemStyle}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {icon && <span style={{ display: 'flex', flexShrink: 0 }}>{icon}</span>}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
        {label}
      </span>
      {badge != null && badge > 0 && <span style={badgeStyle}>{badge > 99 ? '99+' : badge}</span>}
      {onAction && (
        <button
          style={actionBtnStyle}
          onClick={(e) => { e.stopPropagation(); onAction(e); }}
          title={actionLabel}
          onMouseEnter={(e) => { e.currentTarget.style.color = colors.red; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#ccc'; }}
        >
          ✕
        </button>
      )}
    </div>
  );
}

/* ────────────────────── 유틸 ────────────────────── */

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

/* ────────────────────── SidebarV2 ────────────────────── */

interface SidebarV2Props {
  onCreateRepo: (name: string, description: string, template: string) => void;
}

export default function SidebarV2({ onCreateRepo }: SidebarV2Props) {
  const navigate = useNavigate();
  const { repoId } = useParams<{ repoId: string }>();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { connected } = useMode();

  const [favOpen, setFavOpen] = useState(true);
  const [repoOpen, setRepoOpen] = useState(true);
  const [tagOpen, setTagOpen] = useState(true);
  const [shortcutsOpen, setShortcutsOpen] = useState(true);
  const [showCreateRepo, setShowCreateRepo] = useState(false);
  const [showTagInput, setShowTagInput] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#1565C0');

  const { data: repos = [] } = useQuery({
    queryKey: ['repo:list'],
    queryFn: () => invoke('repo:list'),
  });

  const { data: bookmarks = [] } = useQuery({
    queryKey: ['bookmark:list'],
    queryFn: () => invoke('bookmark:list'),
  });

  const { data: tags = [] } = useQuery({
    queryKey: ['tag:list'],
    queryFn: () => invoke('tag:list'),
  });

  const { data: trashItems = [] } = useQuery({
    queryKey: ['trash:list'],
    queryFn: () => invoke('trash:list', {}),
  });

  const { data: disk } = useQuery({
    queryKey: ['settings:disk-usage'],
    queryFn: () => invoke('settings:disk-usage'),
    refetchInterval: 60000,
  });

  const activeRepoId = repoId ? Number(repoId) : null;

  const handleDeleteRepo = async (repo: Repository) => {
    if (!window.confirm(`"${repo.name}" 저장소를 삭제하시겠습니까?\n\n저장소의 모든 파일과 이력이 영구 삭제됩니다.`)) return;
    try {
      await invoke('repo:delete', { id: repo.id });
      queryClient.invalidateQueries({ queryKey: ['repo:list'] });
      if (String(repo.id) === repoId) navigate('/');
    } catch (err) {
      alert(err instanceof Error ? err.message : '저장소 삭제 실패');
    }
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    try {
      await invoke('tag:create', { name: newTagName.trim(), color: newTagColor });
      setNewTagName('');
      setNewTagColor('#1565C0');
      setShowTagInput(false);
      queryClient.invalidateQueries({ queryKey: ['tag:list'] });
    } catch (err) {
      alert(err instanceof Error ? err.message : '태그 생성 실패');
    }
  };

  const handleBookmarkNav = (b: any) => {
    const parts = (b.filePath as string).split('/');
    parts.pop();
    const parentPath = parts.join('/');
    if (String(b.repoId) === repoId) {
      window.dispatchEvent(new CustomEvent('vaultline:navigate-to', {
        detail: { path: parentPath, selectFile: b.filePath },
      }));
    } else {
      navigate(`/repo/${b.repoId}`, { state: { navigateTo: parentPath, selectFile: b.filePath, ts: Date.now() } });
    }
  };

  const handleRepoClick = (repo: Repository) => {
    const currentlyInRepo = location.pathname === `/repo/${repo.id}`;
    if (currentlyInRepo) {
      // 같은 저장소 파일목록에서 클릭 → 루트로 리셋
      window.dispatchEvent(new CustomEvent('vaultline:navigate-to', { detail: { path: '', selectFile: null } }));
    } else {
      // 다른 페이지(상세보기, 하위경로 등)에서 클릭 → 파일목록으로 이동
      navigate(`/repo/${repo.id}`);
    }
  };

  const IC = 16;

  /* 스타일 */
  const sidebarStyle: CSSProperties = {
    width: layout.sidebarWidth,
    height: '100%',
    background: colors.bgPrimary,
    borderRight: '1px solid #e8eaed',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    overflowY: 'auto',
    fontFamily,
  };

  const dividerStyle: CSSProperties = {
    height: 1,
    background: '#e8eaed',
    margin: '4px 16px',
  };

  const TAG_COLORS = ['#1565C0', '#2E7D32', '#E65100', '#6A1B9A', '#C62828', '#00838F', '#4E342E', '#37474F'];

  return (
    <aside style={sidebarStyle}>
      {/* 즐겨찾기 */}
      <SidebarSection title="즐겨찾기" expanded={favOpen} onToggle={() => setFavOpen((v) => !v)}>
        {bookmarks.length === 0 ? (
          <div style={{ padding: '4px 16px', fontSize: 12, color: colors.textMuted }}>즐겨찾기가 없습니다</div>
        ) : (
          (bookmarks as any[]).map((b) => {
            const fileName = (b.filePath as string).split('/').pop() || b.filePath;
            return (
              <SidebarItem
                key={b.id}
                icon={<StarIcon width={IC} height={IC} color="#F59E0B" filled />}
                label={fileName}
                onClick={() => handleBookmarkNav(b)}
                onAction={async () => {
                  try {
                    await invoke('bookmark:toggle', { repoId: b.repoId, filePath: b.filePath });
                    queryClient.invalidateQueries({ queryKey: ['bookmark:list'] });
                  } catch { /* 무시 */ }
                }}
                actionLabel="즐겨찾기 해제"
              />
            );
          })
        )}
      </SidebarSection>

      <div style={dividerStyle} />

      {/* 내 저장소 */}
      <SidebarSection
        title="내 저장소"
        expanded={repoOpen}
        onToggle={() => setRepoOpen((v) => !v)}
        action={
          <button
            onClick={(e) => { e.stopPropagation(); setShowCreateRepo(true); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}
            title="새 저장소"
          >
            <FolderPlusIcon width={14} height={14} color={colors.textMuted} />
          </button>
        }
      >
        {(repos as Repository[]).map((repo) => (
          <SidebarItem
            key={repo.id}
            icon={<FolderIcon width={IC} height={IC} />}
            label={repo.name}
            active={activeRepoId === repo.id}
            onClick={() => handleRepoClick(repo)}
            onAction={() => handleDeleteRepo(repo)}
            actionLabel="저장소 삭제"
          />
        ))}
        {repos.length === 0 && (
          <div style={{ padding: '4px 16px', fontSize: 12, color: colors.textMuted }}>저장소를 생성해 주세요</div>
        )}
      </SidebarSection>

      <div style={dividerStyle} />

      {/* 태그 */}
      <SidebarSection
        title="태그"
        expanded={tagOpen}
        onToggle={() => setTagOpen((v) => !v)}
        action={
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowTagInput((v) => !v);
              setNewTagName('');
              setNewTagColor('#1565C0');
            }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 11, color: showTagInput ? colors.textMuted : colors.blue }}
          >
            {showTagInput ? '취소' : '+ 추가'}
          </button>
        }
      >
        {showTagInput && (
          <div style={{ padding: '4px 16px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="태그 이름"
                style={{
                  flex: 1, minWidth: 0, padding: '4px 8px', fontSize: 12,
                  border: `1px solid ${colors.border}`, borderRadius: 4,
                  outline: 'none', fontFamily,
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateTag();
                  if (e.key === 'Escape') { setShowTagInput(false); setNewTagName(''); }
                }}
                autoFocus
              />
              <button
                onClick={handleCreateTag}
                style={{
                  padding: '4px 10px', fontSize: 11, fontWeight: 600,
                  background: colors.navy, color: '#fff', border: 'none',
                  borderRadius: 4, cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                확인
              </button>
            </div>
            <div style={{ display: 'flex', gap: 4, paddingLeft: 2 }}>
              {TAG_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setNewTagColor(c)}
                  style={{
                    width: 16, height: 16, borderRadius: '50%', border: `2px solid ${newTagColor === c ? '#333' : 'transparent'}`,
                    background: c, cursor: 'pointer', padding: 0,
                    transform: newTagColor === c ? 'scale(1.15)' : 'none', transition: 'transform 0.1s',
                  }}
                />
              ))}
            </div>
          </div>
        )}
        <TagListV2 tags={tags as Tag[]} queryClient={queryClient} />
      </SidebarSection>

      <div style={dividerStyle} />

      {/* 바로가기 */}
      <SidebarSection title="바로가기" expanded={shortcutsOpen} onToggle={() => setShortcutsOpen((v) => !v)}>
        {/* 커넥티드 전용: 공유받은 문서 */}
        {connected && (
          <SidebarItem
            icon={<SharedDocsIcon width={IC} height={IC} color={colors.textSub} />}
            label="공유받은 문서"
            active={location.pathname === '/shares'}
            onClick={() => navigate('/shares')}
          />
        )}
        <SidebarItem
          icon={<TagIcon width={IC} height={IC} color={colors.textSub} />}
          label="태그 관리"
          active={location.pathname === '/tags'}
          onClick={() => navigate('/tags')}
        />
        <SidebarItem
          icon={<ActivityIcon width={IC} height={IC} color={colors.textSub} />}
          label="활동 로그"
          active={location.pathname === '/activity'}
          onClick={() => navigate('/activity')}
        />
        <SidebarItem
          icon={<TrashIcon width={IC} height={IC} color={colors.textSub} />}
          label="휴지통"
          active={location.pathname === '/trash'}
          badge={(trashItems as any[]).length || undefined}
          onClick={() => navigate('/trash')}
        />
      </SidebarSection>

      {/* 커넥티드 전용: 관리 */}
      {connected && (
        <>
          <div style={dividerStyle} />
          <SidebarItem
            icon={<SettingsIcon width={IC} height={IC} color={colors.textSub} />}
            label="관리자"
            active={location.pathname.startsWith('/admin')}
            onClick={() => navigate('/admin')}
          />
        </>
      )}

      {/* 하단 고정: 디스크 사용량 */}
      <DiskUsageV2 disk={disk} />

      {/* 저장소 생성 모달 */}
      {showCreateRepo && (
        <CreateRepoModal
          onClose={() => setShowCreateRepo(false)}
          onCreate={(name: string, description: string, template: string) => {
            onCreateRepo(name, description, template);
            setShowCreateRepo(false);
          }}
        />
      )}
    </aside>
  );
}

/* ────────────────────── TagListV2 ────────────────────── */

function TagListV2({ tags, queryClient }: { tags: Tag[]; queryClient: any }) {
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState('');
  const MAX_VISIBLE = 5;

  const filtered = search
    ? tags.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()))
    : tags;
  const visible = expanded ? filtered : filtered.slice(0, MAX_VISIBLE);
  const hasMore = filtered.length > MAX_VISIBLE;

  const handleTagClick = (tag: Tag) => {
    window.dispatchEvent(new CustomEvent('vaultline:tag-filter', {
      detail: { tagId: tag.id, tagName: tag.name, tagColor: tag.color },
    }));
  };

  const handleDelete = async (e: React.MouseEvent, tag: Tag) => {
    e.stopPropagation();
    if (!window.confirm(`"${tag.name}" 태그를 삭제하시겠습니까?`)) return;
    try {
      await invoke('tag:delete', { id: tag.id });
      queryClient.invalidateQueries({ queryKey: ['tag:list'] });
      window.dispatchEvent(new CustomEvent('vaultline:tags-changed'));
    } catch { /* 무시 */ }
  };

  return (
    <>
      {tags.length > MAX_VISIBLE && (
        <div style={{ padding: '0 16px 4px' }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="태그 검색..."
            style={{
              width: '100%', padding: '4px 8px', fontSize: 12,
              border: `1px solid ${colors.border}`, borderRadius: 4,
              outline: 'none',
            }}
          />
        </div>
      )}
      {visible.map((tag) => (
        <SidebarItem
          key={tag.id}
          icon={
            <div style={{ width: 8, height: 8, borderRadius: 2, background: tag.color, flexShrink: 0 }} />
          }
          label={tag.name}
          onClick={() => handleTagClick(tag)}
          onAction={(e) => handleDelete(e, tag)}
          actionLabel="태그 삭제"
        />
      ))}
      {hasMore && !search && (
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{
            display: 'block', padding: '4px 16px', fontSize: 11,
            color: colors.textMuted, background: 'none', border: 'none',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = colors.blue; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = colors.textMuted; }}
        >
          {expanded ? '접기' : `더보기 (${filtered.length - MAX_VISIBLE}개)`}
        </button>
      )}
      {tags.length === 0 && (
        <div style={{ padding: '4px 16px', fontSize: 12, color: colors.textMuted }}>태그가 없습니다</div>
      )}
    </>
  );
}

/* ────────────────────── DiskUsageV2 ────────────────────── */

function DiskUsageV2({ disk }: { disk: any }) {
  const usedPct = disk && disk.total > 0 ? Math.min((disk.used / disk.total) * 100, 100) : 0;
  const isWarning = usedPct > 90;

  return (
    <div style={{
      marginTop: 'auto',
      padding: '12px 16px 16px',
      borderTop: '1px solid #e8eaed',
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: colors.textMuted, marginBottom: 6 }}>
        저장공간
      </div>
      <div style={{ fontSize: 12, color: colors.textSub, marginBottom: 6 }}>
        {disk ? `${formatBytes(disk.used)} 사용` : '계산 중...'}
      </div>
      <div style={{ height: 6, background: '#e8eaed', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          borderRadius: 3,
          width: `${Math.min(usedPct, 100)}%`,
          background: isWarning
            ? `linear-gradient(90deg, ${colors.red}, #ff6b6b)`
            : 'linear-gradient(90deg, #4ECDC4, #44A8B3)',
          transition: 'width 0.3s ease',
        }} />
      </div>
    </div>
  );
}
