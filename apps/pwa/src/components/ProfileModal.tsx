import { useRef, useState } from 'react';
import { useAuth } from '../auth';
import { familyApi } from '../family';
import { ApiError } from '../api';
import { Button } from '../ui';
import Avatar from './Avatar';

function resizeToDataUrl(file: File, size = 160): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('no ctx'));
        const min = Math.min(img.width, img.height);
        const sx = (img.width - min) / 2;
        const sy = (img.height - min) / 2;
        ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ProfileModal({ onClose }: { onClose: () => void }) {
  const { user, patchUser } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [avatar, setAvatar] = useState<string | null | undefined>(user?.avatar);
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const pickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setAvatar(await resizeToDataUrl(file));
    } catch {
      setMsg('No se pudo procesar la imagen.');
    }
  };

  const save = async () => {
    if (!user) return;
    const wantPassword = Boolean(pwCurrent || pwNew || pwConfirm);
    if (wantPassword) {
      if (!pwCurrent || !pwNew || !pwConfirm) return setMsg('Completá los tres campos de contraseña.');
      if (pwNew !== pwConfirm) return setMsg('La nueva contraseña y su confirmación no coinciden.');
      if (pwNew.length < 6) return setMsg('La nueva contraseña debe tener al menos 6 caracteres.');
    }
    setBusy(true);
    setMsg('');
    try {
      await familyApi.updateProfile(user.id, { name: name.trim(), avatar: avatar ?? null });
      patchUser({ name: name.trim(), avatar: avatar ?? null });
      if (wantPassword) {
        try {
          await familyApi.changePassword(user.id, pwCurrent, pwNew, pwConfirm);
        } catch (e) {
          setBusy(false);
          return setMsg(
            e instanceof ApiError && String(e.body?.error || '').includes('Current password')
              ? 'La contraseña actual es incorrecta. (Tu nombre/foto sí se guardaron.)'
              : 'No se pudo cambiar la contraseña. (Tu nombre/foto sí se guardaron.)'
          );
        }
      }
      onClose();
    } catch {
      setMsg('No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  };

  const field = 'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-slate-800 outline-none focus:border-blue-400';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[32px] bg-white p-5 safe-bottom" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-200" />
        <h2 className="mb-4 text-lg font-extrabold text-slate-800">Editar perfil</h2>

        <div className="mb-4 flex flex-col items-center gap-3">
          <Avatar name={name} email={user?.email} avatar={avatar} size={88} />
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickPhoto} />
          <div className="flex gap-3">
            <button onClick={() => fileRef.current?.click()} className="text-sm font-bold text-blue-500">
              Cambiar foto
            </button>
            {avatar && (
              <button onClick={() => setAvatar(null)} className="text-sm font-medium text-slate-400">
                Quitar
              </button>
            )}
          </div>
        </div>

        <label className="mb-1 block text-xs font-semibold text-slate-500">Nombre</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className={field} placeholder="Tu nombre" />
        <p className="mt-2 text-xs text-slate-400">Email: {user?.email}</p>

        <div className="mt-5 border-t border-slate-100 pt-4">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-700">Cambiar contraseña</h3>
            <button type="button" onClick={() => setShowPw((s) => !s)} className="text-xs font-bold text-blue-500">
              {showPw ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>
          <p className="mb-2 text-[11px] text-slate-400">Dejá los campos en blanco si no querés cambiarla.</p>
          <input type={showPw ? 'text' : 'password'} value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)} placeholder="Contraseña actual" autoComplete="current-password" className={field + ' mb-2'} />
          <input type={showPw ? 'text' : 'password'} value={pwNew} onChange={(e) => setPwNew(e.target.value)} placeholder="Nueva contraseña (mín. 6)" autoComplete="new-password" className={field + ' mb-2'} />
          <input type={showPw ? 'text' : 'password'} value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)} placeholder="Repetir nueva contraseña" autoComplete="new-password" className={field} />
        </div>

        {msg && <p className="mt-2 text-sm text-rose-500">{msg}</p>}

        <div className="mt-5 flex gap-2">
          <Button variant="ghost" className="flex-1" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button className="flex-1" disabled={busy || !name.trim()} onClick={save}>
            {busy ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </div>
    </div>
  );
}
