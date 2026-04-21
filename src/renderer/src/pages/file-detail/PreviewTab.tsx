/**
 * 미리보기 탭
 *
 * 역할: 파일 형식에 따라 미리보기를 표시합니다.
 *       이미지 → 직접 표시, PDF/Office → preview:generate로 변환 후 Base64 표시.
 */

import { useState, type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { invoke } from '@renderer/services/ipcClient';
import { colors } from '@renderer/design/theme';

interface PreviewTabProps {
  repoId: number;
  path: string;
  fileName: string;
}

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp'];
const PREVIEWABLE_EXTS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'hwp', 'hwpx', 'txt', 'md', 'csv'];

function getExt(name: string): string {
  return name.split('.').pop()?.toLowerCase() || '';
}

const S: Record<string, CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
    padding: 16,
  },
  image: {
    maxWidth: '100%',
    maxHeight: 600,
    borderRadius: 8,
    border: `1px solid ${colors.border}`,
  },
  pdfFrame: {
    width: '100%',
    height: 'calc(100vh - 260px)',
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
  },
  unsupported: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 60,
    color: colors.textMuted,
    fontSize: 14,
  },
  openBtn: {
    padding: '8px 20px',
    borderRadius: 6,
    background: colors.navy,
    color: '#fff',
    border: 'none',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
  },
};

export default function PreviewTab({ repoId, path, fileName }: PreviewTabProps) {
  const ext = getExt(fileName);
  const isImage = IMAGE_EXTS.includes(ext);
  const isPreviewable = PREVIEWABLE_EXTS.includes(ext);
  const [imgError, setImgError] = useState(false);

  /* 미리보기 생성 (이미지가 아닌 경우만) */
  const { data: preview, isLoading, error } = useQuery({
    queryKey: ['preview:generate', repoId, path],
    queryFn: () => invoke('preview:generate', { repoId, path }),
    enabled: !isImage && isPreviewable,
  });

  /* 이미지: preview:read-file로 Base64 로드 */
  const { data: imageData, isLoading: imgLoading } = useQuery({
    queryKey: ['preview:read-image', repoId, path],
    queryFn: async () => {
      /* 먼저 preview:generate로 원본 경로 획득, 그 후 read-file */
      const gen = await invoke('preview:generate', { repoId, path }) as { cachePath: string; type: string };
      const result = await invoke('preview:read-file', { filePath: gen.cachePath }) as { data: string };
      return { base64: result.data, type: gen.type };
    },
    enabled: isImage,
  });

  /* 이미지 미리보기 */
  if (isImage) {
    if (imgLoading) return <div style={S.unsupported}>이미지를 불러오는 중...</div>;
    if (imageData && !imgError) {
      const mimeMap: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', bmp: 'image/bmp' };
      const mime = mimeMap[ext] || 'image/png';
      return (
        <div style={S.container}>
          <img
            src={`data:${mime};base64,${imageData.base64}`}
            alt={fileName}
            style={S.image}
            onError={() => setImgError(true)}
          />
        </div>
      );
    }
  }

  /* PDF/Office 미리보기 */
  if (isPreviewable) {
    if (isLoading) return <div style={S.unsupported}>미리보기를 생성하는 중...</div>;
    if (error) return <div style={S.unsupported}>미리보기 생성에 실패했습니다.</div>;
    if (preview) {
      const p = preview as { cachePath: string; type: string };
      return <PreviewContent cachePath={p.cachePath} type={p.type} />;
    }
  }

  /* 미리보기 불가 */
  return (
    <div style={S.unsupported}>
      <span style={{ fontSize: 48, opacity: 0.3 }}>📄</span>
      <span>이 파일 형식은 미리보기를 지원하지 않습니다.</span>
      <button
        style={S.openBtn}
        onClick={async () => {
          try { await invoke('file:open-external', { repoId, path }); }
          catch { /* 무시 */ }
        }}
      >
        외부 앱에서 열기
      </button>
    </div>
  );
}

/* ── 미리보기 콘텐츠 (PDF Base64 렌더링) ── */
function PreviewContent({ cachePath, type }: { cachePath: string; type: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['preview:read-file', cachePath],
    queryFn: () => invoke('preview:read-file', { filePath: cachePath }),
  });

  if (isLoading) return <div style={S.unsupported}>미리보기를 불러오는 중...</div>;
  if (!data) return <div style={S.unsupported}>미리보기 데이터를 불러올 수 없습니다.</div>;

  const d = data as { data: string };

  if (type === 'pdf' || cachePath.endsWith('.pdf')) {
    return (
      <iframe
        src={`data:application/pdf;base64,${d.data}`}
        style={S.pdfFrame}
        title="미리보기"
      />
    );
  }

  /* 이미지 타입 캐시 */
  if (type.startsWith('image')) {
    return (
      <div style={S.container}>
        <img src={`data:${type};base64,${d.data}`} alt="미리보기" style={S.image} />
      </div>
    );
  }

  return <div style={S.unsupported}>미리보기를 표시할 수 없습니다.</div>;
}
