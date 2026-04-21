import { app, shell, BrowserWindow, dialog, protocol, net } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import log from 'electron-log'

// electron-log 초기화
log.initialize()
log.transports.file.level = 'debug'
log.transports.console.level = 'debug'
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}] [{level}] {text}'
console.log = log.log.bind(log)
console.error = log.error.bind(log)
console.warn = log.warn.bind(log)
import { initDatabase, closeDatabase } from './services/DatabaseService'
import { registerIpcHandlers } from './ipc'
import { hasPendingChanges, closeAll as closeWatcher } from './services/FileWatcherService'
import { stopAll as stopAllSvnServe } from './services/SvnServeService'
import { modeManager } from './services/server/ModeManager'
import { PresenceService } from './services/server/PresenceService'

/**
 * Electron Main Process 진입점
 */

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: 'VaultLine Lite',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // 외부 링크는 기본 브라우저에서 열기
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // 파일 드롭 시 Electron은 file:// URL로 탐색을 시도함
  // → 탐색을 차단하고, file:// URL이면 경로를 추출하여 renderer에 IPC 전달
  mainWindow.webContents.on('will-navigate', (event, url) => {
    event.preventDefault()

    // 파일 드롭 감지: file:/// URL이면 경로 추출 → renderer로 전달
    if (url.startsWith('file:///')) {
      const filePath = decodeURIComponent(url.replace('file:///', ''))
      // Windows: C:/path → C:\path
      const normalizedPath = process.platform === 'win32' ? filePath.replace(/\//g, '\\') : '/' + filePath
      console.log('[Main] 파일 드롭 감지:', normalizedPath)
      mainWindow?.webContents.send('file-dropped', [normalizedPath])
    }
  })

  // 개발 모드: dev server, 프로덕션: 빌드된 파일
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// 커스텀 프로토콜 등록 — 로컬 파일 미리보기용 (app.whenReady 전에 호출)
protocol.registerSchemesAsPrivileged([
  { scheme: 'vaultline-preview', privileges: { bypassCSP: true, stream: true, supportFetchAPI: true } }
])

// Electron 초기화
app.whenReady().then(() => {
  // 앱 ID 설정
  electronApp.setAppUserModelId('com.vaultline.lite')

  // vaultline-preview:// 프로토콜 핸들러 — 로컬 파일을 안전하게 서빙
  protocol.handle('vaultline-preview', (request) => {
    // vaultline-preview://C:/path/to/file → file:///C:/path/to/file
    const filePath = decodeURIComponent(request.url.replace('vaultline-preview://', ''))
    return net.fetch('file:///' + filePath)
  })

  // 개발 모드에서 F12로 DevTools 토글
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // DB 초기화 (19개 테이블 + FTS5 + server_sync_queue)
  initDatabase()

  // IPC 핸들러 등록
  registerIpcHandlers()

  // 서버 모드 초기화 (config.json server 블록 로드)
  try {
    const { readFileSync, existsSync } = require('fs') as typeof import('fs')
    const configPath = app.isPackaged
      ? require('path').join(process.resourcesPath, 'config.json')
      : require('path').join(app.getAppPath(), 'config.json')
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'))
      if (config?.server) {
        modeManager.initialize(config.server).catch(() => {})
      }
    }
  } catch {
    // config.json 없음 → 오프라인 모드 유지
  }

  // 메인 윈도우 생성
  createWindow()

  // macOS: dock 아이콘 클릭 시 윈도우 재생성
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// Windows/Linux: 모든 윈도우 닫으면 앱 종료
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 앱 종료 시 미커밋 변경 경고 (REQ-007)
let _forceQuit = false
app.on('before-quit', async (event) => {
  if (_forceQuit) return

  if (hasPendingChanges()) {
    event.preventDefault()
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
    if (!win) { _forceQuit = true; app.quit(); return }

    const { response } = await dialog.showMessageBox(win, {
      type: 'warning',
      title: '미커밋 변경 사항',
      message: '저장하지 않은 변경 사항이 있습니다.\n종료하시겠습니까?',
      buttons: ['종료', '취소'],
      defaultId: 1,
      cancelId: 1
    })

    if (response === 0) {
      _forceQuit = true
      app.quit()
    }
  }
})

// 앱 종료 시 watcher + svnserve + DB + 서버 서비스 정리
app.on('will-quit', async () => {
  PresenceService.stop()
  await modeManager.cleanup()
  stopAllSvnServe()
  await closeWatcher()
  closeDatabase()
})

// docvault:// 프로토콜 핸들러 (v1.3 초대 링크)
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('docvault', process.execPath, [process.argv[1]])
  }
} else {
  app.setAsDefaultProtocolClient('docvault')
}

// 두 번째 인스턴스에서 docvault:// URL 수신 → Renderer로 전달
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    // Windows: argv에서 docvault:// URL 추출
    const url = argv.find(arg => arg.startsWith('docvault://'))
    if (url && mainWindow) {
      mainWindow.webContents.send('docvault:invitation', url)
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  // macOS: open-url 이벤트
  app.on('open-url', (_event, url) => {
    if (url.startsWith('docvault://') && mainWindow) {
      mainWindow.webContents.send('docvault:invitation', url)
    }
  })
}
