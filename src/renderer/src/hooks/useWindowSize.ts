import { useState, useEffect } from 'react'

/**
 * 윈도우 크기 감지 훅 — 데스크톱 반응형
 * xl: 1280+, lg: 1024~1279, md: 900~1023
 */

export type BreakpointSize = 'xl' | 'lg' | 'md'

export function useWindowSize() {
  const [width, setWidth] = useState(window.innerWidth)

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const breakpoint: BreakpointSize =
    width >= 1280 ? 'xl' : width >= 1024 ? 'lg' : 'md'

  return {
    width,
    breakpoint,
    isXl: breakpoint === 'xl',
    isLg: breakpoint === 'lg',
    isMd: breakpoint === 'md',
    showRightPanel: breakpoint === 'xl' || breakpoint === 'lg',
    collapseSidebar: breakpoint === 'md'
  }
}
