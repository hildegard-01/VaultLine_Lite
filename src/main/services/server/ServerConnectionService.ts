import axios, { type AxiosInstance, type AxiosError } from 'axios'
import * as ModeManager from './ModeManager'
import { SERVER_CONNECT_TIMEOUT_MS, SERVER_REQUEST_TIMEOUT_MS } from '@shared/constants'

/**
 * ServerConnectionService — JWT 로그인/토큰 관리
 *
 * 역할:
 * - 서버 로그인 (POST /auth/login) → JWT 액세스 토큰 메모리 보관
 * - 토큰 갱신 (POST /auth/refresh)
 * - 서버 연결 해제 (POST /auth/logout)
 * - 자동 연결 (config.autoConnect 설정 기반)
 * - axios 인스턴스 제공 (다른 서버 서비스에서 재사용)
 *
 * 보안 규칙 (CLAUDE.md §7):
 * - 액세스 토큰은 메모리(JS 변수)에만 보관 — 디스크 저장 절대 금지
 * - Refresh Token은 서버가 HttpOnly 쿠키로 관리
 * - 앱 재시작 시 재로그인 필요
 */

// 메모리에만 보관 — 디스크 저장 금지
let _accessToken: string | null = null
let _refreshToken: string | null = null
let _axiosInstance: AxiosInstance | null = null

/** axios 인스턴스 생성 또는 반환 */
export function getAxiosInstance(baseUrl?: string): AxiosInstance {
  const url = baseUrl ?? ModeManager.getStatus().serverUrl

  if (!url) {
    throw new Error('서버 URL이 설정되지 않았습니다.')
  }

  // baseUrl이 변경되면 인스턴스 재생성
  if (!_axiosInstance || _axiosInstance.defaults.baseURL !== url) {
    _axiosInstance = axios.create({
      baseURL: url,
      timeout: SERVER_REQUEST_TIMEOUT_MS,
      withCredentials: true // Refresh Token 쿠키 자동 전송
    })

    // 요청 인터셉터: 액세스 토큰 자동 주입
    _axiosInstance.interceptors.request.use((config) => {
      if (_accessToken) {
        config.headers.Authorization = `Bearer ${_accessToken}`
      }
      return config
    })

    // 응답 인터셉터: 401 → 토큰 갱신 시도
    _axiosInstance.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        if (error.response?.status === 401 && _accessToken) {
          const refreshed = await _tryRefreshToken()
          if (refreshed && error.config) {
            error.config.headers.Authorization = `Bearer ${_accessToken}`
            return _axiosInstance!.request(error.config)
          } else {
            // 갱신 실패 → 오프라인 전환
            _accessToken = null
            ModeManager.setOffline()
          }
        }
        return Promise.reject(error)
      }
    )
  }

  return _axiosInstance
}

/**
 * 서버 로그인
 * @param serverUrl - 서버 기본 URL (예: http://192.168.0.10:8080)
 * @param username - 사용자 아이디
 * @param password - 비밀번호
 */
export async function login(
  serverUrl: string,
  username: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // 연결 시도용 인스턴스 (짧은 타임아웃)
    const connectInstance = axios.create({
      baseURL: serverUrl,
      timeout: SERVER_CONNECT_TIMEOUT_MS,
      withCredentials: true
    })

    const response = await connectInstance.post<{
      access_token: string
      refresh_token: string
      user_id: number
      username: string
      display_name: string | null
      role: string
    }>('/auth/login', { username, password })

    const { access_token, refresh_token, user_id, username: uname, role } = response.data

    // 토큰 메모리 보관 (디스크 저장 금지)
    _accessToken = access_token
    _refreshToken = refresh_token
    _axiosInstance = null // 인스턴스 재생성 강제 (새 URL 적용)

    // 커넥티드 모드 전환
    ModeManager.setConnected({ id: user_id, username: uname, role }, serverUrl)

    return { success: true }
  } catch (error) {
    const message = _parseError(error, '서버 연결에 실패했습니다.')
    return { success: false, error: message }
  }
}

/**
 * 서버 연결 해제
 */
export async function logout(): Promise<void> {
  if (!_accessToken) return

  try {
    const instance = getAxiosInstance()
    await instance.post('/auth/logout')
  } catch {
    // 로그아웃 실패해도 로컬 상태는 초기화
  } finally {
    _accessToken = null
    _refreshToken = null
    _axiosInstance = null
    ModeManager.setOffline()
  }
}

/**
 * 자동 연결 — config.autoConnect=true일 때 앱 시작 시 호출
 * 저장된 자격증명이 없으므로 UI에서 로그인 요청
 * → autoConnect는 "마지막 서버 URL 기억" 기능으로만 동작
 */
export async function autoConnect(serverUrl: string): Promise<boolean> {
  try {
    // 서버 헬스체크로 연결 가능 여부만 확인
    const connectInstance = axios.create({
      baseURL: serverUrl,
      timeout: SERVER_CONNECT_TIMEOUT_MS
    })
    await connectInstance.get('/health')
    return true // 서버 응답 가능 — UI에서 로그인 다이얼로그 표시
  } catch {
    return false
  }
}

/**
 * 토큰 갱신 (내부 전용)
 * Refresh Token은 HttpOnly 쿠키로 자동 전송
 */
async function _tryRefreshToken(): Promise<boolean> {
  if (!_refreshToken) return false
  try {
    const instance = getAxiosInstance()
    const response = await instance.post<{ access_token: string; refresh_token: string }>(
      '/auth/refresh',
      { refresh_token: _refreshToken }
    )
    _accessToken = response.data.access_token
    _refreshToken = response.data.refresh_token
    return true
  } catch {
    return false
  }
}

/** 현재 액세스 토큰 반환 (다른 서비스에서 직접 필요한 경우) */
export function getAccessToken(): string | null {
  return _accessToken
}

/** 서버 연결 상태 확인 (헬스체크) */
export async function checkHealth(): Promise<boolean> {
  if (!ModeManager.isConnected()) return false

  try {
    const instance = getAxiosInstance()
    await instance.get('/health')
    return true
  } catch {
    return false
  }
}

/** 오류 메시지 파싱 헬퍼 */
function _parseError(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { detail?: unknown; message?: string } | undefined
    if (typeof data?.detail === 'string' && data.detail) return data.detail
    if (data?.message) return data.message
    if (error.code === 'ECONNREFUSED') return '서버에 연결할 수 없습니다. 서버 주소를 확인하세요.'
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') return '서버 응답이 없습니다. (타임아웃)'
    if (error.response?.status === 401) return '아이디 또는 비밀번호가 올바르지 않습니다.'
    if (error.response?.status === 403) return '접근 권한이 없습니다.'
  }
  return fallback
}
