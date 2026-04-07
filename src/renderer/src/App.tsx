import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Shell } from './components/layout/Shell'
import { HomePage } from './pages/HomePage'
import { FilesPage } from './pages/FilesPage'
import { TrashPage } from './pages/TrashPage'

/**
 * 앱 루트 컴포넌트
 * React Router로 페이지 라우팅 관리
 */
function App(): React.JSX.Element {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<HomePage />} />
          <Route path="/repo/:repoId" element={<FilesPage />} />
          <Route path="/trash" element={<TrashPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
