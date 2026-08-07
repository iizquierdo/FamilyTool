import { useEffect, useState } from 'react';
import { useAuth } from '../auth';
import { inviteApi } from '../family';
import { ApiError, setToken, type SessionUser } from '../api';
import { pushSupported, enablePush } from '../push';
import { detectPlatform, isStandalone, canPromptInstall, promptInstall } from '../pwaInstall';

const field = 'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-slate-800 outline-none focus:border-blue-400';

const invalidReason: Record<string, string> = {
  NOT_FOUND: 'Este link de invitación no existe.',
  REVOKED: 'Este link de invitación fue desactivado.',
  EXPIRED: 'Este link de invitación venció.',
  EXHAUSTED: 'Este link de invitación ya se usó.'
};

export default function JoinFamily({ code }: { code: string }) {
  const [status, setStatus] = useState<'checking' | 'valid' | 'invalid' | 'onboarding'>('checking');
  const [companyName, setCompanyName] = useState('');
  const [isParent, setIsParent] = useState(false);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState<{ token: string; user: SessionUser } | null>(null);

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
      const res = await inviteApi.accept(code, { name: name.trim(), email: email.trim(), password });
      // Guardamos el token ya (para poder pedir permiso de notificaciones durante el
      // onboarding), pero recién confirmamos la sesión en el contexto al terminar,
      // así el onboarding se ve antes de entrar a la app.
      setToken(res.token);
      setPending(res);
      setStatus('onboarding');
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

  if (status === 'onboarding' && pending) {
    return <OnboardingStep user={pending.user} token={pending.token} />;
  }

  return (
    <div className="flex min-h-full flex-col justify-center px-6 py-10 safe-top">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-8 text-center">
          <img src="/icon.svg" alt="OrganiHogar" className="mx-auto mb-4 h-20 w-20 rounded-[22px] shadow-[0_10px_30px_rgba(47,107,255,0.3)]" />
          <h1 className="text-2xl font-extrabold text-slate-800">OrganiHogar</h1>
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

// Paso final antes de entrar a la app: instalar la PWA (con instrucciones según el
// dispositivo) y activar las notificaciones push. Ambos son opcionales (se puede omitir).
function OnboardingStep({ user, token }: { user: SessionUser; token: string }) {
  const { applySession } = useAuth();
  const platform = detectPlatform();
  const alreadyInstalled = isStandalone();
  const [installing, setInstalling] = useState(false);
  const [pushState, setPushState] = useState<'idle' | 'busy' | 'done' | 'error' | 'denied'>('idle');

  const doInstall = async () => {
    setInstalling(true);
    try {
      await promptInstall();
    } finally {
      setInstalling(false);
    }
  };

  const doEnablePush = async () => {
    setPushState('busy');
    try {
      await enablePush(user.id);
      setPushState('done');
    } catch (e: any) {
      setPushState(e?.message === 'denied' ? 'denied' : 'error');
    }
  };

  const finish = () => applySession(token, user);

  return (
    <div className="flex min-h-full flex-col justify-center px-6 py-10 safe-top">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-6 text-center">
          <span className="text-4xl">🎉</span>
          <h1 className="mt-2 text-xl font-extrabold text-slate-800">¡Listo, {user.name?.split(' ')[0] || 'bienvenido/a'}!</h1>
          <p className="mt-1 text-sm text-slate-500">Dos pasos rápidos y opcionales para aprovechar mejor la app.</p>
        </div>

        {!alreadyInstalled && (
          <div className="mb-4 rounded-2xl bg-white p-4 shadow-[0_6px_24px_rgba(31,42,68,0.07)]">
            <p className="mb-2 text-sm font-bold text-slate-800">📲 Instalá la app en tu celular</p>

            {platform === 'android' && canPromptInstall() && (
              <button
                onClick={doInstall}
                disabled={installing}
                className="mb-2 w-full rounded-xl bg-blue-500 py-2.5 text-sm font-bold text-white transition active:scale-95 disabled:opacity-50"
              >
                {installing ? 'Abriendo…' : 'Instalar ahora'}
              </button>
            )}

            {platform === 'ios' && (
              <ol className="list-decimal space-y-1 pl-4 text-xs text-slate-500">
                <li>Abrí este link en <strong>Safari</strong>.</li>
                <li>Tocá el ícono Compartir <span className="font-bold">⬆️</span> de abajo.</li>
                <li>Elegí <strong>"Agregar a inicio"</strong> y confirmá.</li>
              </ol>
            )}

            {platform === 'android' && !canPromptInstall() && (
              <ol className="list-decimal space-y-1 pl-4 text-xs text-slate-500">
                <li>Tocá el menú <strong>⋮</strong> arriba a la derecha de Chrome.</li>
                <li>Elegí <strong>"Instalar aplicación"</strong> (o "Agregar a pantalla de inicio").</li>
                <li>Confirmá tocando <strong>"Instalar"</strong>.</li>
              </ol>
            )}

            {platform === 'desktop' && (
              <p className="text-xs text-slate-500">Buscá el ícono de instalar (⊕) en la barra de direcciones de Chrome o Edge, o abrí este link desde tu celular.</p>
            )}
          </div>
        )}

        {pushSupported() && (
          <div className="mb-6 rounded-2xl bg-white p-4 shadow-[0_6px_24px_rgba(31,42,68,0.07)]">
            <p className="mb-2 text-sm font-bold text-slate-800">🔔 Activá las notificaciones</p>
            <p className="mb-2 text-xs text-slate-500">Te avisamos cuando te validen una tarea, te carguen puntos o tengas algo pendiente.</p>
            {pushState === 'done' ? (
              <p className="text-xs font-semibold text-emerald-500">✓ Notificaciones activadas</p>
            ) : (
              <button
                onClick={doEnablePush}
                disabled={pushState === 'busy'}
                className="w-full rounded-xl bg-slate-100 py-2.5 text-sm font-bold text-slate-700 transition active:scale-95 disabled:opacity-50"
              >
                {pushState === 'busy' ? 'Activando…' : 'Activar notificaciones'}
              </button>
            )}
            {pushState === 'denied' && <p className="mt-1 text-[11px] text-rose-500">Bloqueaste el permiso. Podés activarlo después desde tu perfil.</p>}
            {pushState === 'error' && <p className="mt-1 text-[11px] text-rose-500">No se pudo activar. Podés reintentar luego desde tu perfil.</p>}
          </div>
        )}

        <button onClick={finish} className="w-full rounded-2xl bg-blue-500 py-3.5 font-bold text-white transition active:scale-95">
          Ir a OrganiHogar
        </button>
      </div>
    </div>
  );
}
