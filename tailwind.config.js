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
        }
      },
      width: {
        sidebar: '200px',
        'right-panel': '240px'
      }
    }
  },
  plugins: []
}
