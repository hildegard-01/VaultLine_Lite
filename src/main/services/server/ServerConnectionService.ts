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
let refreshTokenValue = ''
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
      if (error.response?.status === 401 && !originalRequest._retry && refreshTokenValue) {
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
  if (!refreshTokenValue || !serverBaseUrl) return false
  try {
    const res = await axios.post(
      `${serverBaseUrl}/auth/refresh`,
      { refresh_token: refreshTokenValue },
      { timeout: 5000 }
    )
    accessToken = res.data.access_token
    if (res.data.refresh_token) refreshTokenValue = res.data.refresh_token
    log.info('[서버연결] 토큰 갱신 완료')
    return true
  } catch {
    log.warn('[서버연결] 토큰 갱신 실패 → 재로그인 필요')
    accessToken = ''
    refreshTokenValue = ''
    return false
  }
}

export const ServerConnectionService = {
  /** 토큰 강제 갱신 (WS 재연결 등 외부에서 직접 호출) */
  renewToken,

  /** 저장된 refreshToken으로 자동 로그인 (세션 복원) */
  async loginWithRefreshToken(baseUrl: string, storedRefreshToken: string, fallbackUsername: string): Promise<boolean> {
    try {
      serverBaseUrl = baseUrl
      httpClient = createClient(baseUrl)
      refreshTokenValue = storedRefreshToken

      const renewed = await renewToken()
      if (!renewed) {
        serverBaseUrl = ''
        httpClient = null
        refreshTokenValue = ''
        return false
      }

      // 사용자 정보 조회
      try {
        const res = await httpClient!.get('/auth/me')
        currentUserId = res.data.id ?? res.data.user_id ?? 0
        currentUsername = res.data.username ?? fallbackUsername
        currentRole = res.data.role ?? ''
      } catch {
        currentUsername = fallbackUsername
        currentRole = ''
      }

      log.info(`[서버연결] 세션 복원 자동 로그인 성공: ${currentUsername}`)
      return true
    } catch (err) {
      log.warn('[서버연결] 세션 복원 실패:', err)
      accessToken = ''
      refreshTokenValue = ''
      serverBaseUrl = ''
      httpClient = null
      return false
    }
  },

  /** 현재 Refresh Token 반환 (세션 저장용) */
  getRefreshToken(): string {
    return refreshTokenValue
  },

  /** 내 프로필 조회 */
  async getMyProfile(): Promise<{ id: number; username: string; displayName: string | null; email: string | null; role: string }> {
    const res = await getClient().get('/users/me')
    return {
      id: res.data.id ?? currentUserId,
      username: res.data.username ?? currentUsername,
      displayName: res.data.display_name ?? null,
      email: res.data.email ?? null,
      role: res.data.role ?? currentRole,
    }
  },

  /** 내 프로필 수정 (표시 이름·이메일) */
  async updateMyProfile(data: { displayName?: string; email?: string }): Promise<void> {
    await getClient().patch('/users/me', {
      display_name: data.displayName,
      email: data.email,
    })
  },

  /** 비밀번호 변경 */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await getClient().post('/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    })
  },

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
      // 서버 응답은 플랫 구조: { access_token, refresh_token, user_id, username, role, ... }
      refreshTokenValue = res.data.refresh_token ?? ''
      currentUserId = res.data.user_id ?? 0
      currentUsername = res.data.username ?? username
      currentRole = res.data.role ?? ''

      log.info(`[서버연결] 로그인 성공: ${currentUsername} (${currentRole})`)
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
    if (httpClient && refreshTokenValue) {
      try {
        await httpClient.post('/auth/logout', { refresh_token: refreshTokenValue })
      } catch { /* 무시 */ }
    }
    accessToken = ''
    refreshTokenValue = ''
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
