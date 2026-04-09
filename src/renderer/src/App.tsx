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
          <Route path="/admin/*" element={<OfflinePlaceholder title="관리자" icon="⚙️" description="서버에 연결하면 사용자, 그룹, 저장소 등을 관리할 수 있습니다." />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
