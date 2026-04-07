import { useCallback } from 'react'

/**
 * DropZone — 외부 파일 드래그앤드롭 IN 영역 (REQ-005)
 *
 * 파일 경로 추출은 preload에서 처리 (electron-file-drop 커스텀 이벤트)
 * 이 컴포넌트는 시각적 오버레이만 담당
 */

interface DropZoneProps {
  visible: boolean
  onDrop: (filePaths: string[]) => void
  onDragStateChange: (dragging: boolean) => void
}

export function DropZone({ visible, onDragStateChange }: DropZoneProps) {
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onDragStateChange(false)
    // 실제 파일 경로 처리는 preload의 electron-file-drop 이벤트에서 함
  }, [onDragStateChange])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    onDragStateChange(false)
  }, [onDragStateChange])

  if (!visible) return null

  return (
    <div
      className="absolute inset-0 bg-blue-500/[0.08] border-2 border-dashed border-blue-500 rounded-xl z-50 flex items-center justify-center"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDragLeave={handleDragLeave}
    >
      <div className="text-center pointer-events-none">
        <div className="text-4xl mb-2">📥</div>
        <div className="text-base font-semibold text-blue-600">파일을 여기에 드롭하세요</div>
        <div className="text-xs text-gray-500 mt-1">업로드 후 커밋 메시지를 입력합니다</div>
      </div>
    </div>
  )
}
