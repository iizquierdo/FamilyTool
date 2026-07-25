import React, { useEffect, useMemo, useState } from 'react';

interface EntityFileItem {
  id: string;
  sourceModule: string;
  sourceId: string;
  name: string;
  originalName: string;
  fileUrl: string;
  mimeType?: string;
  fileExt?: string;
  sizeBytes: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface FileManagerProps {
  sourceModule: string;
  sourceId: string;
  currentUserId?: string;
  endpointBase?: string;
  title?: string;
  emptyMessage?: string;
  className?: string;
}

const formatSize = (bytes: number) => {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const formatDate = (value?: string) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
};

const FileManager: React.FC<FileManagerProps> = ({
  sourceModule,
  sourceId,
  currentUserId,
  endpointBase = '/api/clients/files',
  title = 'Archivos',
  emptyMessage = 'No hay archivos cargados.',
  className = ''
}) => {
  const [files, setFiles] = useState<EntityFileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [customName, setCustomName] = useState('');
  const [fileToRename, setFileToRename] = useState<EntityFileItem | null>(null);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  const loadFiles = async () => {
    if (!sourceModule || !sourceId) return;
    try {
      setLoading(true);
      setError('');

      const params = new URLSearchParams({
        sourceModule: sourceModule.toUpperCase(),
        sourceId
      });

      const res = await fetch(`${endpointBase}?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'No se pudieron cargar los archivos.');
      }

      const data: EntityFileItem[] = await res.json();
      setFiles(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setFiles([]);
      setError(e.message || 'No se pudieron cargar los archivos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, [sourceModule, sourceId]);

  const filteredFiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return files;
    return files.filter((f) =>
      [f.name, f.originalName, f.fileExt, f.mimeType]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [files, search]);

  const openUploadModal = () => {
    setSelectedUploadFile(null);
    setCustomName('');
    setUploadModalOpen(true);
  };

  const closeUploadModal = () => {
    setSelectedUploadFile(null);
    setCustomName('');
    setIsDragOver(false);
    setUploadModalOpen(false);
  };

  const onDropFile = (file: File | null) => {
    if (!file) return;
    setSelectedUploadFile(file);
  };

  const openRenameModal = (file: EntityFileItem) => {
    setFileToRename(file);
    setNewName(file.name || '');
    setRenameModalOpen(true);
  };

  const closeRenameModal = () => {
    setFileToRename(null);
    setNewName('');
    setRenameModalOpen(false);
  };

  const uploadFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUploadFile) return;
    if (!currentUserId) {
      setError('Se requiere usuario autenticado para subir archivos.');
      return;
    }

    try {
      setSaving(true);
      const form = new FormData();
      form.append('file', selectedUploadFile);
      form.append('sourceModule', sourceModule.toUpperCase());
      form.append('sourceId', sourceId);
      form.append('createdById', currentUserId);
      form.append('updatedById', currentUserId);
      if (customName.trim()) form.append('name', customName.trim());

      const res = await fetch(`${endpointBase}/upload`, {
        method: 'POST',
        body: form
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'No se pudo subir el archivo.');
      }

      closeUploadModal();
      await loadFiles();
    } catch (e: any) {
      setError(e.message || 'No se pudo subir el archivo.');
    } finally {
      setSaving(false);
    }
  };

  const renameFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileToRename?.id) return;
    if (!newName.trim()) return;
    if (!currentUserId) {
      setError('Se requiere usuario autenticado para actualizar archivos.');
      return;
    }

    try {
      setSaving(true);
      const res = await fetch(`${endpointBase}/${fileToRename.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          updatedById: currentUserId
        })
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'No se pudo renombrar el archivo.');
      }

      closeRenameModal();
      await loadFiles();
    } catch (e: any) {
      setError(e.message || 'No se pudo renombrar el archivo.');
    } finally {
      setSaving(false);
    }
  };

  const deleteFile = async (file: EntityFileItem) => {
    if (!currentUserId) {
      setError('Se requiere usuario autenticado para eliminar archivos.');
      return;
    }
    if (!confirm('Deseas eliminar este archivo?')) return;

    try {
      const res = await fetch(`${endpointBase}/${file.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updatedById: currentUserId })
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'No se pudo eliminar el archivo.');
      }

      await loadFiles();
    } catch (e: any) {
      setError(e.message || 'No se pudo eliminar el archivo.');
    }
  };

  return (
    <div className={`bg-white rounded-2xl border border-slate-200 p-8 shadow-sm animate-in slide-in-from-bottom-2 min-h-[300px] space-y-6 ${className}`}>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-b border-slate-100 pb-4">
        <h3 className="text-lg font-bold text-red-500">{title}</h3>
        <div className="flex items-center gap-2">
          <div className="relative">
            <i className="fa-solid fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar archivos..."
              className="w-56 pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm"
            />
          </div>
          <button
            type="button"
            onClick={openUploadModal}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Agregar archivo
          </button>
        </div>
      </div>

      {error && <div className="bg-rose-50 border border-rose-200 text-rose-600 px-4 py-3 rounded-xl text-sm font-medium">{error}</div>}
      {loading && <div className="text-sm text-slate-500">Cargando archivos...</div>}

      {!loading && (
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-left">
            <thead className="border-b border-foreground/10 bg-table-header">
              <tr>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-table-header-foreground">Nombre</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-table-header-foreground">Tamaño</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-table-header-foreground">Última Modificación</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-table-header-foreground">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredFiles.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-400">{emptyMessage}</td>
                </tr>
              )}

              {filteredFiles.map((file) => (
                <tr key={file.id}>
                  <td className="px-4 py-3 text-sm font-semibold text-slate-800">
                    <div className="flex items-center gap-2">
                      <i className="fa-solid fa-file text-slate-400"></i>
                      <a href={file.fileUrl} target="_blank" rel="noreferrer" className="hover:text-red-500 underline">
                        {file.name}
                      </a>
                    </div>
                    <p className="text-xs text-slate-400 font-medium mt-1">{file.originalName}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{formatSize(file.sizeBytes)}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{formatDate(file.updatedAt || file.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button type="button" onClick={() => openRenameModal(file)} className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 hover:bg-red-500 hover:text-white">
                        <i className="fa-solid fa-pen text-xs"></i>
                      </button>
                      <button type="button" onClick={() => deleteFile(file)} className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 hover:bg-rose-500 hover:text-white">
                        <i className="fa-solid fa-trash text-xs"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {uploadModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={closeUploadModal}></div>
          <div className="relative bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-xl overflow-hidden">
            <form onSubmit={uploadFile}>
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900">Nuevo archivo</h3>
                <button type="button" onClick={closeUploadModal} className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-500"><i className="fa-solid fa-xmark"></i></button>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Archivo</label>
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragOver(true);
                    }}
                    onDragEnter={(e) => {
                      e.preventDefault();
                      setIsDragOver(true);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      setIsDragOver(false);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragOver(false);
                      onDropFile(e.dataTransfer.files?.[0] || null);
                    }}
                    className={`mt-1 rounded-lg border-2 border-dashed p-4 transition-all ${isDragOver ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-slate-50'}`}
                  >
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="text-sm text-slate-600">
                        <p className="font-semibold">Arrastra y suelta un archivo aqui</p>
                        <p className="text-xs text-slate-400 mt-1">o selecciona uno manualmente</p>
                      </div>
                      <label className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 cursor-pointer hover:bg-slate-100">
                        Seleccionar archivo
                        <input
                          type="file"
                          required={!selectedUploadFile}
                          onChange={(e) => onDropFile(e.target.files?.[0] || null)}
                          className="hidden"
                        />
                      </label>
                    </div>
                    <div className="mt-3 text-sm font-medium text-slate-600">
                      {selectedUploadFile ? `Archivo: ${selectedUploadFile.name}` : 'Ningun archivo seleccionado'}
                    </div>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Nombre (opcional)</label>
                  <input
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    placeholder="Ej: Contrato cliente 2026"
                  />
                </div>
              </div>

              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
                <button type="button" onClick={closeUploadModal} className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700">Cancelar</button>
                <button disabled={saving} type="submit" className="px-5 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-sm font-semibold text-white disabled:opacity-70">
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {renameModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={closeRenameModal}></div>
          <div className="relative bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-xl overflow-hidden">
            <form onSubmit={renameFile}>
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900">Editar archivo</h3>
                <button type="button" onClick={closeRenameModal} className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-500"><i className="fa-solid fa-xmark"></i></button>
              </div>

              <div className="p-6">
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Nombre</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                  className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                />
              </div>

              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
                <button type="button" onClick={closeRenameModal} className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700">Cancelar</button>
                <button disabled={saving} type="submit" className="px-5 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-sm font-semibold text-white disabled:opacity-70">
                  {saving ? 'Guardando...' : 'Actualizar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileManager;
