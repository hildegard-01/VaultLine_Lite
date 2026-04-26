import { handleIpc } from './index'
import * as TagService from '../services/TagService'
import * as BookmarkService from '../services/BookmarkService'
import * as TrashService from '../services/TrashService'

/**
 * 메타데이터 IPC 핸들러 — 태그/즐겨찾기/휴지통 (Phase 6)
 * tag:*, bookmark:*, trash:*
 */

export function registerMetadataHandlers(): void {
  // ═══ 태그 (6개) ═══
  handleIpc('tag:list', () => TagService.listTags())

  handleIpc('tag:file-tags', (args: unknown) => {
    const { repoId, filePath } = args as { repoId: number; filePath: string }
    return TagService.getFileTags(repoId, filePath)
  })

  handleIpc('tag:create', (args: unknown) => {
    const { name, color } = args as { name: string; color?: string }
    return TagService.createTag(name, color)
  })

  handleIpc('tag:update', (args: unknown) => {
    const { id, name, color } = args as { id: number; name?: string; color?: string }
    TagService.updateTag(id, name, color)
  })

  handleIpc('tag:delete', (args: unknown) => {
    const { id } = args as { id: number }
    TagService.deleteTag(id)
  })

  handleIpc('tag:attach', (args: unknown) => {
    const { repoId, filePath, tagId } = args as { repoId: number; filePath: string; tagId: number }
    TagService.attachTag(repoId, filePath, tagId)
  })

  handleIpc('tag:detach', (args: unknown) => {
    const { repoId, filePath, tagId } = args as { repoId: number; filePath: string; tagId: number }
    TagService.detachTag(repoId, filePath, tagId)
  })

  // 태그별 파일 목록 (단일)
  handleIpc('tag:files', (args: unknown) => {
    const { tagId } = args as { tagId: number }
    return TagService.getFilesByTag(tagId)
  })

  // 복수 태그 AND/OR 검색
  handleIpc('tag:search', (args: unknown) => {
    const { tagIds, mode } = args as { tagIds: number[]; mode: 'and' | 'or' }
    return TagService.getFilesByTags(tagIds, mode ?? 'or')
  })

  // 태그별 파일 수 맵
  handleIpc('tag:counts', () => TagService.getTagCounts())

  // ═══ 자동 태그 규칙 ═══
  handleIpc('tag:rule:list', () => TagService.listTagRules())

  handleIpc('tag:rule:create', (args: unknown) => {
    const { tagId, patternType, pattern } = args as { tagId: number; patternType: string; pattern: string }
    return TagService.createTagRule(tagId, patternType, pattern)
  })

  handleIpc('tag:rule:delete', (args: unknown) => {
    const { id } = args as { id: number }
    TagService.deleteTagRule(id)
  })

  handleIpc('tag:rule:toggle', (args: unknown) => {
    const { id, isActive } = args as { id: number; isActive: boolean }
    TagService.toggleTagRule(id, isActive)
  })

  // 기존 파일에 소급 적용
  handleIpc('tag:rule:apply-retroactive', () => TagService.applyAutoTagsRetroactive())

  // ═══ 즐겨찾기 (3개) ═══
  handleIpc('bookmark:list', () => BookmarkService.listBookmarks())

  handleIpc('bookmark:toggle', (args: unknown) => {
    const { repoId, filePath } = args as { repoId: number; filePath: string }
    return BookmarkService.toggleBookmark(repoId, filePath)
  })

  handleIpc('bookmark:check', (args: unknown) => {
    const { repoId, filePath } = args as { repoId: number; filePath: string }
    return BookmarkService.isBookmarked(repoId, filePath)
  })

  // ═══ 휴지통 (3개) ═══
  handleIpc('trash:list', (args: unknown) => {
    const { repoId } = (args as { repoId?: number }) || {}
    return TrashService.listTrash(repoId)
  })

  handleIpc('trash:purge', (args: unknown) => {
    const { id } = args as { id: number }
    TrashService.purgeTrashItem(id)
  })

  handleIpc('trash:empty', (args: unknown) => {
    const { repoId } = (args as { repoId?: number }) || {}
    return TrashService.emptyTrash(repoId)
  })
}
