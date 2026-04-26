import { useState, useEffect, type CSSProperties } from 'react'
import { colors, fontFamily } from '@renderer/design/theme'

/**
 * LoginPageV2 — 앱 시작 시 표시되는 로그인 화면
 * 셸 없이 단독 표시 · 중앙 정렬 카드형 (와이어프레임 기반)
 */

interface LoginPageV2Props {
  onLoginDone: () => void
}

export default function LoginPageV2({ onLoginDone }: LoginPageV2Props) {
  const [serverUrl, setServerUrl] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [saveInfo, setSaveInfo] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [failCount, setFailCount] = useState(0)

  const isLocked = failCount >= 5

  // 저장된 서버 URL·사용자 ID 불러오기
  useEffect(() => {
    ;(async () => {
      try {
        const resp = await (window.api.invoke as Function)('settings:get') as
          { success: boolean; data?: { savedServerUrl?: string; savedUsername?: string } }
        if (resp.success && resp.data) {
          const { savedServerUrl, savedUsername } = resp.data
          if (savedServerUrl) { setServerUrl(savedServerUrl); setSaveInfo(true) }
          if (savedUsername) setUsername(savedUsername)
        }
      } catch { /* 무시 */ }
    })()
  }, [])

  const resizeToMain = async () => {
    try {
      await (window.api.invoke as Function)('system:resize-window', { width: 1280, height: 800 })
    } catch { /* 무시 */ }
  }

  const handleLogin = async () => {
    if (!serverUrl.trim()) { setError('서버 URL을 입력하세요.'); return }
    if (!username.trim()) { setError('사용자 ID를 입력하세요.'); return }
    if (!password.trim()) { setError('비밀번호를 입력하세요.'); return }
    if (isLocked) return

    setLoading(true)
    setError(null)

    try {
      // IpcResponse 형식: { success: boolean, data: { connected: boolean, mode, user } }
      const resp = await (window.api.invoke as Function)('server:connect', {
        url: serverUrl.trim(),
        username: username.trim(),
        password,
      }) as { success: boolean; data?: { connected: boolean }; error?: string }

      const connected = resp.success && resp.data?.connected === true

      if (connected) {
        // 로그인 정보 저장 (URL + ID만, 비밀번호 제외)
        try {
          await (window.api.invoke as Function)('settings:update', {
            savedServerUrl: saveInfo ? serverUrl.trim() : '',
            savedUsername: saveInfo ? username.trim() : '',
          })
        } catch { /* 무시 */ }

        await resizeToMain()
        onLoginDone()
      } else {
        const next = failCount + 1
        setFailCount(next)
        setError(next >= 5
          ? '계정이 잠겼습니다. 15분 후 다시 시도하세요.'
          : resp.error || '서버에 연결할 수 없습니다. URL과 계정을 확인하세요.')
      }
    } catch (e) {
      const next = failCount + 1
      setFailCount(next)
      setError(e instanceof Error ? e.message : '로그인 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleOffline = async () => {
    await resizeToMain()
    onLoginDone()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading && !isLocked) handleLogin()
  }

  /* ── 스타일 ── */
  const pageStyle: CSSProperties = {
    width: '100vw',
    height: '100vh',
    background: '#f7f8fa',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily,
  }

  const cardStyle: CSSProperties = {
    width: 360,
    background: '#fff',
    borderRadius: 12,
    boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
    padding: '36px 36px 28px',
  }

  const logoStyle: CSSProperties = {
    textAlign: 'center',
    marginBottom: 28,
  }

  const inputStyle: CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    fontSize: 13,
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    outline: 'none',
    fontFamily,
    boxSizing: 'border-box',
    marginBottom: 10,
    color: colors.text,
  }

  const submitStyle: CSSProperties = {
    width: '100%',
    padding: '11px',
    background: loading || isLocked ? '#9fa8b3' : colors.navy,
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: loading || isLocked ? 'not-allowed' : 'pointer',
    fontFamily,
    marginTop: 4,
  }

  const offlineBtnStyle: CSSProperties = {
    width: '100%',
    padding: '9px',
    background: 'transparent',
    color: colors.textSub,
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    fontSize: 12,
    cursor: 'pointer',
    fontFamily,
    marginTop: 8,
  }

  const errorLockedStyle: CSSProperties = {
    background: colors.orangeBg,
    color: colors.orange,
    padding: '10px 12px',
    borderRadius: 6,
    fontSize: 12,
    marginBottom: 10,
  }

  const errorNormalStyle: CSSProperties = {
    color: colors.red,
    fontSize: 12,
    marginBottom: 10,
    padding: '2px 0',
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        {/* 로고 */}
        <div style={logoStyle}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>🔐</div>
          <h1 style={{ fontSize: 22, color: colors.navy, margin: 0, fontWeight: 700 }}>VaultLine</h1>
          <p style={{ fontSize: 11, color: colors.textMuted, margin: '4px 0 0' }}>SVN 기반 문서 버전관리</p>
        </div>

        {/* 입력 폼 */}
        <input
          style={inputStyle}
          placeholder="서버 URL (예: https://vault.company.com)"
          value={serverUrl}
          onChange={(e) => setServerUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          autoFocus={!serverUrl}
        />
        <input
          style={inputStyle}
          placeholder="사용자 ID"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          autoComplete="username"
        />
        <input
          style={{ ...inputStyle, marginBottom: 4 }}
          type="password"
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          autoComplete="current-password"
        />

        {/* 로그인 정보 저장 + 안내 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={saveInfo}
              onChange={(e) => setSaveInfo(e.target.checked)}
              style={{ accentColor: colors.navy, width: 13, height: 13 }}
            />
            <span style={{ fontSize: 11, color: colors.textSub }}>URL·ID 저장</span>
          </label>
          <span style={{ fontSize: 11, color: colors.textMuted }}>5회 실패 시 15분 잠금</span>
        </div>

        {/* 에러 메시지 */}
        {error && (
          isLocked
            ? <div style={errorLockedStyle}>🔒 {error}</div>
            : <div style={errorNormalStyle}>{error}</div>
        )}

        {/* 로그인 버튼 */}
        <button style={submitStyle} onClick={handleLogin} disabled={loading || isLocked}>
          {loading ? '로그인 중...' : '로그인'}
        </button>

        {/* 구분선 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '16px 0 0' }}>
          <div style={{ flex: 1, height: 1, background: colors.border }} />
          <span style={{ fontSize: 11, color: colors.textMuted }}>또는</span>
          <div style={{ flex: 1, height: 1, background: colors.border }} />
        </div>

        {/* 오프라인 시작 */}
        <button style={offlineBtnStyle} onClick={handleOffline}>
          서버 없이 오프라인으로 시작
        </button>
      </div>
    </div>
  )
}
