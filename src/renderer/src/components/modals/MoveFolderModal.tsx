import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { invoke } from '@renderer/services/ipcClient'
import type { FileEntry } from '@shared/types/ipc'

interface MoveFolderModalProps {
  repoId: number
  targetNames: string[]
  onConfirm: (destFolder: string) => void
  onClose: () => void
}

function collectFolders(files: FileEntry[], prefix = ''): { path: string; label: string }[] {
  const result: { path: string; label: string }[] = []
  for (const f of files) {
    if (f.type !== 'dir') continue
    const fullPath = prefix ? `${prefix}/${f.name}` : f.name
    result.push({ path: fullPath, label: fullPath })
  }
  return result
}

export function MoveFolderModal({ repoId, targetNames, onConfirm, onClose }: MoveFolderModalProps) {
  const [selected, setSelected] = useState<string>('')

  // 저장소 전체 파일 목록에서 폴더만 수집
  const { data: allFiles = [], isLoading } = useQuery({
    queryKey: ['file:list', repoId, ''],
    queryFn: () => invoke('file:list', { repoId, path: '' }),
  })

  const folders = collectFolders(allFiles as FileEntry[])

  const handleConfirm = () => {
    onConfirm(selected)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-80 flex flex-col">
        <div className="px-5 py-3.5 border-b border-gray-200 dark:border-gray-700 font-bold text-sm">
          이동할 폴더 선택
        </div>

        <div className="px-5 py-3 text-[11px] text-gray-500">
          <span className="font-semibold text-gray-700 dark:text-gray-200">{targetNames.join(', ')}</span>을(를) 이동합니다.
        </div>

        <div className="px-4 pb-3 max-h-60 overflow-y-auto">
          {isLoading ? (
            <p className="text-[11px] text-gray-400 py-4 text-center">폴더 목록 불러오는 중...</p>
          ) : (
            <>
              {/* 루트 이동 옵션 */}
              <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer">
                <input
                  type="radio"
                  name="folder"
                  value=""
                  checked={selected === ''}
                  onChange={() => setSelected('')}
                  className="accent-navy"
                />
                <span className="text-[12px]">📁 루트 (최상위)</span>
              </label>
              {folders.length === 0 ? (
                <p className="text-[11px] text-gray-400 px-2 py-2">하위 폴더가 없습니다.</p>
              ) : (
                folders.map(f => (
                  <label key={f.path} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer">
                    <input
                      type="radio"
                      name="folder"
                      value={f.path}
                      checked={selected === f.path}
                      onChange={() => setSelected(f.path)}
                      className="accent-navy"
                    />
                    <span className="text-[12px]">📁 {f.label}</span>
                  </label>
                ))
              )}
            </>
          )}
        </div>

        <div className="flex gap-2 px-5 py-3.5 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="flex-1 py-1.5 text-[12px] border border-gray-200 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700">
            취소
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 py-1.5 text-[12px] bg-navy text-white rounded-md hover:bg-navy-dark font-semibold">
            이동
          </button>
        </div>
      </div>
    </div>
  )
}
