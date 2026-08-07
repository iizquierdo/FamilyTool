import { useEffect, useState } from 'react';
import { detectPlatform, isStandalone, canPromptInstall, promptInstall, onInstallAvailable } from '../pwaInstall';

const DISMISS_KEY = 'organihogar.installPromptDismissed';

// Ofrece instalar la PWA al entrar por el navegador (fuera del flujo de invitación,
// que ya tiene su propio paso de instalación en JoinFamily). Android: banner con el
// prompt nativo. iOS: modal con los pasos manuales (Safari no soporta beforeinstallprompt).
export default function InstallPrompt() {
  const [platform] = useState(detectPlatform);
  const [standalone] = useState(isStandalone);
  const [available, setAvailable] = useState(canPromptInstall);
  const [installing, setInstalling] = useState(false);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1');

  useEffect(() => {
    if (platform !== 'android') return;
    return onInstallAvailable(() => setAvailable(true));
  }, [platform]);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  };

  const doInstall = async () => {
    setInstalling(true);
    try {
      const outcome = await promptInstall();
      if (outcome !== 'unavailable') dismiss();
    } finally {
      setInstalling(false);
    }
  };

  if (standalone || dismissed) return null;

  if (platform === 'android' && available) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-50 safe-bottom">
        <div className="mx-auto flex max-w-lg items-center gap-3 bg-slate-900 px-4 py-3 text-white shadow-[0_-4px_20px_rgba(0,0,0,0.25)]">
          <img src="/icon.svg" alt="" className="h-9 w-9 rounded-[10px]" />
          <div className="flex-1">
            <p className="text-sm font-bold">Instalá OrganiHogar</p>
            <p className="text-xs text-white/70">Accedé más rápido desde tu pantalla de inicio.</p>
          </div>
          <button onClick={dismiss} aria-label="Cerrar" className="px-1 text-lg text-white/60">
            ✕
          </button>
          <button
            onClick={doInstall}
            disabled={installing}
            className="shrink-0 rounded-xl bg-blue-500 px-3 py-2 text-sm font-bold transition active:scale-95 disabled:opacity-50"
          >
            {installing ? 'Abriendo…' : 'Instalar'}
          </button>
        </div>
      </div>
    );
  }

  if (platform === 'ios') {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={dismiss}>
        <div
          className="w-full max-w-sm rounded-t-3xl bg-white p-5 shadow-xl safe-bottom sm:rounded-3xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-3 flex items-center gap-3">
            <img src="/icon.svg" alt="" className="h-12 w-12 rounded-[14px]" />
            <div>
              <p className="text-base font-bold text-slate-800">Instalá OrganiHogar</p>
              <p className="text-xs text-slate-500">Accedé más rápido y recibí notificaciones.</p>
            </div>
          </div>
          <ol className="list-decimal space-y-1.5 pl-4 text-sm text-slate-600">
            <li>
              Tocá el ícono Compartir <span className="font-bold">⬆️</span> de la barra del navegador.
            </li>
            <li>
              Elegí <strong>"Agregar a inicio"</strong>.
            </li>
            <li>
              Confirmá tocando <strong>"Agregar"</strong> arriba a la derecha.
            </li>
          </ol>
          <button
            onClick={dismiss}
            className="mt-4 w-full rounded-2xl bg-slate-100 py-3 text-sm font-bold text-slate-700 transition active:scale-95"
          >
            Entendido
          </button>
        </div>
      </div>
    );
  }

  return null;
}
