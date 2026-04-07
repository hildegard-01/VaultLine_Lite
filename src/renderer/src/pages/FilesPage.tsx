import { useState, useCallback, useEffect } from 'react'
import { useParams, useOutletContext, useLocation } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { invoke } from '@renderer/services/ipcClient'
import { FileToolbar } from '@renderer/components/files/FileToolbar'
import { FileTable } from '@renderer/components/files/FileTable'
import { FileRightPanel } from '@renderer/components/files/FileRightPanel'
import { DropZone } from '@renderer/components/files/DropZone'
import { PendingChangesBar } from '@renderer/components/files/PendingChangesBar'
import { CommitModal } from '@renderer/components/modals/CommitModal'
import { InputModal } from '@renderer/components/modals/InputModal'
import { ShareModal } from '@renderer/components/modals/ShareModal'
import { PreviewModal } from '@renderer/components/modals/PreviewModal'
import { LockRulesModal } from '@renderer/components/modals/LockRulesModal'
import type { FileEntry, PendingChange } from '@shared/types/ipc'

export function FilesPage(): React.JSX.Element {
  const { repoId } = useParams<{ repoId: string }>()
  const context = useOutletContext<{ showRightPanel: boolean }>()
  const queryClient = useQueryClient()
  const location = useLocation()

  const [selectedFile, setSelectedFile] = useState<FileEntry | null>(null)
  const [currentPath, setCurrentPathRaw] = useState('')
  const [dragging, setDragging] = useState(false)
  const [pendingSelectFile, setPendingSelectFile] = useState<string | null>(null)

  // currentPath 변경 시 Shell(Header 브레드크럼)에 동기화
  const setCurrentPath = useCallback((path: string) => {
    setCurrentPathRaw(path)
    window.dispatchEvent(new CustomEvent('vaultline:path-changed', { detail: { currentPath: path } }))
  }, [])

  // 즐겨찾기에서 진입 시 해당 경로로 이동 (다른 저장소에서 진입)
  useEffect(() => {
    const state = location.state as { navigateTo?: string; selectFile?: string; ts?: number } | null
    if (state?.ts && state.navigateTo !== undefined) {
      setCurrentPath(state.navigateTo)
      setSelectedFile(null)
      if (state.selectFile) setPendingSelectFile(state.selectFile)
    }
  }, [location.state, location.key])

  // 즐겨찾기에서 같은 저장소 내 이동 (커스텀 이벤트)
  useEffect(() => {
    const handler = (e: Event) => {
      const { path, selectFile } = (e as CustomEvent).detail
      setCurrentPath(path || '')
      setSelectedFile(null)
      if (selectFile) setPendingSelectFile(selectFile)
    }
    window.addEventListener('vaultline:navigate-to', handler)
    return () => window.removeEventListener('vaultline:navigate-to', handler)
  }, [])

  // 사이드바에서 태그 삭제 시 파일 태그 맵 갱신
  useEffect(() => {
    const handler = () => setTagVersion(v => v + 1)
    window.addEventListener('vaultline:tags-changed', handler)
    return () => window.removeEventListener('vaultline:tags-changed', handler)
  }, [])

  // preload에서 발행하는 파일 드롭 이벤트 수신
  useEffect(() => {
    const handler = (e: Event) => {
      const paths = (e as CustomEvent).detail as string[]
      console.log('[FilesPage] electron-file-drop:', paths)
      if (paths && paths.length > 0) {
        setDragging(false)
        setUploadFiles(paths)
        setShowCommitModal(true)
      }
    }
    window.addEventListener('electron-file-drop', handler)
    return () => window.removeEventListener('electron-file-drop', handler)
  }, [])

  // 태그 필터
  const [tagFilter, setTagFilter] = useState<{ tagId: number; tagName: string; tagColor: string } | null>(null)
  const [tagFilterFiles, setTagFilterFiles] = useState<Array<{ repoId: number; repoName: string; filePath: string; fileSize: number; modifiedAt: string }>>([])

  // 사이드바 태그 클릭 → 필터 적용
  useEffect(() => {
    const handler = (e: Event) => {
      const { tagId, tagName, tagColor } = (e as CustomEvent).detail
      setTagFilter({ tagId, tagName, tagColor })
      invoke('tag:files', { tagId }).then(setTagFilterFiles).catch(() => setTagFilterFiles([]))
    }
    window.addEventListener('vaultline:tag-filter', handler)
    return () => window.removeEventListener('vaultline:tag-filter', handler)
  }, [])

  // 파일 체크 상태 (일괄 작업)
  const [checkedPaths, setCheckedPaths] = useState<Set<string>>(new Set())
  // 잠금 파일 열기 알림
  const [lockNotice, setLockNotice] = useState<string | null>(null)

  // 업로드 플로우
  const [showCommitModal, setShowCommitModal] = useState(false)
  const [uploadFiles, setUploadFiles] = useState<string[]>([])
  const [showNewFolderModal, setShowNewFolderModal] = useState(false)
  const [shareFile, setShareFile] = useState<FileEntry | null>(null)
  const [previewFile, setPreviewFile] = useState<FileEntry | null>(null)
  const [showLockRules, setShowLockRules] = useState(false)

  // Pending Changes (Phase 9) — watcher 이벤트 + svn status 복합
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([])
  const [showPendingCommitModal, setShowPendingCommitModal] = useState(false)

  const numRepoId = Number(repoId)

  // 저장소 진입 시 svn status로 미커밋 변경 파일 감지 (앱 재시작 후에도 유지)
  useEffect(() => {
    if (!repoId) return
    let cancelled = false
    invoke('commit:status', { repoId: numRepoId })
      .then((entries) => {
        if (cancelled) return
        const svnPending: PendingChange[] = entries
          .filter(e => e.status === 'modified' || e.status === 'added' || e.status === 'deleted')
          .map(e => ({
            repoId: numRepoId,
            filePath: e.path,
            fileName: e.path.split('/').pop() || e.path,
            changeType: e.status as PendingChange['changeType'],
            detectedAt: new Date().toISOString()
          }))
        if (svnPending.length > 0) {
          setPendingChanges(prev => {
            const existing = new Set(prev.map(p => p.filePath))
            const merged = [...prev]
            for (const p of svnPending) {
              if (!existing.has(p.filePath)) merged.push(p)
            }
            return merged
          })
        }
      })
      .catch(() => { /* svn status 실패 무시 */ })
    return () => { cancelled = true }
  }, [repoId, numRepoId])

  // 파일 목록
  const { data: files = [] } = useQuery({
    queryKey: ['file:list', numRepoId, currentPath],
    queryFn: () => invoke('file:list', { repoId: numRepoId, path: currentPath }),
    enabled: !!repoId
  })

  // 파일 목록 로드 후 대기 중인 파일 자동 선택
  useEffect(() => {
    if (pendingSelectFile && files.length > 0) {
      const match = files.find(f => f.path === pendingSelectFile)
      if (match) setSelectedFile(match)
      setPendingSelectFile(null)
    }
  }, [files, pendingSelectFile])

  // 파일별 태그 조회 — files 배열의 경로를 안정적인 키로 사용
  const [fileTagsMap, setFileTagsMap] = useState<Map<string, Array<{ name: string; color: string }>>>(new Map())
  const [tagVersion, setTagVersion] = useState(0)
  const filePathsKey = files.map(f => f.path).join('|')
  useEffect(() => {
    if (!repoId || files.length === 0) {
      if (fileTagsMap.size > 0) setFileTagsMap(new Map())
      return
    }
    const map = new Map<string, Array<{ name: string; color: string }>>()
    let cancelled = false
    Promise.all(
      files.filter(f => f.type === 'file').map(async (f) => {
        try {
          const tags = await invoke('tag:file-tags', { repoId: numRepoId, filePath: f.path })
          if (!cancelled && tags.length > 0) {
            map.set(f.path, tags.map(t => ({ name: t.name, color: t.color })))
          }
        } catch { /* 무시 */ }
      })
    ).then(() => { if (!cancelled) setFileTagsMap(new Map(map)) })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePathsKey, numRepoId, tagVersion])

  // 저장소 현황
  const { data: repoStats } = useQuery({
    queryKey: ['repo:stats', numRepoId],
    queryFn: () => invoke('repo:stats', { id: numRepoId }),
    enabled: !!repoId
  })

  // 선택된 파일의 커밋 이력
  const { data: commits = [] } = useQuery({
    queryKey: ['commit:log', numRepoId, selectedFile?.path],
    queryFn: () => invoke('commit:log', { repoId: numRepoId, path: selectedFile?.path || '', limit: 5 }),
    enabled: !!selectedFile
  })

  // 즐겨찾기 목록
  const { data: bookmarks = [] } = useQuery({
    queryKey: ['bookmark:list'],
    queryFn: () => invoke('bookmark:list')
  })
  const bookmarkedPaths = new Set(
    bookmarks.filter((b: any) => b.repoId === numRepoId).map((b: any) => b.filePath)
  )

  const handleBookmarkToggle = useCallback(async (file: FileEntry) => {
    try {
      await invoke('bookmark:toggle', { repoId: numRepoId, filePath: file.path })
      queryClient.invalidateQueries({ queryKey: ['bookmark:list'] })
    } catch (err) {
      console.error('즐겨찾기 오류:', err)
    }
  }, [numRepoId, queryClient])

  // Main → Renderer 이벤트: 파일 변경 감지 (watcher:changed)
  useEffect(() => {
    const unsubscribe = window.api.on('watcher:changed', (changes: unknown) => {
      setPendingChanges(changes as PendingChange[])
    })
    return unsubscribe
  }, [])

  // ─── 드래그앤드롭 IN (외부→앱) ───

  // 메인 영역에서 dragenter 감지 → DropZone 표시
  const handleMainDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.types.includes('Files') && !e.dataTransfer.types.includes('application/vaultline-file')) {
      setDragging(true)
    }
  }, [])

  const handleMainDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.types.includes('Files')) {
      e.dataTransfer.dropEffect = 'copy'
      if (!dragging) setDragging(true)
    }
  }, [dragging])

  // drop은 preventDefault하지 않음 — Electron will-navigate에서 가로채서 IPC로 전달
  const handleMainDrop = useCallback((_e: React.DragEvent) => {
    setDragging(false)
  }, [])

  // 드롭 처리 → 커밋 모달 (DropZone 또는 IPC에서 호출)
  const handleExternalDrop = useCallback((filePaths: string[]) => {
    console.log('[FilesPage] handleExternalDrop:', filePaths)
    setUploadFiles(filePaths)
    setShowCommitModal(true)
  }, [])

  // ─── 드래그앤드롭 OUT (앱→외부) ───

  const handleDragExport = useCallback(async (file: FileEntry) => {
    try {
      await invoke('file:drag-export', { repoId: numRepoId, path: file.path })
      // Electron의 startDrag는 Main Process에서 직접 호출해야 하므로
      // 여기서는 임시 파일 준비만 하고, 실제 OS 드래그는 HTML5 DnD로 처리
    } catch (err) {
      console.error('드래그 내보내기 오류:', err)
    }
  }, [numRepoId])

  // ─── 드래그앤드롭 MOVE (앱 내부) ───

  const handleMoveToFolder = useCallback(async (srcFile: FileEntry, destFolder: FileEntry) => {
    if (!window.confirm(`"${srcFile.name}"을(를) "${destFolder.name}" 폴더로 이동하시겠습니까?`)) return
    try {
      await invoke('file:move', {
        repoId: numRepoId,
        srcPath: srcFile.path,
        destPath: `${destFolder.path}/${srcFile.name}`,
        commitMessage: `이동: ${srcFile.path} → ${destFolder.path}/`
      })
      setSelectedFile(null)
      queryClient.invalidateQueries({ queryKey: ['file:list', numRepoId] })
    } catch (err) {
      alert(err instanceof Error ? err.message : '이동 실패')
    }
  }, [numRepoId, queryClient])

  // ─── 업로드 버튼 ───

  const handleUpload = useCallback(async () => {
    try {
      const filePaths = await invoke('dialog:open-file' as any)
      if (filePaths && (filePaths as string[]).length > 0) {
        setUploadFiles(filePaths as string[])
        setShowCommitModal(true)
      }
    } catch (err) {
      console.error('파일 선택 오류:', err)
    }
  }, [])

  // 커밋 실행
  const handleCommit = useCallback(async (message: string) => {
    try {
      await invoke('file:upload', {
        repoId: numRepoId,
        targetPath: currentPath,
        filePaths: uploadFiles,
        commitMessage: message
      })
      setShowCommitModal(false)
      setUploadFiles([])
      queryClient.invalidateQueries({ queryKey: ['file:list', numRepoId] })
      queryClient.invalidateQueries({ queryKey: ['repo:stats', numRepoId] })
    } catch (err) {
      alert(err instanceof Error ? err.message : '커밋 실패')
    }
  }, [numRepoId, currentPath, uploadFiles, queryClient])

  // 새 폴더
  const handleNewFolder = useCallback(() => {
    setShowNewFolderModal(true)
  }, [])

  const handleCreateFolder = useCallback(async (name: string) => {
    try {
      const folderPath = currentPath ? `${currentPath}/${name}` : name
      await invoke('file:mkdir', {
        repoId: numRepoId,
        path: folderPath,
        commitMessage: `폴더 생성: ${name}`
      })
      setShowNewFolderModal(false)
      queryClient.invalidateQueries({ queryKey: ['file:list', numRepoId] })
    } catch (err) {
      alert(err instanceof Error ? err.message : '폴더 생성 실패')
    }
  }, [numRepoId, currentPath, queryClient])

  // 더블클릭: 폴더→진입, 파일→OS앱 (+ 감시 시작)
  const handleDoubleClick = useCallback(async (file: FileEntry) => {
    if (file.type === 'dir') {
      setCurrentPath(file.path)
      setSelectedFile(null)
    } else {
      try {
        const result = await invoke('file:open-external', { repoId: numRepoId, path: file.path }) as any
        if (result?.locked) {
          // 잠금 파일 알림 (3초 후 자동 사라짐)
          setLockNotice(`"${file.name}"은(는) 보호 잠금 파일입니다. 읽기 전용으로 열렸습니다.`)
          setTimeout(() => setLockNotice(null), 4000)
        }
      } catch (err) {
        console.error('파일 열기 오류:', err)
      }
    }
  }, [numRepoId])

  // 파일 삭제
  const handleDelete = useCallback(async (file: FileEntry) => {
    const label = file.type === 'dir' ? '폴더' : '파일'
    if (!window.confirm(`"${file.name}" ${label}을(를) 휴지통으로 이동하시겠습니까?`)) return
    try {
      await invoke('file:delete', {
        repoId: numRepoId,
        path: file.path,
        commitMessage: `삭제: ${file.path}`
      })
      setSelectedFile(null)
      queryClient.invalidateQueries({ queryKey: ['file:list', numRepoId] })
    } catch (err) {
      alert(err instanceof Error ? err.message : '삭제 실패')
    }
  }, [numRepoId, queryClient])

  // 버전 복원
  const handleRestoreVersion = useCallback(async (file: FileEntry, revision: number) => {
    if (!window.confirm(`r.${revision} 버전으로 복원하시겠습니까? 현재 내용이 덮어써집니다.`)) return
    try {
      await invoke('file:restore-version', {
        repoId: numRepoId,
        path: file.path,
        targetRevision: revision,
        commitMessage: `r${revision} 버전으로 복원: ${file.path}`
      })
      queryClient.invalidateQueries({ queryKey: ['file:list', numRepoId] })
      queryClient.invalidateQueries({ queryKey: ['commit:log', numRepoId, file.path] })
    } catch (err) {
      alert(err instanceof Error ? err.message : '복원 실패')
    }
  }, [numRepoId, queryClient])

  // 보호 잠금 토글
  const handleLockToggle = useCallback(async (file: FileEntry) => {
    const action = file.locked ? '잠금을 해제' : '보호 잠금을 설정'
    if (!window.confirm(`"${file.name}"의 ${action}하시겠습니까?`)) return
    try {
      await invoke('lock:toggle', { repoId: numRepoId, path: file.path })
      queryClient.invalidateQueries({ queryKey: ['file:list', numRepoId] })
      if (selectedFile?.path === file.path) {
        setSelectedFile(prev => prev ? { ...prev, locked: !prev.locked } : null)
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '잠금 처리 실패')
    }
  }, [numRepoId, selectedFile, queryClient])

  // ─── 일괄 작업 (체크된 파일) ───

  const handleBulkDelete = useCallback(async () => {
    const paths = Array.from(checkedPaths)
    if (paths.length === 0) return
    if (!window.confirm(`${paths.length}개 항목을 삭제하시겠습니까?`)) return
    try {
      for (const path of paths) {
        await invoke('file:delete', { repoId: numRepoId, path, commitMessage: `일괄 삭제: ${path}` })
      }
      setCheckedPaths(new Set())
      setSelectedFile(null)
      queryClient.invalidateQueries({ queryKey: ['file:list', numRepoId] })
      queryClient.invalidateQueries({ queryKey: ['trash:list'] })
    } catch (err) {
      alert(err instanceof Error ? err.message : '삭제 실패')
    }
  }, [checkedPaths, numRepoId, queryClient])

  // 일괄 공유용 파일 목록
  const [shareFiles, setShareFiles] = useState<FileEntry[]>([])

  const handleBulkShare = useCallback(() => {
    const paths = Array.from(checkedPaths)
    if (paths.length === 0) return
    const selected = files.filter(f => paths.includes(f.path))
    if (selected.length > 0) {
      setShareFile(selected[0])
      setShareFiles(selected)
      setCheckedPaths(new Set())
    }
  }, [checkedPaths, files])

  const handleBulkLock = useCallback(async () => {
    const paths = Array.from(checkedPaths)
    if (paths.length === 0) return
    try {
      for (const path of paths) {
        await invoke('lock:toggle', { repoId: numRepoId, path })
      }
      setCheckedPaths(new Set())
      queryClient.invalidateQueries({ queryKey: ['file:list', numRepoId] })
    } catch (err) {
      alert(err instanceof Error ? err.message : '잠금 처리 실패')
    }
  }, [checkedPaths, numRepoId, queryClient])

  // ─── Pending Changes 커밋/폐기 ───

  const handlePendingCommitAll = useCallback(() => {
    if (pendingChanges.length === 0) return
    setShowPendingCommitModal(true)
  }, [pendingChanges])

  const handlePendingCommit = useCallback(async (message: string) => {
    try {
      const filePaths = pendingChanges.map(p => p.filePath)
      await invoke('watcher:commit-selected', {
        repoId: numRepoId,
        filePaths,
        commitMessage: message
      })
      setShowPendingCommitModal(false)
      queryClient.invalidateQueries({ queryKey: ['file:list', numRepoId] })
    } catch (err) {
      alert(err instanceof Error ? err.message : '커밋 실패')
    }
  }, [numRepoId, pendingChanges, queryClient])

  const handlePendingDiscardAll = useCallback(async () => {
    try {
      const filePaths = pendingChanges.map(p => p.filePath)
      await invoke('commit:batch-revert', { repoId: numRepoId, filePaths })
      setPendingChanges([])
      queryClient.invalidateQueries({ queryKey: ['file:list', numRepoId] })
    } catch (err) {
      alert(err instanceof Error ? err.message : '폐기 실패')
    }
  }, [numRepoId, pendingChanges, queryClient])

  // 파일별 개별 커밋
  const handleCommitSingleFile = useCallback((filePath: string) => {
    setUploadFiles([]) // 초기화
    setPendingChanges(prev => {
      const target = prev.find(p => p.filePath === filePath)
      if (!target) return prev
      // 단일 파일 커밋 모달 표시를 위해 상태 설정
      return prev
    })
    // 바로 커밋 실행
    invoke('commit:batch', {
      repoId: numRepoId,
      filePaths: [filePath],
      commitMessage: `수정: ${filePath.split('/').pop()}`
    }).then(() => {
      setPendingChanges(prev => prev.filter(p => p.filePath !== filePath))
      queryClient.invalidateQueries({ queryKey: ['file:list', numRepoId] })
    }).catch(err => {
      alert(err instanceof Error ? err.message : '커밋 실패')
    })
  }, [numRepoId, queryClient])

  // 파일별 개별 폐기
  const handleDiscardSingleFile = useCallback(async (filePath: string) => {
    try {
      await invoke('commit:batch-revert', { repoId: numRepoId, filePaths: [filePath] })
      setPendingChanges(prev => prev.filter(p => p.filePath !== filePath))
      queryClient.invalidateQueries({ queryKey: ['file:list', numRepoId] })
    } catch (err) {
      alert(err instanceof Error ? err.message : '폐기 실패')
    }
  }, [numRepoId, queryClient])

  // 상위 폴더
  const handleNavigateUp = () => {
    if (!currentPath) return
    const parent = currentPath.includes('/') ? currentPath.substring(0, currentPath.lastIndexOf('/')) : ''
    setCurrentPath(parent)
    setSelectedFile(null)
  }

  return (
    <div className="flex h-full relative">
      {/* 잠금 파일 열기 토스트 알림 */}
      {lockNotice && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[100] px-4 py-2.5 bg-purple-600 text-white text-[12px] font-medium rounded-lg shadow-lg flex items-center gap-2">
          <span>🔒</span>
          <span>{lockNotice}</span>
        </div>
      )}
      <div
        className="flex-1 flex flex-col overflow-hidden relative"
        onDragEnter={handleMainDragEnter}
        onDragOver={handleMainDragOver}
        onDrop={handleMainDrop}
      >
        <DropZone visible={dragging} onDrop={handleExternalDrop} onDragStateChange={setDragging} />

        {currentPath && (
          <div className="h-8 flex items-center px-4 gap-2 text-xs text-gray-500 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700">
            <button onClick={handleNavigateUp} className="hover:text-blue-600">← 상위</button>
            <span className="text-gray-300">/</span>
            <span>{currentPath}</span>
          </div>
        )}

        {/* 태그 필터 바 */}
        {tagFilter && (
          <div className="h-9 flex items-center px-4 gap-2 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-700 shrink-0">
            <span className="text-[11px] text-gray-500">태그 필터:</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium"
              style={{ backgroundColor: tagFilter.tagColor + '20', color: tagFilter.tagColor }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tagFilter.tagColor }} />
              {tagFilter.tagName}
            </span>
            <span className="text-[11px] text-gray-400">{tagFilterFiles.length}개 파일</span>
            <div className="flex-1" />
            <button onClick={() => { setTagFilter(null); setTagFilterFiles([]) }}
              className="text-[11px] px-2 py-0.5 border border-gray-200 dark:border-gray-600 rounded-md hover:bg-gray-100 text-gray-500">
              필터 해제
            </button>
          </div>
        )}

        <FileToolbar
          itemCount={tagFilter ? tagFilterFiles.length : files.length}
          checkedCount={checkedPaths.size}
          onUpload={handleUpload}
          onNewFolder={handleNewFolder}
          onLockRules={() => setShowLockRules(true)}
          onBulkDelete={handleBulkDelete}
          onBulkLock={handleBulkLock}
          onBulkShare={handleBulkShare}
          onClearChecked={() => setCheckedPaths(new Set())}
        />
        <PendingChangesBar
          pendingChanges={pendingChanges}
          onCommitAll={handlePendingCommitAll}
          onDiscardAll={handlePendingDiscardAll}
          onCommitFile={handleCommitSingleFile}
          onDiscardFile={handleDiscardSingleFile}
        />
        <FileTable
          files={tagFilter
            ? tagFilterFiles
                .filter(tf => tf.repoId === numRepoId)
                .map(tf => ({
                  name: tf.filePath.includes('/') ? tf.filePath : tf.filePath.split('/').pop() || tf.filePath,
                  path: tf.filePath,
                  type: 'file' as const,
                  size: tf.fileSize || 0,
                  revision: 0,
                  author: '',
                  date: tf.modifiedAt || '',
                  locked: false
                }))
            : files}
          selectedFile={selectedFile}
          onSelect={setSelectedFile}
          onDoubleClick={handleDoubleClick}
          onDragExport={handleDragExport}
          onMoveToFolder={handleMoveToFolder}
          onBookmarkToggle={handleBookmarkToggle}
          bookmarkedPaths={bookmarkedPaths}
          fileTagsMap={fileTagsMap}
          modifiedPaths={new Set(pendingChanges.map(p => p.filePath))}
          checkedPaths={checkedPaths}
          onCheckedChange={setCheckedPaths}
        />
      </div>

      {context?.showRightPanel && (
        <FileRightPanel
          file={selectedFile}
          repoId={numRepoId}
          recentCommits={commits}
          repoStats={repoStats}
          onLockToggle={handleLockToggle}
          onShare={setShareFile}
          onDelete={handleDelete}
          onPreview={setPreviewFile}
          onRestoreVersion={handleRestoreVersion}
          onClearSelection={() => setSelectedFile(null)}
          onTagsChanged={() => setTagVersion(v => v + 1)}
        />
      )}

      {showNewFolderModal && (
        <InputModal
          title="새 폴더"
          placeholder="폴더 이름을 입력하세요"
          onConfirm={handleCreateFolder}
          onClose={() => setShowNewFolderModal(false)}
        />
      )}

      {previewFile && (
        <PreviewModal
          file={previewFile}
          repoId={numRepoId}
          onClose={() => setPreviewFile(null)}
        />
      )}

      {shareFile && (
        <ShareModal
          file={shareFile}
          files={shareFiles.length > 1 ? shareFiles : undefined}
          repoId={numRepoId}
          onClose={() => { setShareFile(null); setShareFiles([]) }}
        />
      )}

      {showLockRules && (
        <LockRulesModal onClose={() => setShowLockRules(false)} />
      )}

      {showPendingCommitModal && (
        <CommitModal
          files={pendingChanges.map(p => ({
            name: p.fileName,
            type: 'file' as const,
            size: '',
            status: 'MODIFIED' as const,
            checked: true
          }))}
          defaultMessage={pendingChanges.length === 1 ? `수정: ${pendingChanges[0].fileName}` : `${pendingChanges.length}개 파일 수정`}
          onCommit={handlePendingCommit}
          onClose={() => setShowPendingCommitModal(false)}
        />
      )}

      {showCommitModal && (
        <CommitModal
          files={uploadFiles.map(fp => ({
            name: fp.split(/[/\\]/).pop() || fp,
            type: 'file' as const, size: '', status: 'NEW' as const, checked: true
          }))}
          defaultMessage={uploadFiles.length === 1 ? `Upload ${uploadFiles[0].split(/[/\\]/).pop()}` : `Upload ${uploadFiles.length} files`}
          onCommit={handleCommit}
          onClose={() => { setShowCommitModal(false); setUploadFiles([]) }}
        />
      )}
    </div>
  )
}
