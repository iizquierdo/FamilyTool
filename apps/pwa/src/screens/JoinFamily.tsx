import { useEffect, useState } from 'react';
import { useAuth } from '../auth';
import { inviteApi } from '../family';
import { ApiError } from '../api';

const field = 'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-slate-800 outline-none focus:border-blue-400';

const invalidReason: Record<string, string> = {
  NOT_FOUND: 'Este link de invitación no existe.',
  REVOKED: 'Este link de invitación fue desactivado.',
  EXPIRED: 'Este link de invitación venció.',
  EXHAUSTED: 'Este link de invitación ya se usó.'
};

export default function JoinFamily({ code }: { code: string }) {
  const { acceptInvite } = useAuth();
  const [status, setStatus] = useState<'checking' | 'valid' | 'invalid'>('checking');
  const [companyName, setCompanyName] = useState('');
  const [isParent, setIsParent] = useState(false);
  const [reason, setReason] = useState('');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    inviteApi
      .validate(code)
      .then((r) => {
        if (r.valid) {
          setCompanyName(r.companyName || '');
          setIsParent(Boolean(r.isParent));
          setStatus('valid');
        } else {
          setReason(r.reason || '');
          setStatus('invalid');
        }
      })
      .catch(() => {
        setReason('NOT_FOUND');
        setStatus('invalid');
      });
  }, [code]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    setBusy(true);
    try {
      await acceptInvite(code, { name: name.trim(), email: email.trim(), password });
    } catch (err) {
      setError(
        err instanceof ApiError && err.body?.error === 'A user with this email already exists.'
          ? 'Ese email ya está en uso.'
          : 'No se pudo completar el registro. Puede que el link haya vencido.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full flex-col justify-center px-6 py-10 safe-top">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-8 text-center">
          <img src="/icon.svg" alt="FamilyTool" className="mx-auto mb-4 h-20 w-20 rounded-[22px] shadow-[0_10px_30px_rgba(47,107,255,0.3)]" />
          <h1 className="text-2xl font-extrabold text-slate-800">FamilyTool</h1>
        </div>

        {status === 'checking' && <p className="text-center text-sm text-slate-500">Verificando invitación…</p>}

        {status === 'invalid' && (
          <div className="rounded-2xl bg-white p-5 text-center shadow-[0_6px_24px_rgba(31,42,68,0.07)]">
            <p className="text-sm text-rose-500">{invalidReason[reason] || 'Este link de invitación no es válido.'}</p>
            <p className="mt-2 text-xs text-slate-400">Pedile a un adulto de tu familia que te comparta un link nuevo.</p>
          </div>
        )}

        {status === 'valid' && (
          <>
            <p className="mb-6 text-center text-sm text-slate-600">
              Te invitaron a sumarte a <strong>{companyName}</strong> como <strong>{isParent ? 'Padre/Madre' : 'Hijo/a'}</strong>.
            </p>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">Tu nombre</label>
                <input value={name} onChange={(e) => setName(e.target.value)} required className={field} placeholder="Nombre y apellido" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" className={field} placeholder="tu@email.com" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">Contraseña</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" className={field} placeholder="mín. 6 caracteres" />
              </div>
              {error && <p className="text-sm text-rose-500">{error}</p>}
              <button className="w-full rounded-2xl bg-blue-500 py-3.5 font-bold text-white transition active:scale-95 disabled:opacity-40" disabled={busy}>
                {busy ? 'Uniéndote…' : 'Unirme a la familia'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
