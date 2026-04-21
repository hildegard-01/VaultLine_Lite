/**
 * 파일 이동 모달 — 대상 폴더/저장소 선택
 *
 * 역할: 체크된 파일을 같은 저장소 내 폴더로 이동하거나, 다른 저장소로 이동합니다.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { invoke } from '@renderer/services/ipcClient';
import type { Repository, FileEntry } from '@shared/types/ipc';

interface MoveModalProps {
  /** 현재 저장소 ID */
  repoId: number;
  /** 이동할 파일 경로 목록 */
  srcPaths: string[];
  /** 이동 완료 콜백 */
  onDone: () => void;
  onClose: () => void;
}

export function MoveModal({ repoId, srcPaths, onDone, onClose }: MoveModalProps) {
  const [mode, setMode] = useState<'same' | 'cross'>('same');
  const [destRepoId, setDestRepoId] = useState<number>(0);
  const [destFolder, setDestFolder] = useState('');
  const [moving, setMoving] = useState(false);
  const [browsePath, setBrowsePath] = useState('');

  /* 저장소 목록 */
  const { data: repos = [] } = useQuery({
    queryKey: ['repo:list'],
    queryFn: () => invoke('repo:list'),
  });

  const repoList = repos as Repository[];
  const otherRepos = repoList.filter(r => r.id !== repoId);

  /* cross 모드에서 대상 저장소 기본값 설정 */
  const effectiveDestRepoId = mode === 'cross'
    ? (destRepoId > 0 && otherRepos.some(r => r.id === destRepoId) ? destRepoId : (otherRepos[0]?.id || 0))
    : repoId;

  /* 대상 저장소 폴더 목록 */
  const { data: folders = [] } = useQuery({
    queryKey: ['file:list', effectiveDestRepoId, browsePath, 'dirs-only'],
    queryFn: async () => {
      const files = await invoke('file:list', { repoId: effectiveDestRepoId, path: browsePath }) as FileEntry[];
      return files.filter(f => f.type === 'dir');
    },
    enabled: effectiveDestRepoId > 0,
  });

  const handleMove = async () => {
    if (moving) return;
    setMoving(true);
    try {
      const msg = `${srcPaths.length}개 파일 이동`;
      if (mode === 'same') {
        await invoke('file:bulk-move', {
          repoId,
          srcPaths,
          destFolder,
          commitMessage: msg,
        });
      } else {
        await invoke('file:cross-repo-move', {
          srcRepoId: repoId,
          destRepoId: effectiveDestRepoId,
          srcPaths,
          destFolder,
          commitMessage: msg,
        });
      }
      onDone();
    } catch (err) {
      alert(err instanceof Error ? err.message : '이동 실패');
    } finally {
      setMoving(false);
    }
  };

  /* 브레드크럼 */
  const breadcrumb = browsePath ? browsePath.split('/') : [];

  return (
    <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-[200]" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-[480px] bg-white dark:bg-gray-900 rounded-xl overflow-hidden shadow-2xl">
        {/* 헤더 */}
        <div className="px-5 py-3.5 border-b border-gray-200 dark:border-gray-700">
          <span className="font-bold text-sm">파일 이동 — {srcPaths.length}개 선택됨</span>
        </div>

        {/* 모드 선택 */}
        <div className="flex gap-1 px-5 py-2 border-b border-gray-100 dark:border-gray-700">
          <button
            onClick={() => { setMode('same'); setDestFolder(''); setBrowsePath(''); }}
            className={`px-3 py-1 text-[12px] rounded-md transition ${mode === 'same' ? 'bg-navy text-white font-semibold' : 'text-gray-400 hover:bg-gray-100'}`}
          >
            같은 저장소 내
          </button>
          {otherRepos.length > 0 && (
            <button
              onClick={() => { setMode('cross'); setDestFolder(''); setBrowsePath(''); }}
              className={`px-3 py-1 text-[12px] rounded-md transition ${mode === 'cross' ? 'bg-navy text-white font-semibold' : 'text-gray-400 hover:bg-gray-100'}`}
            >
              다른 저장소로
            </button>
          )}
        </div>

        <div className="p-5">
          {/* 대상 저장소 선택 (교차 이동) */}
          {mode === 'cross' && (
            <div className="mb-3">
              <label className="text-[11px] font-semibold text-gray-400 block mb-1">대상 저장소</label>
              <select
                value={effectiveDestRepoId}
                onChange={e => { setDestRepoId(Number(e.target.value)); setDestFolder(''); setBrowsePath(''); }}
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg outline-none"
              >
                {otherRepos.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* 폴더 탐색 */}
          <label className="text-[11px] font-semibold text-gray-400 block mb-1">대상 폴더</label>

          {/* 브레드크럼 */}
          <div className="flex items-center gap-1 text-xs text-gray-400 mb-2">
            <button
              onClick={() => { setBrowsePath(''); setDestFolder(''); }}
              className="text-blue-500 hover:underline"
            >
              루트
            </button>
            {breadcrumb.map((seg, i) => {
              const path = breadcrumb.slice(0, i + 1).join('/');
              return (
                <span key={path} className="flex items-center gap-1">
                  <span>/</span>
                  <button
                    onClick={() => { setBrowsePath(path); setDestFolder(path); }}
                    className="text-blue-500 hover:underline"
                  >
                    {seg}
                  </button>
                </span>
              );
            })}
          </div>

          {/* 폴더 목록 */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg max-h-[200px] overflow-y-auto">
            {/* 현재 폴더 선택 */}
            <div
              onClick={() => setDestFolder(browsePath)}
              className={`flex items-center gap-2 px-3 py-2 cursor-pointer text-xs transition ${
                destFolder === browsePath ? 'bg-blue-50 text-blue-600 font-semibold' : 'hover:bg-gray-50'
              }`}
            >
              <span>📁</span>
              <span>{browsePath || '루트 (최상위)'}</span>
              {destFolder === browsePath && <span className="ml-auto text-blue-500">✓</span>}
            </div>
            {(folders as FileEntry[]).map(f => (
              <div
                key={f.path}
                className={`flex items-center gap-2 px-3 py-2 cursor-pointer text-xs border-t border-gray-100 dark:border-gray-700 transition ${
                  destFolder === f.path ? 'bg-blue-50 text-blue-600 font-semibold' : 'hover:bg-gray-50'
                }`}
              >
                <span
                  className="flex items-center gap-2 flex-1"
                  onClick={() => setDestFolder(f.path)}
                >
                  <span>📂</span>
                  <span>{f.name}</span>
                  {destFolder === f.path && <span className="ml-auto text-blue-500">✓</span>}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); setBrowsePath(f.path); setDestFolder(f.path); }}
                  className="text-[10px] text-gray-400 hover:text-blue-500 px-1"
                  title="폴더 안으로"
                >
                  ▶
                </button>
              </div>
            ))}
            {(folders as FileEntry[]).length === 0 && (
              <div className="px-3 py-4 text-center text-[11px] text-gray-400 border-t border-gray-100">
                하위 폴더가 없습니다
              </div>
            )}
          </div>

          {/* 선택된 대상 표시 */}
          <div className="mt-2 text-[11px] text-gray-500">
            이동 위치: <span className="font-medium text-gray-700">{destFolder || '루트 (최상위)'}</span>
          </div>
        </div>

        {/* 푸터 */}
        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 bg-gray-50 dark:bg-gray-800">
          <button onClick={onClose} className="px-5 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 hover:bg-gray-50">
            취소
          </button>
          <button
            onClick={handleMove}
            disabled={moving}
            className="px-5 py-1.5 text-xs font-semibold bg-navy text-white rounded-md hover:bg-navy-dark disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {moving ? '이동 중...' : `이동 (${srcPaths.length}개)`}
          </button>
        </div>
      </div>
    </div>
  );
}
