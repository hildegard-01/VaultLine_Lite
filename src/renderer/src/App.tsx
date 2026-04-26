import { useState, lazy, Suspense, Component, type ReactNode, type ErrorInfo } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error.message, info.componentStack)
  }
  render() {
    if (this.state.error) {
      const err = this.state.error as Error
      return (
        <div style={{ padding: 40, fontFamily: 'system-ui', color: '#333' }}>
          <h2 style={{ color: '#c00', marginBottom: 12 }}>앱 렌더링 오류</h2>
          <p style={{ marginBottom: 8, fontSize: 13 }}>{err.message}</p>
          <p style={{ fontSize: 11, color: '#999' }}>로그 경로: %APPDATA%\vaultline-lite\logs\main.log</p>
          <button
            style={{ marginTop: 16, padding: '8px 16px', background: '#1B2A4A', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
            onClick={() => this.setState({ error: null })}
          >
            다시 시도
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
import ShellV2 from './components/layout/ShellV2'
import { HomePage } from './pages/HomePage'
import { FilesPage } from './pages/FilesPage'
import { TrashPage } from './pages/TrashPage'
import { OfflinePlaceholder } from './components/shared/OfflinePlaceholder'
import { ActivityPage } from './pages/ActivityPage'
import { BookmarksPage } from './pages/BookmarksPage'
import { TagsPage } from './pages/TagsPage'
import LoginPageV2 from './pages/LoginPageV2'
import SharesPageV2 from './pages/SharesPageV2'
import AllFilesPage from './pages/AllFilesPage'
import ApprovalsPageV2 from './pages/ApprovalsPageV2'
import SharedFilesPage from './pages/SharedFilesPage'

const FileDetailPage = lazy(() => import('./pages/file-detail/FileDetailPage'))
const SharedFileDetailPage = lazy(() => import('./pages/shared-file-detail/SharedFileDetailPage'))
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'))
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'))
const AdminRepos = lazy(() => import('./pages/admin/AdminRepos'))
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'))
const AdminSystemInfo = lazy(() => import('./pages/admin/AdminSystemInfo'))
const AdminBackup = lazy(() => import('./pages/admin/AdminBackup'))
const AdminActivityLog = lazy(() => import('./pages/admin/AdminActivityLog'))
const AdminShares = lazy(() => import('./pages/admin/AdminShares'))
const AdminServerSettings = lazy(() => import('./pages/admin/AdminServerSettings'))

const adminLoading = <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>로딩 중...</div>

/**
 * 앱 루트 컴포넌트
 * 앱 시작 시 로그인 화면 표시 → 완료 후 메인 앱으로 전환
 */
function App(): React.JSX.Element {
  const [loginDone, setLoginDone] = useState(false)

  if (!loginDone) {
    return <LoginPageV2 onLoginDone={() => setLoginDone(true)} />
  }

  return (
    <ErrorBoundary>
    <HashRouter>
      <Routes>
        <Route element={<ShellV2 />}>
          <Route index element={<HomePage />} />
          <Route path="/repo/:repoId" element={<FilesPage />} />
          <Route path="/file/:repoId" element={<Suspense fallback={<div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>로딩 중...</div>}><FileDetailPage /></Suspense>} />
          <Route path="/trash" element={<TrashPage />} />
          <Route path="/bookmarks" element={<BookmarksPage />} />
          <Route path="/tags" element={<TagsPage />} />
          <Route path="/activity" element={<ActivityPage />} />
          <Route path="/all-files" element={<AllFilesPage />} />
          <Route path="/shares" element={<SharesPageV2 />} />
          <Route path="/approvals" element={<ApprovalsPageV2 />} />
          <Route path="/shared-repo/:id" element={<SharedFilesPage />} />
          <Route path="/shared-file/:repoId" element={<Suspense fallback={<div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>로딩 중...</div>}><SharedFileDetailPage /></Suspense>} />
          <Route path="/notifications" element={<OfflinePlaceholder title="알림" icon="🔔" description="서버에 연결하면 공유, 승인 등의 알림을 받을 수 있습니다." />} />
          <Route path="/admin" element={<Suspense fallback={adminLoading}><AdminDashboard /></Suspense>} />
          <Route path="/admin/users" element={<Suspense fallback={adminLoading}><AdminUsers /></Suspense>} />
          <Route path="/admin/repos" element={<Suspense fallback={adminLoading}><AdminRepos /></Suspense>} />
          <Route path="/admin/settings" element={<Suspense fallback={adminLoading}><AdminSettings /></Suspense>} />
          <Route path="/admin/system" element={<Suspense fallback={adminLoading}><AdminSystemInfo /></Suspense>} />
          <Route path="/admin/backup" element={<Suspense fallback={adminLoading}><AdminBackup /></Suspense>} />
          <Route path="/admin/activity-log" element={<Suspense fallback={adminLoading}><AdminActivityLog /></Suspense>} />
          <Route path="/admin/groups" element={<OfflinePlaceholder title="그룹 관리" icon="⊟" description="서버에 연결하면 그룹을 생성·관리할 수 있습니다." />} />
          <Route path="/admin/approval-rules" element={<OfflinePlaceholder title="승인규칙 관리" icon="✓" description="서버에 연결하면 저장소별 결재/승인 규칙을 설정할 수 있습니다." />} />
          <Route path="/admin/admin-shares" element={<Suspense fallback={adminLoading}><AdminShares /></Suspense>} />
          <Route path="/admin/server-settings" element={<Suspense fallback={adminLoading}><AdminServerSettings /></Suspense>} />
        </Route>
      </Routes>
    </HashRouter>
    </ErrorBoundary>
  )
}

export default App
