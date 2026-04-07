import { handleIpc } from './index'
import * as LockService from '../services/LockService'

/**
 * 보호 잠금 IPC 핸들러 (REQ-023, REQ-024)
 *
 * 채널:
 * - lock:status    — 파일 잠금 상태 조회
 * - lock:toggle    — 잠금/해제 토글
 * - lock:list      — 저장소 잠금 목록
 * - lock:rules-list   — 자동 규칙 목록
 * - lock:rules-create — 자동 규칙 추가
 * - lock:rules-delete — 자동 규칙 삭제
 */

export function registerLockHandlers(): void {
  // 파일 잠금 상태
  handleIpc('lock:status', (args) => {
    const { repoId, path } = args as { repoId: number; path: string }
    return LockService.getLockStatus(repoId, path)
  })

  // 잠금/해제 토글
  handleIpc('lock:toggle', (args) => {
    const { repoId, path, reason } = args as { repoId: number; path: string; reason?: string }
    return LockService.toggleLock(repoId, path, reason)
  })

  // 저장소 잠금 목록
  handleIpc('lock:list', (args) => {
    const { repoId } = args as { repoId: number }
    return LockService.listLocks(repoId)
  })

  // 자동 규칙 목록
  handleIpc('lock:rules-list', () => {
    return LockService.listLockRules()
  })

  // 자동 규칙 추가
  handleIpc('lock:rules-create', (args) => {
    const { patternType, pattern, reason } = args as {
      patternType: string
      pattern: string
      reason?: string
    }
    return LockService.createLockRule(patternType, pattern, reason)
  })

  // 자동 규칙 삭제
  handleIpc('lock:rules-delete', (args) => {
    const { id } = args as { id: number }
    LockService.deleteLockRule(id)
  })
}
