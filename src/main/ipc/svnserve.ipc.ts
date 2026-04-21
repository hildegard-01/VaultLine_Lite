import { handleIpc } from './index'
import * as SvnServeService from '../services/SvnServeService'
import * as SharedUserService from '../services/SharedUserService'

/**
 * svnserve + 공유 사용자 IPC 핸들러 (Phase 11.1)
 */

export function registerSvnServeHandlers(): void {
  // svnserve 시작
  handleIpc('svnserve:start', async (args) => {
    const { repoId, port } = args as { repoId: number; port?: number }
    return SvnServeService.start(repoId, port)
  })

  // svnserve 중지
  handleIpc('svnserve:stop', (args) => {
    const { repoId } = args as { repoId: number }
    SvnServeService.stop(repoId)
  })

  // svnserve 상태
  handleIpc('svnserve:status', (args) => {
    const { repoId } = args as { repoId: number }
    return SvnServeService.getStatus(repoId)
  })

  // 로컬 IP 주소
  handleIpc('svnserve:ip-address', () => {
    return { ip: SvnServeService.getLocalIpAddress() }
  })

  // 공유 사용자 목록
  handleIpc('shared-user:list', (args) => {
    const { repoId } = args as { repoId: number }
    return SharedUserService.listUsers(repoId)
  })

  // 공유 사용자 추가
  handleIpc('shared-user:create', (args) => {
    const { repoId, username, displayName, password, permission } = args as {
      repoId: number; username: string; displayName: string; password: string; permission: 'r' | 'rw'
    }
    return SharedUserService.createUser(repoId, username, displayName, password, permission)
  })

  // 공유 사용자 수정
  handleIpc('shared-user:update', (args) => {
    const { id, ...updates } = args as { id: number; displayName?: string; password?: string; permission?: 'r' | 'rw'; isActive?: boolean; status?: 'active' | 'locked' | 'inactive' }
    return SharedUserService.updateUser(id, updates)
  })

  // 공유 사용자 삭제
  handleIpc('shared-user:delete', (args) => {
    const { id } = args as { id: number }
    SharedUserService.deleteUser(id)
  })

  // 공유 사용자 비밀번호 재설정 (Phase U)
  handleIpc('shared-user:reset-password', (args) => {
    const { id, newPassword } = args as { id: number; newPassword: string }
    SharedUserService.updateUser(id, { password: newPassword })
  })
}
