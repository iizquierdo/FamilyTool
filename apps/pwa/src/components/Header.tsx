import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../auth';
import { familyApi, type AppNotification } from '../family';
import Avatar from './Avatar';
import ProfileModal from './ProfileModal';

const typeIcon: Record<string, string> = {
  task_submitted: '📝',
  task_validated: '✅',
  task_rejected: '↩️',
  withdrawal_requested: '💸',
  withdrawal_approved: '✅',
  withdrawal_rejected: '⛔',
  points_minted: '➕',
  transfer_received: '🤝'
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'recién';
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.floor(h / 24)}d`;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return 'Buenas noches';
  if (h < 13) return 'Buenos días';
  if (h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

export default function Header() {
  const { user, logout } = useAuth();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [points, setPoints] = useState<number | null>(null);
  const [panel, setPanel] = useState<null | 'notif' | 'user'>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  const load = useCallback(() => {
    if (!user) return;
    familyApi.notifications(user.id).then((r) => {
      setItems(r.items);
      setUnread(r.unread);
    }).catch(() => {});
    familyApi.wallet(user.id).then((w) => setPoints(w.moneyPoints)).catch(() => {});
  }, [user]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    const onWallet = () => load();
    window.addEventListener('familytool:wallet-changed', onWallet);
    return () => {
      clearInterval(t);
      window.removeEventListener('familytool:wallet-changed', onWallet);
    };
  }, [load]);

  const openNotifs = async () => {
    const opening = panel !== 'notif';
    setPanel(opening ? 'notif' : null);
    if (opening && unread > 0 && user) {
      await familyApi.markNotificationsRead(user.id).catch(() => {});
      setUnread(0);
      setItems((prev) => prev.map((i) => ({ ...i, read: true })));
    }
  };

  const firstName = (user?.name || user?.email || '').split(' ')[0];

  return (
    <header className="sticky top-0 z-30 bg-[var(--ft-bg)] safe-top">
      <div className="mx-auto flex max-w-lg items-center justify-between gap-3 px-4 py-3">
        <button onClick={() => setPanel(panel === 'user' ? null : 'user')} className="flex items-center gap-2.5 text-left" aria-label="Menú de usuario">
          <Avatar name={user?.name} email={user?.email} avatar={user?.avatar} size={44} />
          <span className="leading-tight">
            <span className="block text-xs text-slate-500">¡{greeting()}!</span>
            <span className="block text-[15px] font-extrabold text-slate-800">{firstName}</span>
          </span>
        </button>

        <div className="flex items-center gap-2">
          {points != null && (
            <div className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 shadow-[0_4px_14px_rgba(31,42,68,0.10)]">
              <span className="text-base">🪙</span>
              <span className="text-sm font-extrabold text-slate-800">{points.toLocaleString('es-AR')}</span>
            </div>
          )}
          <button onClick={openNotifs} className="relative rounded-full bg-white p-2.5 text-lg shadow-[0_4px_14px_rgba(31,42,68,0.10)]" aria-label="Notificaciones">
            🔔
            {unread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>
        </div>
      </div>

      {panel && <div className="fixed inset-0 z-20" onClick={() => setPanel(null)} />}

      {panel === 'notif' && (
        <div className="absolute right-3 z-30 mt-1 max-h-[70vh] w-[min(22rem,92vw)] overflow-y-auto rounded-xl bg-white shadow-[0_10px_40px_rgba(31,42,68,0.18)]">
          <div className="px-4 py-3 text-sm font-bold text-slate-800">Notificaciones</div>
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400">No tenés notificaciones.</p>
          ) : (
            items.map((n) => (
              <div key={n.id} className={`flex gap-3 border-t border-slate-100 px-4 py-3 ${n.read ? '' : 'bg-blue-50/60'}`}>
                <span className="text-lg">{typeIcon[n.type] || '🔔'}</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-800">{n.title}</p>
                  {n.body && <p className="text-xs text-slate-500">{n.body}</p>}
                  <p className="mt-0.5 text-[11px] text-slate-400">{timeAgo(n.createdAt)}</p>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {panel === 'user' && (
        <div className="absolute left-3 z-30 mt-1 w-60 overflow-hidden rounded-xl bg-white shadow-[0_10px_40px_rgba(31,42,68,0.18)]">
          <div className="flex items-center gap-3 px-4 py-3">
            <Avatar name={user?.name} email={user?.email} avatar={user?.avatar} size={40} />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-800">{user?.name || user?.email}</p>
              <p className="truncate text-xs text-slate-500">{user?.email}</p>
            </div>
          </div>
          <button onClick={() => { setPanel(null); setProfileOpen(true); }} className="flex w-full items-center gap-3 border-t border-slate-100 px-4 py-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-50">
            <span>✏️</span> Editar perfil
          </button>
          <button onClick={() => { setPanel(null); logout(); }} className="flex w-full items-center gap-3 border-t border-slate-100 px-4 py-3 text-left text-sm font-medium text-rose-500 hover:bg-slate-50">
            <span>🚪</span> Cerrar sesión
          </button>
        </div>
      )}

      {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} />}
    </header>
  );
}
