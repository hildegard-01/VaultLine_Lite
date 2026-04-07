import { useState } from 'react'
import { invoke } from '@renderer/services/ipcClient'
import { FileIcon } from '@renderer/components/shared/FileIcon'
import type { FileEntry, ShareServerStatus } from '@shared/types/ipc'

interface ShareModalProps {
  file: FileEntry
  files?: FileEntry[]   // 다중 파일 공유 시
  repoId: number
  onClose: () => void
}

export function ShareModal({ file, files, repoId, onClose }: ShareModalProps) {
  const shareFiles = files && files.length > 0 ? files : [file]
  const isMulti = shareFiles.length > 1
  const [serverStatus, setServerStatus] = useState<ShareServerStatus>({ running: false })
  const [loading, setLoading] = useState<'export' | 'server' | 'clipboard' | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 공유 옵션
  const [password, setPassword] = useState('')
  const [maxDownloads, setMaxDownloads] = useState<number | ''>('')
  const [port, setPort] = useState<number | ''>(9090)
  const [showOptions, setShowOptions] = useState(false)

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3500)
  }

  const handleExport = async () => {
    setLoading('export')
    try {
      if (isMulti) {
        // 다중 파일: 각각 export (또는 paths 전달)
        const result = await invoke('share:export', { repoId, path: shareFiles[0].path, paths: shareFiles.map(f => f.path) } as any)
        showMsg('success', `ZIP 저장 완료: ${result.exportPath.split(/[/\\]/).pop()} (${shareFiles.length}개 파일)`)
      } else {
        const result = await invoke('share:export', { repoId, path: file.path })
        showMsg('success', `ZIP 저장 완료: ${result.exportPath.split(/[/\\]/).pop()}`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '내보내기 실패'
      if (!msg.includes('취소')) showMsg('error', msg)
    } finally {
      setLoading(null)
    }
  }

  const handleToggleServer = async () => {
    setLoading('server')
    try {
      if (serverStatus.running) {
        await invoke('share:stop-server')
        setServerStatus({ running: false })
        showMsg('success', '서버가 중지되었습니다.')
      } else {
        const status = await invoke('share:start-server', {
          repoId,
          path: file.path,
          paths: isMulti ? shareFiles.map(f => f.path) : undefined,
          password: password || undefined,
          maxDownloads: maxDownloads ? Number(maxDownloads) : undefined,
          port: port ? Number(port) : undefined
        } as any)
        setServerStatus(status)
        showMsg('success', '서버가 시작되었습니다.')
      }
    } catch (err) {
      showMsg('error', err instanceof Error ? err.message : '서버 오류')
    } finally {
      setLoading(null)
    }
  }

  const handleCopyClipboard = async () => {
    setLoading('clipboard')
    try {
      const result = await invoke('share:copy-clipboard', { repoId, path: file.path })
      await navigator.clipboard.writeText(result.url)
      // 서버 상태 갱신
      const status = await invoke('share:server-status')
      setServerStatus(status)
      showMsg('success', `URL이 클립보드에 복사되었습니다.`)
    } catch (err) {
      showMsg('error', err instanceof Error ? err.message : '복사 실패')
    } finally {
      setLoading(null)
    }
  }

  const expiresText = serverStatus.expiresAt
    ? new Date(serverStatus.expiresAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    : null

  const options = [
    {
      key: 'export' as const,
      icon: '📦',
      title: '내보내기 패키지',
      desc: '파일을 ZIP으로 묶어 저장 (로컬 공유)',
      btn: loading === 'export' ? '생성 중…' : '생성',
      color: '#6A1B9A',
      action: handleExport
    },
    {
      key: 'server' as const,
      icon: '🔗',
      title: '임시 링크 공유',
      desc: serverStatus.running
        ? `${serverStatus.url} · 만료 ${expiresText}`
        : '같은 네트워크에서 접근 가능한 다운로드 링크 (60분)',
      btn: loading === 'server'
        ? (serverStatus.running ? '중지 중…' : '시작 중…')
        : (serverStatus.running ? '서버 중지' : '서버 시작'),
      color: serverStatus.running ? '#E65100' : '#1565C0',
      action: handleToggleServer
    },
    {
      key: 'clipboard' as const,
      icon: '📋',
      title: '클립보드 복사',
      desc: '공유 URL을 클립보드에 복사 (서버 자동 시작)',
      btn: loading === 'clipboard' ? '복사 중…' : '복사',
      color: '#2E7D32',
      action: handleCopyClipboard
    }
  ]

  return (
    <div
      className="fixed inset-0 bg-black/45 flex items-center justify-center z-[200]"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-[420px] bg-white dark:bg-gray-900 rounded-xl overflow-hidden shadow-2xl">
        <div className="px-5 py-3.5 border-b border-gray-200 dark:border-gray-700 font-bold text-sm">공유</div>
        <div className="p-5">
          {/* 파일 정보 */}
          <div className="p-2.5 bg-gray-50 dark:bg-gray-800 rounded-lg mb-4">
            {isMulti ? (
              <div>
                <div className="text-[13px] font-medium mb-1">{shareFiles.length}개 파일 선택됨</div>
                <div className="text-[11px] text-gray-400 max-h-16 overflow-y-auto">
                  {shareFiles.map(f => f.name).join(', ')}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <FileIcon type={file.type} name={file.name} size={18} />
                <span className="text-[13px] font-medium truncate">{file.name}</span>
              </div>
            )}
          </div>

          {/* 알림 */}
          {message && (
            <div className={`mb-3 px-3 py-2 rounded-md text-[12px] font-medium ${
              message.type === 'success'
                ? 'bg-green-50 text-green-700'
                : 'bg-red-50 text-red-700'
            }`}>
              {message.text}
            </div>
          )}

          {/* 공유 보호 옵션 */}
          <div className="mb-3">
            <button
              onClick={() => setShowOptions(v => !v)}
              className="text-[11px] text-gray-500 hover:text-blue-600 flex items-center gap-1"
            >
              <span className={`transition-transform ${showOptions ? 'rotate-90' : ''}`}>▶</span>
              링크 공유 옵션
            </button>
            {showOptions && (
              <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-2">
                <div>
                  <label className="text-[11px] text-gray-500 block mb-1">비밀번호 (선택)</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="비밀번호 미입력 시 공개"
                    disabled={serverStatus.running}
                    className="w-full px-2 py-1.5 text-[12px] border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 disabled:opacity-50"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] text-gray-500 block mb-1">다운로드 횟수 제한</label>
                    <input
                      type="number"
                      min={1}
                      value={maxDownloads}
                      onChange={e => setMaxDownloads(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="제한 없음"
                      disabled={serverStatus.running}
                      className="w-full px-2 py-1.5 text-[12px] border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-500 block mb-1">포트</label>
                    <input
                      type="number"
                      min={1024}
                      max={65535}
                      value={port}
                      onChange={e => setPort(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="9090"
                      disabled={serverStatus.running}
                      className="w-full px-2 py-1.5 text-[12px] border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 disabled:opacity-50"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 공유 옵션 */}
          {options.map((opt, i) => (
            <div
              key={opt.key}
              className={`flex items-center gap-3 py-3 ${i < options.length - 1 ? 'border-b border-gray-100 dark:border-gray-700' : ''}`}
            >
              <div className="text-2xl w-10 text-center">{opt.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold">{opt.title}</div>
                <div className="text-[11px] text-gray-500 mt-0.5 truncate">{opt.desc}</div>
              </div>
              <button
                onClick={opt.action}
                disabled={loading !== null}
                className="px-3.5 py-1 text-[11px] font-semibold rounded-md border whitespace-nowrap disabled:opacity-50"
                style={{ borderColor: opt.color + '40', backgroundColor: opt.color + '12', color: opt.color }}
              >
                {opt.btn}
              </button>
            </div>
          ))}

          {/* 서버 URL 표시 */}
          {serverStatus.running && serverStatus.url && (
            <div className="mt-3 p-2.5 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-blue-600 font-medium">
                  서버 주소
                  {serverStatus.hasPassword && <span className="ml-1 text-orange-500">🔒</span>}
                  {serverStatus.maxDownloads && <span className="ml-1 text-gray-400">({serverStatus.accessCount || 0}/{serverStatus.maxDownloads}회)</span>}
                </span>
                <button
                  onClick={async () => {
                    const url = `${serverStatus.url}/download/${serverStatus.token}`
                    await navigator.clipboard.writeText(url)
                    showMsg('success', 'URL이 클립보드에 복사되었습니다.')
                  }}
                  className="text-[11px] px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-200 hover:bg-blue-200 font-medium"
                >
                  복사
                </button>
              </div>
              <div className="text-[12px] font-mono text-blue-800 dark:text-blue-300 break-all select-all">
                {serverStatus.url}/download/{serverStatus.token}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end bg-gray-50 dark:bg-gray-800">
          <button
            onClick={onClose}
            className="px-5 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 hover:bg-gray-50"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}
