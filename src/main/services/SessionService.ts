/**
 * SessionService — OS 암호화 세션 저장 (자동 로그인)
 * Electron safeStorage (Windows DPAPI / macOS Keychain) 사용
 */
import { app, safeStorage } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import log from 'electron-log'

interface SessionData {
  refreshToken: string
  serverUrl: string
  username: string
  savedAt: string
  autoLoginDays: number
}

function getSessionPath(): string {
  return join(app.getPath('userData'), 'session.enc')
}

/** 세션 저장 (refreshToken을 OS 암호화하여 파일에 기록) */
export function saveSession(data: SessionData): void {
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      log.warn('[SessionService] OS 암호화 불가 — 세션 저장 건너뜀')
      return
    }
    const json = JSON.stringify(data)
    const encrypted = safeStorage.encryptString(json)
    writeFileSync(getSessionPath(), encrypted)
    log.info('[SessionService] 세션 저장 완료')
  } catch (err) {
    log.error('[SessionService] 세션 저장 실패:', err)
  }
}

/** 세션 불러오기 (복호화 + 만료 검사) */
export function loadSession(): SessionData | null {
  const filePath = getSessionPath()
  if (!existsSync(filePath)) return null

  try {
    if (!safeStorage.isEncryptionAvailable()) return null
    const encrypted = readFileSync(filePath)
    const json = safeStorage.decryptString(encrypted)
    const data = JSON.parse(json) as SessionData

    if (!data.refreshToken || !data.serverUrl) return null
    if (data.autoLoginDays <= 0) return null

    const savedAt = new Date(data.savedAt)
    const expiresAt = new Date(savedAt.getTime() + data.autoLoginDays * 24 * 60 * 60 * 1000)
    if (new Date() > expiresAt) {
      log.info('[SessionService] 세션 만료 — 파일 삭제')
      clearSession()
      return null
    }

    return data
  } catch (err) {
    log.warn('[SessionService] 세션 복호화 실패 — 파일 삭제:', err)
    try { unlinkSync(filePath) } catch { /* 무시 */ }
    return null
  }
}

/** 세션 만료일 반환 (UI 표시용) */
export function getSessionExpiryDate(): string | null {
  const filePath = getSessionPath()
  if (!existsSync(filePath)) return null
  try {
    if (!safeStorage.isEncryptionAvailable()) return null
    const encrypted = readFileSync(filePath)
    const json = safeStorage.decryptString(encrypted)
    const data = JSON.parse(json) as SessionData
    if (!data.savedAt || data.autoLoginDays <= 0) return null
    const expiresAt = new Date(new Date(data.savedAt).getTime() + data.autoLoginDays * 24 * 60 * 60 * 1000)
    return expiresAt.toISOString()
  } catch {
    return null
  }
}

/** 세션 파일 삭제 */
export function clearSession(): void {
  try {
    const filePath = getSessionPath()
    if (existsSync(filePath)) unlinkSync(filePath)
    log.info('[SessionService] 세션 삭제 완료')
  } catch (err) {
    log.error('[SessionService] 세션 삭제 실패:', err)
  }
}
