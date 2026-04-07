import { handleIpc } from './index'
import * as InvitationService from '../services/InvitationService'
import * as RemoteRepoService from '../services/RemoteRepoService'

/**
 * 초대 + 원격 저장소 IPC 핸들러 (Phase 11.2)
 */

export function registerInvitationHandlers(): void {
  // 초대 생성
  handleIpc('invitation:create', (args) => {
    const { repoId, sharedUserId, expiryMinutes, oneTime } = args as {
      repoId: number; sharedUserId: number; expiryMinutes?: number; oneTime?: boolean
    }
    return InvitationService.createInvitation(repoId, sharedUserId, expiryMinutes, oneTime)
  })

  // 초대 목록
  handleIpc('invitation:list', (args) => {
    const { repoId } = args as { repoId: number }
    return InvitationService.listInvitations(repoId)
  })

  // 초대 검증
  handleIpc('invitation:validate', (args) => {
    const { token } = args as { token: string }
    return InvitationService.validateInvitation(token)
  })

  // 원격 저장소 수락 (게스트 측)
  handleIpc('remote-repo:accept', async (args) => {
    const { linkData } = args as { linkData: string }
    return RemoteRepoService.acceptInvitation(linkData)
  })

  // 원격 저장소 목록
  handleIpc('remote-repo:list', () => {
    return RemoteRepoService.listRemoteRepos()
  })

  // 원격 저장소 연결 해제
  handleIpc('remote-repo:disconnect', (args) => {
    const { id } = args as { id: number }
    RemoteRepoService.disconnect(id)
  })

  // 원격 저장소 상태 확인
  handleIpc('remote-repo:status', async (args) => {
    const { id } = args as { id: number }
    return RemoteRepoService.checkStatus(id)
  })
}
