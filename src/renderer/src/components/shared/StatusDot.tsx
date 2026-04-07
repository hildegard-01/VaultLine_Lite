/**
 * 파일 상태 도트 — synced/modified/new/locked
 */

const STATUS_COLORS: Record<string, string> = {
  synced: 'bg-status-synced',
  modified: 'bg-status-modified',
  new: 'bg-status-new',
  locked: 'bg-status-locked'
}

interface StatusDotProps {
  status: string
  className?: string
}

export function StatusDot({ status, className = '' }: StatusDotProps) {
  const color = STATUS_COLORS[status] || 'bg-status-synced'
  return (
    <div
      className={`w-2 h-2 rounded-full shrink-0 ${color} ${className}`}
      title={status}
    />
  )
}
