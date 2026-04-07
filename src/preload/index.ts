import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { IpcChannelMap, IpcResponse } from '@shared/types/ipc'

/**
 * Preload 스크립트
 * contextBridge를 통해 Renderer에 안전한 IPC API를 노출
 */

// 타입 안전 invoke 래퍼
function createInvoke() {
  return async <K extends keyof IpcChannelMap>(
    channel: K,
    ...args: IpcChannelMap[K]['req'] extends void ? [] : [IpcChannelMap[K]['req']]
  ): Promise<IpcResponse<IpcChannelMap[K]['res']>> => {
    return ipcRenderer.invoke(channel, ...args)
  }
}

// Main → Renderer 이벤트 수신
function createOn() {
  return (channel: string, callback: (...args: unknown[]) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => callback(...args)
    ipcRenderer.on(channel, subscription)
    return () => {
      ipcRenderer.removeListener(channel, subscription)
    }
  }
}

// Renderer에 노출할 API
const api = {
  invoke: createInvoke(),
  on: createOn()
}

// contextBridge로 안전하게 노출
contextBridge.exposeInMainWorld('api', api)

/**
 * 파일 드래그앤드롭 처리 (preload에서 직접 DOM 이벤트 리슨)
 *
 * contextIsolation 환경에서 File.path가 비어있고,
 * webUtils.getPathForFile()도 contextBridge 프록시 객체에서는 동작하지 않으므로
 * preload에서 직접 drop 이벤트를 캡처하여 경로를 추출한 뒤 renderer에 전달
 */
document.addEventListener('drop', (e) => {
  const files = e.dataTransfer?.files
  if (!files || files.length === 0) return

  const paths: string[] = []
  for (let i = 0; i < files.length; i++) {
    try {
      const p = webUtils.getPathForFile(files[i])
      if (p) paths.push(p)
    } catch {
      // fallback
      const fp = (files[i] as any).path
      if (fp) paths.push(fp)
    }
  }

  if (paths.length > 0) {
    // renderer에 커스텀 이벤트로 전달
    window.dispatchEvent(new CustomEvent('electron-file-drop', { detail: paths }))
  }
}, true) // capture phase — React보다 먼저 실행

document.addEventListener('dragover', (e) => {
  e.preventDefault()
})

// 타입 선언 (Renderer에서 window.api 사용 시)
export type ElectronAPI = typeof api
