/**
 * 파일 타입별 아이콘
 */

interface FileIconProps {
  type: 'folder' | 'file' | 'dir'
  name?: string
  size?: number
}

function getFileType(name: string): 'folder' | 'pdf' | 'doc' | 'excel' | 'image' | 'text' | 'file' {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (ext === 'pdf') return 'pdf'
  if (['doc', 'docx', 'hwp', 'hwpx'].includes(ext)) return 'doc'
  if (['xls', 'xlsx'].includes(ext)) return 'excel'
  if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp'].includes(ext)) return 'image'
  if (['txt', 'md', 'csv', 'json', 'xml', 'html', 'css'].includes(ext)) return 'text'
  return 'file'
}

export function FileIcon({ type, name = '', size = 20 }: FileIconProps) {
  if (type === 'folder' || type === 'dir') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24">
        <path d="M2 6C2 4.9 2.9 4 4 4H9L11 6H20C21.1 6 22 6.9 22 8V18C22 19.1 21.1 20 20 20H4C2.9 20 2 19.1 2 18V6Z" fill="#F6C343" stroke="#E5A800" strokeWidth=".5"/>
      </svg>
    )
  }

  const fileType = getFileType(name)
  const configs: Record<string, { color: string; label: string }> = {
    pdf: { color: '#E74C3C', label: 'PDF' },
    doc: { color: '#2B7CD0', label: 'DOC' },
    excel: { color: '#27AE60', label: 'XLS' },
    image: { color: '#8E44AD', label: 'IMG' },
    text: { color: '#7F8C8D', label: 'TXT' },
    file: { color: '#95A5A6', label: 'FILE' }
  }
  const cfg = configs[fileType] || configs.file

  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <rect x="4" y="2" width="16" height="20" rx="2" fill={cfg.color} opacity=".15" stroke={cfg.color} strokeWidth=".5"/>
      <text x="12" y="15" textAnchor="middle" fill={cfg.color} fontSize="6" fontWeight="700">{cfg.label}</text>
    </svg>
  )
}
