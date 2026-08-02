import { useEffect, useState, useCallback, useRef } from 'react';
import { attachmentsApi, type TaskAttachment } from '../family';

const isImage = (mime: string | null) => (mime || '').startsWith('image/');
const isVideo = (mime: string | null) => (mime || '').startsWith('video/');
const fmtSize = (bytes: number) => (bytes > 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export default function TaskAttachments({
  taskId,
  kind,
  userId,
  canUpload,
  canDelete,
  title,
  emptyText,
  accept = 'image/*,video/*'
}: {
  taskId: string;
  kind: 'attachment' | 'evidence';
  userId: string;
  canUpload: boolean;
  canDelete: (a: TaskAttachment) => boolean;
  title: string;
  emptyText: string;
  accept?: string;
}) {
  const [items, setItems] = useState<TaskAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await attachmentsApi.list(taskId, kind);
      setItems(r);
    } finally {
      setLoading(false);
    }
  }, [taskId, kind]);

  useEffect(() => {
    load();
  }, [load]);

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploading(true);
    setError('');
    try {
      await attachmentsApi.upload(taskId, file, userId, kind);
      await load();
    } catch {
      setError('No se pudo subir el archivo. Probá con uno más liviano (máx. 25MB).');
    } finally {
      setUploading(false);
    }
  };

  const remove = async (a: TaskAttachment) => {
    await attachmentsApi.remove(a.id, userId).catch(() => {});
    await load();
  };

  if (loading) return null;
  if (!items.length && !canUpload) return null;

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-700">{title}</h3>
        {canUpload && (
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="text-xs font-bold text-blue-500 disabled:opacity-50"
          >
            {uploading ? 'Subiendo…' : '📎 Agregar'}
          </button>
        )}
      </div>
      <input ref={fileRef} type="file" accept={accept} capture="environment" className="hidden" onChange={pick} />

      {error && <p className="mb-2 text-xs text-rose-500">{error}</p>}

      {items.length === 0 ? (
        <p className="text-xs text-slate-400">{emptyText}</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {items.map((a) => (
            <div key={a.id} className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              <a href={a.fileUrl} target="_blank" rel="noopener noreferrer" className="block h-full w-full">
                {isImage(a.mimeType) ? (
                  <img src={a.fileUrl} alt={a.originalName || ''} className="h-full w-full object-cover" />
                ) : isVideo(a.mimeType) ? (
                  <video src={a.fileUrl} className="h-full w-full object-cover" muted />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-1 text-center">
                    <span className="text-xl">📄</span>
                    <span className="line-clamp-2 text-[9px] text-slate-500">{a.originalName}</span>
                  </div>
                )}
              </a>
              {canDelete(a) && (
                <button
                  onClick={() => remove(a)}
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-[10px] text-white opacity-0 transition group-hover:opacity-100"
                  aria-label="Borrar"
                >
                  ✕
                </button>
              )}
              {isVideo(a.mimeType) && <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[9px] text-white">▶ video</span>}
            </div>
          ))}
        </div>
      )}
      {items.length > 0 && (
        <p className="mt-1 text-[10px] text-slate-400">{items.length} archivo{items.length === 1 ? '' : 's'} · {fmtSize(items.reduce((s, a) => s + (a.sizeBytes || 0), 0))}</p>
      )}
    </div>
  );
}
