import { useState } from 'react';
import { useAuth } from '../auth';
import { ApiError } from '../api';

export default function Login() {
  const [mode, setMode] = useState<'login' | 'register'>('login');

  return (
    <div className="min-h-full flex flex-col justify-center px-6 py-10 safe-top">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-8 text-center">
          <img src="/icon.svg" alt="OrganiHogar" className="mx-auto mb-4 h-20 w-20 rounded-[22px] shadow-[0_10px_30px_rgba(47,107,255,0.3)]" />
          <h1 className="text-2xl font-extrabold text-slate-800">OrganiHogar</h1>
          <p className="mt-1 text-sm text-slate-500">Tareas en familia, con recompensas.</p>
        </div>

        <div className="mb-6 flex gap-1 rounded-2xl bg-white p-1 shadow-[0_6px_24px_rgba(31,42,68,0.07)]">
          <button
            onClick={() => setMode('login')}
            className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition ${mode === 'login' ? 'bg-blue-500 text-white' : 'text-slate-400'}`}
          >
            Ingresar
          </button>
          <button
            onClick={() => setMode('register')}
            className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition ${mode === 'register' ? 'bg-blue-500 text-white' : 'text-slate-400'}`}
          >
            Crear familia
          </button>
        </div>

        {mode === 'login' ? <LoginForm /> : <RegisterForm onDone={() => setMode('login')} />}
      </div>
    </div>
  );
}

const field = 'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-slate-800 outline-none focus:border-blue-400';

function LoginForm() {
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

  return (
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
  );
}

// Alta autoservicio: crea una familia (tenant) nueva y deja al usuario como admin.
function RegisterForm({ onDone }: { onDone: () => void }) {
  const { registerTenant } = useAuth();
  const [familyName, setFamilyName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    setBusy(true);
    try {
      await registerTenant({ familyName: familyName.trim(), firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), password });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError && err.body?.error === 'A user with this email already exists.' ? 'Ese email ya está en uso.' : 'No se pudo crear la familia.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-xs text-slate-500">Creá tu familia y quedás como su administrador/a. Después podés sumar al resto desde Gestión familiar.</p>
      <div>
        <label className="mb-1 block text-xs font-semibold text-slate-500">Nombre de la familia</label>
        <input value={familyName} onChange={(e) => setFamilyName(e.target.value)} required className={field} placeholder="ej: Familia Pérez" />
      </div>
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-semibold text-slate-500">Nombre</label>
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} required autoComplete="given-name" className={field} placeholder="Tu nombre" />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs font-semibold text-slate-500">Apellido</label>
          <input value={lastName} onChange={(e) => setLastName(e.target.value)} required autoComplete="family-name" className={field} placeholder="Tu apellido" />
        </div>
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
        {busy ? 'Creando…' : 'Crear familia'}
      </button>
    </form>
  );
}
