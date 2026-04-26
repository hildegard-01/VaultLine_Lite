/**
 * WsService — 서버 WebSocket 연결 관리
 *
 * 역할: 서버와의 WebSocket 연결을 유지하고 메시지를 라우팅합니다.
 *       연결 해제 시 5초 후 자동 재연결합니다.
 */

import WebSocket from 'ws'
import log from 'electron-log'
import { ServerConnectionService } from './ServerConnectionService'

type MessageHandler = (msg: Record<string, unknown>) => void

class WsService {
  private ws: WebSocket | null = null
  private handlers = new Map<string, Set<MessageHandler>>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private serverUrl = ''
  private shouldConnect = false
  private _needsTokenRefresh = false

  /** WebSocket 연결 시작 */
  start(serverUrl: string): void {
    this.shouldConnect = true
    this.serverUrl = serverUrl
    this._connect()
  }

  /** WebSocket 연결 종료 */
  stop(): void {
    this.shouldConnect = false
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      try { this.ws.close() } catch { /* 무시 */ }
      this.ws = null
    }
  }

  /** 메시지 전송 */
  send(msg: Record<string, unknown>): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false
    try {
      this.ws.send(JSON.stringify(msg))
      return true
    } catch {
      return false
    }
  }

  /** 특정 메시지 타입 핸들러 등록 */
  on(type: string, handler: MessageHandler): void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set())
    this.handlers.get(type)!.add(handler)
  }

  /** 핸들러 해제 */
  off(type: string, handler: MessageHandler): void {
    this.handlers.get(type)?.delete(handler)
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  private async _connect(): Promise<void> {
    if (!this.shouldConnect) return

    // 직전 연결에서 401이 발생한 경우 토큰 갱신 후 재시도
    if (this._needsTokenRefresh) {
      this._needsTokenRefresh = false
      log.info('[WS] 토큰 만료 감지 — 갱신 시도')
      const renewed = await ServerConnectionService.renewToken()
      if (!renewed) {
        log.warn('[WS] 토큰 갱신 실패 → 세션 만료')
        this._emit('__token_expired', {})
        return
      }
      log.info('[WS] 토큰 갱신 완료 → WS 재연결')
    }

    const token = ServerConnectionService.getAccessToken()
    if (!token) {
      log.warn('[WS] 토큰 없음 — 연결 보류')
      return
    }

    const wsUrl = this.serverUrl.replace(/^https?/, (m) => (m === 'https' ? 'wss' : 'ws')) + `/ws?token=${token}`

    try {
      const ws = new WebSocket(wsUrl, { rejectUnauthorized: false })
      this.ws = ws

      ws.on('open', () => {
        log.info('[WS] 서버 연결 완료')
        this._emit('__connected', {})
      })

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as Record<string, unknown>
          const type = msg.type as string
          if (type) this._emit(type, msg)
        } catch { /* 파싱 실패 무시 */ }
      })

      ws.on('close', () => {
        log.info('[WS] 연결 해제됨')
        this.ws = null
        this._emit('__disconnected', {})
        if (this.shouldConnect) {
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null
            this._connect()
          }, 5000)
        }
      })

      ws.on('error', (err) => {
        log.warn('[WS] 연결 오류:', err.message)
        // 401 = access token 만료 → close 이벤트 이후 _connect()에서 갱신
        if (err.message.includes('401') || err.message.includes('Unexpected server response: 401')) {
          this._needsTokenRefresh = true
        }
      })
    } catch (err) {
      log.error('[WS] WebSocket 생성 실패:', (err as Error).message)
      if (this.shouldConnect) {
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null
          this._connect()
        }, 5000)
      }
    }
  }

  private _emit(type: string, msg: Record<string, unknown>): void {
    this.handlers.get(type)?.forEach((h) => {
      try { h(msg) } catch (err) {
        log.error(`[WS] 핸들러 오류 (${type}):`, (err as Error).message)
      }
    })
  }
}

export const wsService = new WsService()
