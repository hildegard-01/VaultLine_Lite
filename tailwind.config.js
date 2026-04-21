/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/src/**/*.{ts,tsx}', './src/renderer/index.html'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#1B2A4A',
          light: '#243656',
          dark: '#142038'
        },
        accent: {
          DEFAULT: '#4ECDC4',
          light: '#6FE3DC',
          dark: '#3BAFA8'
        },
        status: {
          synced: '#2E7D32',
          modified: '#E65100',
          new: '#1565C0',
          locked: '#6A1B9A'
        },
        /* V2 디자인 토큰 */
        v2: {
          bg: '#f7f8fa',
          'bg-primary': '#ffffff',
          'bg-secondary': '#f5f5f5',
          border: '#e0e0e0',
          'border-light': '#eeeeee',
          text: '#1a1a2e',
          'text-sub': '#5f6368',
          'text-muted': '#999999',
          blue: '#1565C0',
          'blue-bg': '#E3F2FD',
          green: '#2E7D32',
          'green-bg': '#E8F5E9',
          orange: '#E65100',
          'orange-bg': '#FFF3E0',
          red: '#E74C3C',
          'red-bg': '#FFEBEE',
          purple: '#6A1B9A',
          'purple-bg': '#EDE7F6',
        }
      },
      width: {
        sidebar: '200px',
        'sidebar-v2': '220px',
        'right-panel': '240px',
        'right-panel-v2': '320px'
      },
      height: {
        'header-v2': '52px'
      },
      fontFamily: {
        pretendard: ["'Pretendard Variable'", 'Pretendard', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'Roboto', "'Helvetica Neue'", "'Segoe UI'", "'Apple SD Gothic Neo'", "'Noto Sans KR'", "'Malgun Gothic'", 'sans-serif']
      }
    }
  },
  plugins: []
}
