import { useState, useEffect, useCallback } from 'react'
import { Outlet, useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Header } from './Header'
import { Sidebar } from './Sidebar'
import { SettingsModal } from '@renderer/components/modals/SettingsModal'
import { SearchModal } from '@renderer/components/modals/SearchModal'
import { AdminModal } from '@renderer/components/modals/AdminModal'
import { useWindowSize } from '@renderer/hooks/useWindowSize'
import { invoke } from '@renderer/services/ipcClient'

export function Shell(): React.JSX.Element {
  const { showRightPanel, collapseSidebar } = useWindowSize()
  const { repoId } = useParams<{ repoId: string }>()
  const navigate = useNavigate()
  const [sidebarHover, setSidebarHover] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsInitialTab, setSettingsInitialTab] = useState<'general' | 'backup' | 'server'>('general')
  const [showSearch, setShowSearch] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)

  // 현재 경로 (FilesPage에서 커스텀 이벤트로 동기화)
  const [currentPath, setCurrentPath] = useState('')

  // 저장소 이름 조회
  const { data: repos = [] } = useQuery({
    queryKey: ['repo:list'],
    queryFn: () => invoke('repo:list')
  })
  const currentRepo = repos.find((r: any) => String(r.id) === repoId)

  // FilesPage에서 경로 변경 시 동기화
  useEffect(() => {
    const handler = (e: Event) => {
      const { currentPath: path } = (e as CustomEvent).detail
      setCurrentPath(path || '')
    }
    window.addEventListener('vaultline:path-changed', handler)
    return () => window.removeEventListener('vaultline:path-changed', handler)
  }, [])

  // 저장소 변경 시 경로 리셋
  useEffect(() => {
    setCurrentPath('')
  }, [repoId])

  // 관리자 모달 열기 이벤트
  useEffect(() => {
    const handler = () => setShowAdmin(true)
    window.addEventListener('vaultline:open-admin', handler)
    return () => window.removeEventListener('vaultline:open-admin', handler)
  }, [])

  // 브레드크럼 클릭 → FilesPage에 경로 변경 요청
  const handleBreadcrumbNavigate = useCallback((path: string) => {
    window.dispatchEvent(new CustomEvent('vaultline:navigate-to', { detail: { path, selectFile: null } }))
  }, [])

  const sidebarWidth = collapseSidebar && !sidebarHover ? 48 : 200

  return (
    <div className="flex flex-col h-screen">
      <Header
        onOpenSettings={() => { setSettingsInitialTab('general'); setShowSettings(true) }}
        onOpenServerSettings={() => { setSettingsInitialTab('server'); setShowSettings(true) }}
        onOpenSearch={() => setShowSearch(true)}
        repoName={currentRepo?.name}
        currentPath={currentPath}
        onNavigate={handleBreadcrumbNavigate}
      />
      <div className="flex flex-1 overflow-hidden">
        <div
          className="shrink-0 transition-all duration-200"
          style={{ width: sidebarWidth }}
          onMouseEnter={() => collapseSidebar && setSidebarHover(true)}
          onMouseLeave={() => setSidebarHover(false)}
        >
          <Sidebar collapsed={collapseSidebar && !sidebarHover} />
        </div>
        <main className="flex-1 overflow-hidden bg-gray-50 dark:bg-gray-800">
          <Outlet context={{ showRightPanel }} />
        </main>
      </div>

      {showAdmin && <AdminModal onClose={() => setShowAdmin(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} initialTab={settingsInitialTab} />}
      {showSearch && <SearchModal onClose={() => setShowSearch(false)} onSelect={(result) => {
        setShowSearch(false)
        // 검색 결과의 파일 위치로 이동
        const parts = result.filePath.split('/')
        parts.pop() // 파일명 제거
        const parentPath = parts.join('/')

        if (String(result.repoId) === repoId) {
          // 같은 저장소 → 경로 이동 + 파일 선택
          window.dispatchEvent(new CustomEvent('vaultline:navigate-to', {
            detail: { path: parentPath, selectFile: result.filePath }
          }))
        } else {
          // 다른 저장소 → 라우터 이동
          navigate(`/repo/${result.repoId}`, {
            state: { navigateTo: parentPath, selectFile: result.filePath, ts: Date.now() }
          })
        }
      }} />}
    </div>
  )
}
