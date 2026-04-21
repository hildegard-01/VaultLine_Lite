import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import ShellV2 from './components/layout/ShellV2'
import { HomePage } from './pages/HomePage'
import { FilesPage } from './pages/FilesPage'
import { TrashPage } from './pages/TrashPage'
import { OfflinePlaceholder } from './components/shared/OfflinePlaceholder'
import { ActivityPage } from './pages/ActivityPage'
import { BookmarksPage } from './pages/BookmarksPage'
import { TagsPage } from './pages/TagsPage'

const FileDetailPage = lazy(() => import('./pages/file-detail/FileDetailPage'))
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'))
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'))
const AdminRepos = lazy(() => import('./pages/admin/AdminRepos'))
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'))
const AdminSystemInfo = lazy(() => import('./pages/admin/AdminSystemInfo'))
const AdminBackup = lazy(() => import('./pages/admin/AdminBackup'))
const AdminActivityLog = lazy(() => import('./pages/admin/AdminActivityLog'))

const adminLoading = <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>로딩 중...</div>

/**
 * 앱 루트 컴포넌트
 * React Router로 페이지 라우팅 관리
 */
function App(): React.JSX.Element {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<ShellV2 />}>
          <Route index element={<HomePage />} />
          <Route path="/repo/:repoId" element={<FilesPage />} />
          <Route path="/file/:repoId" element={<Suspense fallback={<div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>로딩 중...</div>}><FileDetailPage /></Suspense>} />
          <Route path="/trash" element={<TrashPage />} />
          {/* Step 4: 로컬 동작 페이지 */}
          <Route path="/bookmarks" element={<BookmarksPage />} />
          <Route path="/tags" element={<TagsPage />} />
          <Route path="/activity" element={<ActivityPage />} />
          {/* 서버 전용 — 오프라인 모드에서 비활성, Phase C에서 활성화 */}
          <Route path="/shares" element={<OfflinePlaceholder title="공유받은 문서" icon="📂" description="서버에 연결하면 다른 사용자가 공유한 문서를 확인할 수 있습니다." />} />
          <Route path="/approvals" element={<OfflinePlaceholder title="결재/승인" icon="📋" description="서버에 연결하면 문서 승인 요청 및 검토를 할 수 있습니다." />} />
          <Route path="/notifications" element={<OfflinePlaceholder title="알림" icon="🔔" description="서버에 연결하면 공유, 승인 등의 알림을 받을 수 있습니다." />} />
          {/* 관리자 — 오프라인에서도 로컬 리소스 기반으로 동작 (Phase U) */}
          <Route path="/admin" element={<Suspense fallback={adminLoading}><AdminDashboard /></Suspense>} />
          <Route path="/admin/users" element={<Suspense fallback={adminLoading}><AdminUsers /></Suspense>} />
          <Route path="/admin/repos" element={<Suspense fallback={adminLoading}><AdminRepos /></Suspense>} />
          <Route path="/admin/settings" element={<Suspense fallback={adminLoading}><AdminSettings /></Suspense>} />
          <Route path="/admin/system" element={<Suspense fallback={adminLoading}><AdminSystemInfo /></Suspense>} />
          <Route path="/admin/backup" element={<Suspense fallback={adminLoading}><AdminBackup /></Suspense>} />
          <Route path="/admin/activity-log" element={<Suspense fallback={adminLoading}><AdminActivityLog /></Suspense>} />
          {/* 서버 전용 — 그룹/승인규칙은 placeholder 유지 */}
          <Route path="/admin/groups" element={<OfflinePlaceholder title="그룹 관리" icon="⊟" description="서버에 연결하면 그룹을 생성·관리할 수 있습니다. Lite 오프라인 모드에서는 저장소별 공유 사용자 관리를 사용하세요." />} />
          <Route path="/admin/approval-rules" element={<OfflinePlaceholder title="승인규칙 관리" icon="✓" description="서버에 연결하면 저장소별 결재/승인 규칙을 설정할 수 있습니다." />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
