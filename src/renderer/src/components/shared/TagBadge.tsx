/**
 * 태그 배지 컴포넌트
 */

interface TagBadgeProps {
  name: string
  color: string
}

export function TagBadge({ name, color }: TagBadgeProps) {
  return (
    <span
      className="px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
      style={{ backgroundColor: color + '18', color }}
    >
      {name}
    </span>
  )
}
