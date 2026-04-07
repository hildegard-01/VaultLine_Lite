import { handleIpc } from './index'
import * as SearchService from '../services/SearchService'
import type { SearchRequest } from '@shared/types/ipc'

/**
 * 검색 IPC 핸들러 (3개 채널)
 * search:query, search:global, search:reindex
 */

export function registerSearchHandlers(): void {
  // 저장소별 검색
  handleIpc('search:query', (args: unknown) => {
    const req = args as SearchRequest
    return SearchService.search(req)
  })

  // 전체 저장소 통합 검색
  handleIpc('search:global', (args: unknown) => {
    const { query } = args as { query: string }
    return SearchService.globalSearch(query)
  })

  // 인덱스 재구축
  handleIpc('search:reindex', (args: unknown) => {
    const { repoId } = args as { repoId: number }
    return SearchService.reindexRepo(repoId)
  })
}
