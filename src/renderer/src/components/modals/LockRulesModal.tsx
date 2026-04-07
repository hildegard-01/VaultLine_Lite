import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { invoke } from '@renderer/services/ipcClient'
import type { LockRule } from '@shared/types/ipc'

/**
 * LockRulesModal — 자동 잠금 규칙 관리 모달 (REQ-024)
 *
 * 역할: 확장자/경로/이름 패턴 기반 자동 보호 잠금 규칙 CRUD
 * 구성: 규칙 목록 테이블 + 새 규칙 추가 폼
 */

interface LockRulesModalProps {
  onClose: () => void
}

const PATTERN_TYPES: Array<{ value: LockRule['patternType']; label: string; placeholder: string }> = [
  { value: 'extension', label: '확장자', placeholder: '.pdf, .docx 등' },
  { value: 'path', label: '경로', placeholder: 'docs/계약서/ 등' },
  { value: 'name', label: '이름 포함', placeholder: '최종, 확정 등' }
]

export function LockRulesModal({ onClose }: LockRulesModalProps) {
  const queryClient = useQueryClient()
  const [patternType, setPatternType] = useState<LockRule['patternType']>('extension')
  const [pattern, setPattern] = useState('')
  const [reason, setReason] = useState('')
  const [adding, setAdding] = useState(false)

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['lock:rules-list'],
    queryFn: () => invoke('lock:rules-list')
  })

  const handleAdd = async () => {
    if (!pattern.trim()) return
    setAdding(true)
    try {
      await invoke('lock:rules-create', {
        patternType,
        pattern: pattern.trim(),
        reason: reason.trim() || '자동 보호'
      })
      setPattern('')
      setReason('')
      queryClient.invalidateQueries({ queryKey: ['lock:rules-list'] })
    } catch (err) {
      alert(err instanceof Error ? err.message : '규칙 추가 실패')
    } finally {
      setAdding(false)
    }
  }

  const handleDelete = async (rule: LockRule) => {
    if (!window.confirm(`"${rule.pattern}" 규칙을 삭제하시겠습니까?`)) return
    try {
      await invoke('lock:rules-delete', { id: rule.id })
      queryClient.invalidateQueries({ queryKey: ['lock:rules-list'] })
    } catch (err) {
      alert(err instanceof Error ? err.message : '규칙 삭제 실패')
    }
  }

  const currentType = PATTERN_TYPES.find(t => t.value === patternType)!

  return (
    <div
      className="fixed inset-0 bg-black/45 flex items-center justify-center z-[200]"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-[480px] bg-white dark:bg-gray-900 rounded-xl overflow-hidden shadow-2xl">
        <div className="px-5 py-3.5 border-b border-gray-200 dark:border-gray-700 font-bold text-sm">
          자동 잠금 규칙 관리
        </div>

        <div className="p-5">
          {/* 새 규칙 추가 */}
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg mb-4">
            <h4 className="text-[11px] font-semibold text-gray-500 mb-2">새 규칙 추가</h4>
            <div className="flex gap-2 mb-2">
              {PATTERN_TYPES.map(t => (
                <button
                  key={t.value}
                  onClick={() => setPatternType(t.value)}
                  className={`px-2.5 py-1 text-[11px] rounded-md border transition ${
                    patternType === t.value
                      ? 'border-purple-300 bg-purple-50 dark:bg-purple-900/30 text-purple-700 font-semibold'
                      : 'border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={pattern}
                onChange={e => setPattern(e.target.value)}
                placeholder={currentType.placeholder}
                className="flex-1 px-2.5 py-1.5 text-[12px] border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900"
                onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
              />
              <input
                type="text"
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="사유 (선택)"
                className="w-28 px-2.5 py-1.5 text-[12px] border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900"
                onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
              />
              <button
                onClick={handleAdd}
                disabled={!pattern.trim() || adding}
                className="px-3 py-1.5 text-[11px] font-semibold bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 transition whitespace-nowrap"
              >
                {adding ? '추가 중…' : '추가'}
              </button>
            </div>
          </div>

          {/* 규칙 목록 */}
          <div className="max-h-[280px] overflow-y-auto">
            {isLoading ? (
              <p className="text-[12px] text-gray-400 text-center py-6">로딩 중…</p>
            ) : rules.length === 0 ? (
              <p className="text-[12px] text-gray-400 text-center py-6">
                등록된 자동 잠금 규칙이 없습니다.<br />
                규칙을 추가하면 파일 업로드 시 자동으로 보호 잠금이 적용됩니다.
              </p>
            ) : (
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b-2 border-gray-200 dark:border-gray-700">
                    <th className="py-1.5 px-2 text-left text-[10px] font-semibold text-gray-400">타입</th>
                    <th className="py-1.5 px-2 text-left text-[10px] font-semibold text-gray-400">패턴</th>
                    <th className="py-1.5 px-2 text-left text-[10px] font-semibold text-gray-400">사유</th>
                    <th className="py-1.5 w-12" />
                  </tr>
                </thead>
                <tbody>
                  {rules.map(rule => (
                    <tr key={rule.id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="py-2 px-2">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-600">
                          {PATTERN_TYPES.find(t => t.value === rule.patternType)?.label || rule.patternType}
                        </span>
                      </td>
                      <td className="py-2 px-2 font-mono">{rule.pattern}</td>
                      <td className="py-2 px-2 text-gray-500">{rule.reason}</td>
                      <td className="py-2 px-1 text-center">
                        <button
                          onClick={() => handleDelete(rule)}
                          className="text-red-400 hover:text-red-600 text-[11px]"
                          title="규칙 삭제"
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800">
          <span className="text-[11px] text-gray-400">
            {rules.length}개 규칙
          </span>
          <button
            onClick={onClose}
            className="px-5 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 hover:bg-gray-50"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}
