import * as ModeManager from './ModeManager'
import { getAxiosInstance } from './ServerConnectionService'
import { SERVER_HEARTBEAT_INTERVAL_MS } from '@shared/constants'

/**
 * PresenceService — 온라인 상태 heartbeat 관리
 *
 * 역할:
 * - 커넥티드 모드에서 60초마다 서버에 heartbeat POST 전송
 * - 서버는 180초 이내 heartbeat 미수신 시 해당 사용자를 오프라인으로 표시
 * - 연결 실패 시 ModeManager.setOffline() + scheduleRetry()
 *
 * 구성:
 * - start(): heartbeat 타이머 시작
 * - stop(): heartbeat 타이머 정지
 * - sendHeartbeat(): 단일 heartbeat 전송
 */

let _timer: ReturnType<typeof setInterval> | null = null

/** heartbeat 시작 — 커넥티드 모드 전환 시 호출 */
export function start(): void {
  stop() // 중복 방지

  const intervalMs = ModeManager.getServerConfig()?.heartbeatIntervalSec
    ? (ModeManager.getServerConfig()!.heartbeatIntervalSec * 1_000)
    : SERVER_HEARTBEAT_INTERVAL_MS

  _timer = setInterval(async () => {
    if (!ModeManager.isConnected()) {
      stop()
      return
    }
    await sendHeartbeat()
  }, intervalMs)
}

/** heartbeat 정지 — 오프라인 전환 / 앱 종료 시 호출 */
export function stop(): void {
  if (_timer !== null) {
    clearInterval(_timer)
    _timer = null
  }
}

/** 단일 heartbeat 전송 */
export async function sendHeartbeat(): Promise<void> {
  try {
    const instance = getAxiosInstance()
    await instance.post('/presence/heartbeat')
  } catch (error) {
    // heartbeat 실패 → 오프라인 전환 + 재연결 예약
    stop()
    ModeManager.setOffline()

    // 재연결 시도: ServerConnectionService를 동적 import하여 순환 참조 방지
    const { autoConnect } = await import('./ServerConnectionService')
    const serverUrl = ModeManager.getStatus().serverUrl
    if (serverUrl) {
      ModeManager.scheduleRetry(async () => {
        const reachable = await autoConnect(serverUrl)
        return reachable
      })
    }
  }
}

/** heartbeat 실행 여부 */
export function isRunning(): boolean {
  return _timer !== null
}
