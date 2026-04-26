/**
 * V2 레이아웃 셸
 *
 * 역할: V2 디자인의 전체 페이지 레이아웃. HeaderV2 + SidebarV2 + Outlet 조합.
 *       기존 Shell.tsx의 모달 관리, 이벤트 브릿지, 검색 기능을 그대로 유지합니다.
 * 구성: ShellV2 (루트) / HeaderV2 / SidebarV2 / 모달들
 */

import { useState, useEffect, useCallback } from 'react';
import { Outlet, useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { colors, fontFamily } from '@renderer/design/theme';
import { useWindowSize } from '@renderer/hooks/useWindowSize';
import HeaderV2 from './HeaderV2';
import SidebarV2 from './SidebarV2';
import AdminSidebarV2 from './AdminSidebarV2';
import { SettingsModal } from '@renderer/components/modals/SettingsModal';
import { SearchModal } from '@renderer/components/modals/SearchModal';
import { invoke } from '@renderer/services/ipcClient';

export default function ShellV2() {
  const { repoId } = useParams<{ repoId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { showRightPanel } = useWindowSize();
  const [showSettings, setShowSettings] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  /* 관리자 모드 여부 — /admin/* 경로 진입 시 사이드바 교체 */
  const isAdminMode = location.pathname.startsWith('/admin');

  /* 현재 경로 (FilesPage에서 커스텀 이벤트로 동기화) */
  const [currentPath, setCurrentPath] = useState('');

  /* 저장소 이름 조회 */
  const { data: repos = [] } = useQuery({
    queryKey: ['repo:list'],
    queryFn: () => invoke('repo:list'),
  });
  const currentRepo = (repos as any[]).find((r) => String(r.id) === repoId);

  /* FilesPage에서 경로 변경 시 동기화 */
  useEffect(() => {
    const handler = (e: Event) => {
      const { currentPath: path } = (e as CustomEvent).detail;
      setCurrentPath(path || '');
    };
    window.addEventListener('vaultline:path-changed', handler);
    return () => window.removeEventListener('vaultline:path-changed', handler);
  }, []);

  /* 저장소 변경 시 경로 리셋 */
  useEffect(() => {
    setCurrentPath('');
  }, [repoId]);

  /* Ctrl+K 검색 단축키 */
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearch((prev) => !prev);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  /* 브레드크럼 클릭 → FilesPage에 경로 변경 요청 */
  const handleBreadcrumbNavigate = useCallback((path: string) => {
    window.dispatchEvent(new CustomEvent('vaultline:navigate-to', { detail: { path, selectFile: null } }));
  }, []);

  /* 저장소 생성 */
  const handleCreateRepo = async (name: string, description: string, template: string) => {
    try {
      const repo = await invoke('repo:create', {
        name,
        description,
        folderTemplate: template as 'empty' | 'business' | 'project',
      });
      queryClient.invalidateQueries({ queryKey: ['repo:list'] });
      navigate(`/repo/${(repo as any).id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : '저장소 생성 실패');
    }
  };

  /* 검색 결과 선택 */
  const handleSearchSelect = (result: any) => {
    setShowSearch(false);

    // 공유받은 문서 → 해당 공유 저장소 페이지로 이동
    if (result.remoteRepoId) {
      navigate(`/shared-repo/${result.remoteRepoId}`);
      return;
    }

    const parts = result.filePath.split('/');
    parts.pop();
    const parentPath = parts.join('/');

    if (String(result.repoId) === repoId) {
      window.dispatchEvent(new CustomEvent('vaultline:navigate-to', {
        detail: { path: parentPath, selectFile: result.filePath },
      }));
    } else {
      navigate(`/repo/${result.repoId}`, {
        state: { navigateTo: parentPath, selectFile: result.filePath, ts: Date.now() },
      });
    }
  };

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        fontFamily,
        background: colors.bg,
        color: colors.text,
        fontSize: '13.5px',
        overflow: 'hidden',
      }}
    >
      {/* 헤더 */}
      <HeaderV2
        onOpenSettings={() => setShowSettings(true)}
        onOpenSearch={() => setShowSearch(true)}
        repoName={currentRepo?.name}
        currentPath={currentPath}
        onNavigate={handleBreadcrumbNavigate}
      />

      {/* 본문: 사이드바 + 메인 (관리자 모드일 때 AdminSidebarV2로 교체) */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {isAdminMode ? <AdminSidebarV2 /> : <SidebarV2 onCreateRepo={handleCreateRepo} />}
        <main
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            background: '#fff',
          }}
        >
          <Outlet context={{ showRightPanel }} />
        </main>
      </div>

      {/* 모달 */}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showSearch && (
        <SearchModal
          onClose={() => setShowSearch(false)}
          onSelect={handleSearchSelect}
        />
      )}
    </div>
  );
}
