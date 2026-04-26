/**
 * SharedUploadTab — 새 버전 업로드 탭 (rw 권한 전용)
 * remote-repo:file-upload IPC 사용
 */

import { useState, type CSSProperties } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { invoke } from '@renderer/services/ipcClient'
import { colors, fontFamily } from '@renderer/design/theme'

interface Props { repoId: number; filePath: string; onUploaded?: () => void }

const S: Record<string, CSSProperties> = {
  wrap:      { maxWidth: 520 },
  label:     { display: 'block', fontSize: 12, fontWeight: 600, color: colors.textSub, marginBottom: 6 },
  input:     { width: '100%', padding: '8px 12px', fontSize: 13, border: `1px solid ${colors.border}`, borderRadius: 6, outline: 'none', fontFamily, boxSizing: 'border-box' },
  btn:       { padding: '9px 24px', background: colors.navy, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily },
  notice:    { marginTop: 20, padding: 14, background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 6, fontSize: 12, color: '#795548', lineHeight: 1.7 },
  result:    { marginTop: 16, padding: 14, background: '#e8f5e9', border: '1px solid #a5d6a7', borderRadius: 6, fontSize: 13, color: '#2e7d32', fontWeight: 600 },
  error:     { marginTop: 16, padding: 14, background: '#ffebee', border: '1px solid #ef9a9a', borderRadius: 6, fontSize: 13, color: '#c62828' },
}

export default function SharedUploadTab({ repoId, filePath, onUploaded }: Props) {
  const queryClient = useQueryClient()
  const [commitMsg, setCommitMsg] = useState('새 버전 업로드')
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<{ revision: number } | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const handleUpload = async () => {
    if (!commitMsg.trim()) { setErrorMsg('커밋 메시지를 입력하세요.'); return }
    setUploading(true)
    setResult(null)
    setErrorMsg(null)
    try {
      const res = await invoke('remote-repo:file-upload' as any, {
        id: repoId, filePath, message: commitMsg.trim(),
      })
      if (!res) {
        // 사용자가 파일 선택 취소
        return
      }
      const rev = (res as any).revision
      setResult({ revision: rev })
      queryClient.invalidateQueries({ queryKey: ['remote-repo:file-info', repoId, filePath] })
      queryClient.invalidateQueries({ queryKey: ['remote-repo:file-log', repoId, filePath] })
      onUploaded?.()
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '업로드에 실패했습니다.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div style={S.wrap}>
      <div style={{ marginBottom: 16 }}>
        <label style={S.label}>커밋 메시지</label>
        <input
          style={S.input}
          value={commitMsg}
          onChange={e => setCommitMsg(e.target.value)}
          placeholder="이 버전에 대한 설명을 입력하세요"
          disabled={uploading}
        />
      </div>

      <button
        style={{ ...S.btn, opacity: uploading ? 0.6 : 1, cursor: uploading ? 'not-allowed' : 'pointer' }}
        onClick={handleUpload}
        disabled={uploading}
      >
        {uploading ? '업로드 중...' : '파일 선택 후 업로드'}
      </button>

      {result && (
        <div style={S.result}>
          업로드 완료 — r.{result.revision} 으로 커밋되었습니다.
        </div>
      )}

      {errorMsg && (
        <div style={S.error}>{errorMsg}</div>
      )}

      <div style={S.notice}>
        <strong>안내</strong><br />
        • 업로드할 파일을 선택하면 기존 파일을 덮어쓰고 새 리비전으로 커밋합니다.<br />
        • 파일 선택 대화상자에서 취소하면 업로드가 진행되지 않습니다.<br />
        • 공유자의 svnserve 서버가 온라인이어야 합니다.
      </div>
    </div>
  )
}
