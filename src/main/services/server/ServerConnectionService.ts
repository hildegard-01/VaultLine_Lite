/**
 * ServerConnectionService — JWT 로그인/토큰 관리
 *
 * 역할: 서버 인증, 토큰 갱신, health check.
 *       토큰은 메모리에만 보관 (파일 저장 금지).
 */

import axios, { type AxiosInstance } from 'axios'
import log from 'electron-log'

/** 메모리 전용 토큰 저장소 */
let accessToken = ''
let refreshToken = ''
let currentUserId = 0
let currentUsername = ''
let currentRole = ''
let serverBaseUrl = ''
let httpClient: AxiosInstance | null = null

function getClient(): AxiosInstance {
  if (!httpClient) throw new Error('서버에 연결되지 않았습니다.')
  return httpClient
}

function createClient(baseUrl: string): AxiosInstance {
  const client = axios.create({
    baseURL: baseUrl,
    timeout: 5000,
    headers: { 'Content-Type': 'application/json' },
  })

  // 요청 인터셉터: Access Token 자동 첨부
  client.interceptors.request.use((config) => {
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`
    }
    return config
  })

  // 응답 인터셉터: 401 시 토큰 갱신 시도
  client.interceptors.response.use(
    (res) => res,
    async (error) => {
      const originalRequest = error.config
      if (error.response?.status === 401 && !originalRequest._retry && refreshToken) {
        originalRequest._retry = true
        const renewed = await renewToken()
        if (renewed) {
          originalRequest.headers.Authorization = `Bearer ${accessToken}`
          return client(originalRequest)
        }
      }
      return Promise.reject(error)
    }
  )

  return client
}

/** 토큰 갱신 */
async function renewToken(): Promise<boolean> {
  if (!refreshToken || !httpClient) return false
  try {
    const res = await axios.post(`${serverBaseUrl}/auth/refresh`, {
      refresh_token: refreshToken,
    }, { timeout: 5000 })
    accessToken = res.data.access_token
    refreshToken = res.data.refresh_token
    log.info('[서버연결] 토큰 갱신 완료')
    return true
  } catch {
    log.warn('[서버연결] 토큰 갱신 실패 → 재로그인 필요')
    accessToken = ''
    refreshToken = ''
    return false
  }
}

export const ServerConnectionService = {
  /** 서버 health 확인 */
  async healthCheck(baseUrl: string): Promise<boolean> {
    try {
      const res = await axios.get(`${baseUrl}/health`, { timeout: 3000 })
      return res.data?.status === 'ok'
    } catch {
      return false
    }
  },

  /** 로그인 */
  async login(baseUrl: string, username: string, password: string): Promise<boolean> {
    try {
      serverBaseUrl = baseUrl
      httpClient = createClient(baseUrl)

      const res = await httpClient.post('/auth/login', { username, password })
      accessToken = res.data.access_token
      refreshToken = res.data.refresh_token
      currentUserId = res.data.user_id
      currentUsername = res.data.username
      currentRole = res.data.role

      log.info(`[서버연결] 로그인 성공: ${username} (${currentRole})`)
      return true
    } catch (err: any) {
      const detail = err.response?.data?.detail
      const msg = typeof detail === 'string' ? detail : (err.message || '로그인 실패')
      log.warn('[서버연결] 로그인 실패:', msg)
      return false
    }
  },

  /** 로그아웃 */
  async logout(): Promise<void> {
    if (httpClient && refreshToken) {
      try {
        await httpClient.post('/auth/logout', { refresh_token: refreshToken })
      } catch { /* 무시 */ }
    }
    accessToken = ''
    refreshToken = ''
    currentUserId = 0
    currentUsername = ''
    currentRole = ''
    httpClient = null
  },

  /** 인증된 HTTP 클라이언트 반환 */
  getClient,

  /** 현재 사용자 정보 */
  getUserInfo() {
    return { userId: currentUserId, username: currentUsername, role: currentRole }
  },

  /** Access Token 반환 (WebSocket 연결용) */
  getAccessToken(): string {
    return accessToken
  },

  /** 서버 URL 반환 */
  getBaseUrl(): string {
    return serverBaseUrl
  },

  /** 연결 상태 */
  isAuthenticated(): boolean {
    return !!accessToken
  },
}
