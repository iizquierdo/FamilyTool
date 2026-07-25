import { useState } from 'react';
import { useAuth } from '../auth';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email.trim(), password);
    } catch (err: any) {
      setError(err?.message === 'Invalid credentials' ? 'Email o contraseña incorrectos.' : 'No se pudo iniciar sesión.');
    } finally {
      setBusy(false);
    }
  };

  const field = 'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-slate-800 outline-none focus:border-blue-400';

  return (
    <div className="min-h-full flex flex-col justify-center px-6 py-10 safe-top">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-8 text-center">
          <img src="/icon.svg" alt="FamilyTool" className="mx-auto mb-4 h-20 w-20 rounded-[22px] shadow-[0_10px_30px_rgba(47,107,255,0.3)]" />
          <h1 className="text-2xl font-extrabold text-slate-800">FamilyTool</h1>
          <p className="mt-1 text-sm text-slate-500">Tareas en familia, con recompensas.</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" className={field} placeholder="tu@email.com" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Contraseña</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" className={field} placeholder="••••••••" />
          </div>
          {error && <p className="text-sm text-rose-500">{error}</p>}
          <button className="w-full rounded-2xl bg-blue-500 py-3.5 font-bold text-white transition active:scale-95 disabled:opacity-40" disabled={busy}>
            {busy ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}
