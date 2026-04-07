import { handleIpc } from './index'
import * as RepoService from '../services/RepoService'
import type { CreateRepoRequest, ImportRepoRequest, Repository } from '@shared/types/ipc'

/**
 * 저장소 IPC 핸들러 (6개 채널)
 * repo:list, repo:create, repo:import, repo:update, repo:delete, repo:stats
 */

export function registerRepoHandlers(): void {
  // 저장소 목록
  handleIpc('repo:list', () => {
    return RepoService.listRepos()
  })

  // 저장소 생성
  handleIpc('repo:create', async (args: unknown) => {
    const req = args as CreateRepoRequest
    return await RepoService.createRepo(req)
  })

  // 기존 폴더 가져오기
  handleIpc('repo:import', async (args: unknown) => {
    const req = args as ImportRepoRequest
    return await RepoService.importRepo(req)
  })

  // 저장소 설정 수정
  handleIpc('repo:update', (args: unknown) => {
    const { id, ...updates } = args as { id: number } & Partial<Repository>
    return RepoService.updateRepo(id, updates)
  })

  // 저장소 삭제
  handleIpc('repo:delete', (args: unknown) => {
    const { id } = args as { id: number }
    RepoService.deleteRepo(id)
  })

  // 저장소 통계
  handleIpc('repo:stats', async (args: unknown) => {
    const { id } = args as { id: number }
    return await RepoService.getRepoStats(id)
  })
}
