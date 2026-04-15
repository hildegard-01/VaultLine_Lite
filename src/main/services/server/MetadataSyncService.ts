import { getDatabase } from '../DatabaseService'
import { getAxiosInstance } from './ServerConnectionService'
import * as ModeManager from './ModeManager'

/**
 * MetadataSyncService — 태그/활동로그 서버 동기화
 *
 * 역할:
 * - 파일 태그 부착/해제 이벤트를 서버 /tags/attach, /tags/detach 로 동기화
 * - 활동 로그 push (서버 /activity 미구현이면 큐잉만)
 * - 실패 시 server_sync_queue 저장, 재연결 시 flushQueue()
 *
 * 구성:
 * - syncTagAttach(): 태그 부착 동기화
 * - syncTagDetach(): 태그 해제 동기화
 * - syncActivity(): 활동 로그 동기화
 * - flushQueue(): 큐 일괄 전송
 */

/**
 * 태그 부착 동기화 — TagService.attachTag() 완료 후 호출
 */
export async function syncTagAttach(
  repoId: number,
  filePath: string,
  tagId: number
): Promise<void> {
  const serverRepoId = getServerRepoId(repoId)
  if (serverRepoId === null) return

  const payload = {
    repo_id: serverRepoId,
    file_path: filePath,
    tag_id: tagId
  }

  await _sendOrEnqueue(repoId, 'tag_attach', async () => {
    const instance = getAxiosInstance()
    await instance.post('/tags/attach', payload)
  }, payload)
}

/**
 * 태그 해제 동기화 — TagService.detachTag() 완료 후 호출
 */
export async function syncTagDetach(
  repoId: number,
  filePath: string,
  tagId: number
): Promise<void> {
  const serverRepoId = getServerRepoId(repoId)
  if (serverRepoId === null) return

  const payload = {
    repo_id: serverRepoId,
    file_path: filePath,
    tag_id: tagId
  }

  await _sendOrEnqueue(repoId, 'tag_detach', async () => {
    const instance = getAxiosInstance()
    await instance.delete('/tags/detach', {
      params: { repo_id: serverRepoId, file_path: filePath, tag_id: tagId }
    })
  }, payload)
}

/**
 * 활동 로그 동기화
 * 서버 /activity POST 엔드포인트가 준비되면 전송, 아니면 큐잉
 */
export async function syncActivity(
  repoId: number,
  action: string,
  detail?: string
): Promise<void> {
  if (!ModeManager.isConnected()) {
    _enqueue(repoId, 'activity', { repo_id: repoId, action, detail })
    return
  }

  const payload = { repo_id: repoId, action, detail }
  await _sendOrEnqueue(repoId, 'activity', async () => {
    const instance = getAxiosInstance()
    await instance.post('/activity', payload)
  }, payload)
}

/**
 * 큐 일괄 전송 — 서버 재연결 시 RepoSyncService.flushQueue()와 함께 호출
 */
export async function flushQueue(): Promise<void> {
  if (!ModeManager.isConnected()) return

  const db = getDatabase()
  const rows = db.prepare(`
    SELECT id, repo_id, action, payload
    FROM server_sync_queue
    WHERE synced_at IS NULL AND action IN ('tag_attach', 'tag_detach', 'activity')
    ORDER BY id ASC
    LIMIT 100
  `).all() as { id: number; repo_id: number; action: string; payload: string }[]

  if (rows.length === 0) return

  const instance = getAxiosInstance()

  for (const row of rows) {
    try {
      const p = JSON.parse(row.payload)

      if (row.action === 'tag_attach') {
        await instance.post('/tags/attach', p)
      } else if (row.action === 'tag_detach') {
        await instance.delete('/tags/detach', {
          params: { repo_id: p.repo_id, file_path: p.file_path, tag_id: p.tag_id }
        })
      } else if (row.action === 'activity') {
        await instance.post('/activity', p)
      }

      db.prepare(`
        UPDATE server_sync_queue SET synced_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(row.id)
    } catch {
      break // 서버 오류 시 중단
    }
  }
}

/** 전송 또는 큐잉 공통 처리 */
async function _sendOrEnqueue(
  repoId: number,
  action: string,
  sender: () => Promise<void>,
  payload: object
): Promise<void> {
  if (!ModeManager.isConnected()) {
    _enqueue(repoId, action, payload)
    return
  }

  try {
    await sender()
  } catch {
    _enqueue(repoId, action, payload)
    ModeManager.setOffline()
  }
}

/** DB 큐에 저장 */
function _enqueue(repoId: number, action: string, payload: object): void {
  try {
    const db = getDatabase()
    db.prepare(`
      INSERT INTO server_sync_queue (repo_id, action, payload, created_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `).run(repoId, action, JSON.stringify(payload))
  } catch {
    // DB 오류 무시
  }
}

/** 로컬 저장소 ID → 서버 저장소 ID 조회 */
function getServerRepoId(localRepoId: number): number | null {
  const db = getDatabase()
  const row = db.prepare(`
    SELECT value FROM app_settings WHERE key = ?
  `).get(`server_repo_id_${localRepoId}`) as { value: string } | undefined
  return row ? parseInt(row.value, 10) : null
}
