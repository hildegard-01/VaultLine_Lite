import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { invoke } from '@renderer/services/ipcClient'
import type { IpcChannelMap } from '@shared/types/ipc'

/**
 * useIpc — React Query + IPC 통합 훅
 */

/** IPC 조회 훅 (useQuery 래퍼) */
export function useIpcQuery<K extends keyof IpcChannelMap>(
  channel: K,
  ...args: IpcChannelMap[K]['req'] extends void ? [options?: { enabled?: boolean }] : [req: IpcChannelMap[K]['req'], options?: { enabled?: boolean }]
) {
  const hasReq = args.length > 0 && typeof args[0] !== 'object' || (args[0] && !('enabled' in (args[0] as object)))
  const req = hasReq ? args[0] as IpcChannelMap[K]['req'] : undefined
  const options = hasReq ? args[1] as { enabled?: boolean } | undefined : args[0] as { enabled?: boolean } | undefined

  return useQuery({
    queryKey: req !== undefined ? [channel, req] : [channel],
    queryFn: () => req !== undefined
      ? (invoke as Function)(channel, req)
      : (invoke as Function)(channel),
    enabled: options?.enabled
  })
}

/** IPC 변경 훅 (useMutation 래퍼) */
export function useIpcMutation<K extends keyof IpcChannelMap>(
  channel: K,
  options?: {
    invalidateKeys?: string[][]
    onSuccess?: (data: IpcChannelMap[K]['res']) => void
  }
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (req: IpcChannelMap[K]['req']) => (invoke as Function)(channel, req),
    onSuccess: (data) => {
      if (options?.invalidateKeys) {
        for (const key of options.invalidateKeys) {
          queryClient.invalidateQueries({ queryKey: key })
        }
      }
      options?.onSuccess?.(data as IpcChannelMap[K]['res'])
    }
  })
}
