import { APP_NAME } from '@shared/constants'

/**
 * 홈 페이지 — 저장소 미선택 시 표시
 */
export function HomePage(): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center h-full text-gray-500">
      <svg className="w-16 h-16 mb-4 text-accent opacity-50" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.18l6.83 3.41L12 10.96 5.17 7.59 12 4.18z" />
      </svg>
      <h1 className="text-xl font-semibold mb-2">{APP_NAME}</h1>
      <p className="text-sm">사이드바에서 저장소를 선택하거나 새로 만들어 주세요</p>
    </div>
  )
}
