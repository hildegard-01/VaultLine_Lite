import type { IpcChannelMap, IpcResponse } from '@shared/types/ipc'

/**
 * IPC 클라이언트 — window.api.invoke 타입 안전 래퍼
 */

export async function invoke<K extends keyof IpcChannelMap>(
  channel: K,
  ...args: IpcChannelMap[K]['req'] extends void ? [] : [IpcChannelMap[K]['req']]
): Promise<IpcChannelMap[K]['res']> {
  const response = await (window.api.invoke as Function)(channel, ...args) as IpcResponse<IpcChannelMap[K]['res']>
  if (!response.success) {
    throw new Error(response.error || '알 수 없는 오류')
  }
  return response.data!
}
