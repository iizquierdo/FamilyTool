import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../auth';
import { familyApi, type Wallet, type LedgerEntry, type FamilyMember, type FamilyConfig, type Gamification } from '../family';
import { ApiError } from '../api';

const reasonLabel: Record<string, string> = {
  task_reward: 'Tarea completada',
  transfer_in: 'Transferencia recibida',
  transfer_out: 'Transferencia enviada',
  withdrawal: 'Retiro',
  mint: 'Puntos cargados',
  goal_contribution: 'Aporte a meta',
  adjustment: 'Ajuste'
};

const reasonIcon: Record<string, string> = {
  task_reward: '⭐',
  transfer_in: '🤝',
  transfer_out: '📤',
  withdrawal: '💵',
  mint: '➕',
  goal_contribution: '🎯',
  adjustment: '⚙️'
};

const card = 'rounded-[14px] bg-white p-5 shadow-[0_8px_30px_rgba(31,42,68,0.08)]';
const notifyWallet = () => window.dispatchEvent(new Event('familytool:wallet-changed'));

function Spin() {
  return (
    <div className="flex justify-center py-16">
      <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-slate-200 border-t-blue-500" />
    </div>
  );
}

export default function WalletScreen() {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [history, setHistory] = useState<LedgerEntry[]>([]);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [config, setConfig] = useState<FamilyConfig | null>(null);
  const [game, setGame] = useState<Gamification | null>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<null | 'transfer' | 'withdraw'>(null);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    const [w, h, m, c, g] = await Promise.all([
      familyApi.wallet(user.id),
      familyApi.history(user.id),
      familyApi.members(user.companyId),
      familyApi.config(user.companyId),
      familyApi.gamification(user.id)
    ]);
    setWallet(w);
    setHistory(h);
    setMembers(m.filter((x) => x.id !== user.id));
    setConfig(c);
    setGame(g);
    setLoading(false);
    notifyWallet();
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !wallet) return <Spin />;

  const rank = wallet.rank;

  return (
    <div className="space-y-4">
      {/* Hero billetera */}
      <div className="relative overflow-hidden rounded-[15px] bg-gradient-to-br from-blue-500 to-indigo-500 p-5 text-white shadow-[0_12px_34px_rgba(47,107,255,0.35)]">
        <div className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-12 -left-6 h-32 w-32 rounded-full bg-white/10" />
        <p className="text-sm font-medium text-white/80">Mi billetera</p>
        <div className="mt-1 flex items-end gap-2">
          <span className="text-5xl font-black leading-none">{wallet.moneyPoints.toLocaleString('es-AR')}</span>
          <span className="mb-1 text-sm font-semibold text-white/80">puntos</span>
        </div>
        <div className="mt-5 flex gap-2.5">
          <button onClick={() => { setMsg(''); setModal('transfer'); }} className="flex-1 rounded-2xl bg-white/20 py-3 text-sm font-bold backdrop-blur transition active:scale-95">
            Transferir
          </button>
          <button onClick={() => { setMsg(''); setModal('withdraw'); }} className="flex-1 rounded-2xl bg-white py-3 text-sm font-bold text-blue-600 transition active:scale-95">
            Retirar
          </button>
        </div>
      </div>

      {/* Reputación / rango */}
      <div className={card}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400">Reputación</p>
            <p className="text-lg font-extrabold text-slate-800">{rank.current.label}</p>
          </div>
          <div className="rounded-full bg-indigo-50 px-3 py-1.5 text-sm font-extrabold text-indigo-500">{wallet.xpPoints} XP</div>
        </div>
        {rank.next && (
          <>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-gradient-to-r from-blue-400 to-indigo-500" style={{ width: `${Math.round(rank.progress * 100)}%` }} />
            </div>
            <p className="mt-1.5 text-xs text-slate-400">Faltan {rank.next.min - wallet.xpPoints} XP para {rank.next.label} 🚀</p>
          </>
        )}
      </div>

      {/* Racha + insignias */}
      {game && (
        <div className={card}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🔥</span>
              <div>
                <p className="text-xs font-medium text-slate-400">Racha</p>
                <p className="text-lg font-extrabold text-slate-800">{game.streak.currentStreak} {game.streak.currentStreak === 1 ? 'día' : 'días'}</p>
              </div>
            </div>
            <p className="text-xs text-slate-400">Récord: {game.streak.longestStreak}</p>
          </div>
          <div className="mt-4 grid grid-cols-6 gap-2">
            {game.badges.map((b) => (
              <div
                key={b.code}
                title={`${b.name}: ${b.description || ''}`}
                className={`flex aspect-square items-center justify-center rounded-2xl text-xl ${b.earned ? 'bg-amber-100' : 'bg-slate-100 opacity-40 grayscale'}`}
              >
                {b.icon}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Movimientos */}
      <div>
        <h2 className="mb-2 px-1 text-sm font-bold text-slate-500">Movimientos</h2>
        {history.length === 0 ? (
          <div className={card + ' text-center text-sm text-slate-400'}>Todavía no hay movimientos.</div>
        ) : (
          <div className="space-y-2">
            {history.map((h) => (
              <div key={h.id} className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 shadow-[0_6px_20px_rgba(31,42,68,0.06)]">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-50 text-lg">{reasonIcon[h.reason] || '•'}</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-800">{reasonLabel[h.reason] || h.reason}</p>
                  <p className="text-[11px] text-slate-400">{new Date(h.createdAt).toLocaleString('es-AR')}</p>
                </div>
                <span className={`text-sm font-extrabold ${h.amount >= 0 ? 'text-emerald-500' : 'text-rose-400'}`}>
                  {h.amount >= 0 ? '+' : ''}
                  {h.amount} {h.currency === 'XP' ? 'XP' : 'pts'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal === 'transfer' && (
        <TransferModal
          members={members}
          onClose={() => setModal(null)}
          error={msg}
          onDone={async (toUserId, points, note) => {
            try {
              await familyApi.transfer(user!.id, toUserId, points, note);
              setModal(null);
              await load();
            } catch (e) {
              setMsg(e instanceof ApiError && e.body?.error === 'INSUFFICIENT_FUNDS' ? 'No te alcanzan los puntos.' : 'No se pudo transferir.');
            }
          }}
        />
      )}

      {modal === 'withdraw' && (
        <WithdrawModal
          config={config}
          max={wallet.moneyPoints}
          onClose={() => setModal(null)}
          error={msg}
          onDone={async (points) => {
            try {
              const w = await familyApi.requestWithdrawal(user!.id, points);
              setModal(null);
              setMsg('');
              await load();
              alert(`Retiro solicitado: ${points} pts ≈ ${w.moneyAmount} ${w.currency}. Queda pendiente de aprobación.`);
            } catch (e) {
              if (e instanceof ApiError && e.status === 423) setMsg('Tenés responsabilidades pendientes. Completalas para poder retirar.');
              else if (e instanceof ApiError && e.body?.error === 'INSUFFICIENT_FUNDS') setMsg('No te alcanzan los puntos.');
              else setMsg('No se pudo solicitar el retiro.');
            }
          }}
        />
      )}
    </div>
  );
}

function Sheet({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-lg rounded-t-[32px] bg-white p-5 safe-bottom" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-200" />
        <h3 className="mb-4 text-lg font-extrabold text-slate-800">{title}</h3>
        {children}
      </div>
    </div>
  );
}

const field = 'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-slate-800 outline-none focus:border-blue-400';
const primaryBtn = 'w-full rounded-2xl bg-blue-500 py-3.5 text-sm font-bold text-white transition active:scale-95 disabled:opacity-40';

function TransferModal({ members, onClose, onDone, error }: { members: FamilyMember[]; onClose: () => void; onDone: (toUserId: string, points: number, note?: string) => void; error: string; }) {
  const [to, setTo] = useState(members[0]?.id || '');
  const [points, setPoints] = useState('');
  const [note, setNote] = useState('');
  return (
    <Sheet title="Transferir puntos" onClose={onClose}>
      <div className="space-y-3">
        <select value={to} onChange={(e) => setTo(e.target.value)} className={field}>
          {members.map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}
        </select>
        <input type="number" inputMode="numeric" value={points} onChange={(e) => setPoints(e.target.value)} placeholder="Cantidad de puntos" className={field} />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota (opcional)" className={field} />
        {error && <p className="text-sm text-rose-500">{error}</p>}
        <button className={primaryBtn} disabled={!to || Number(points) <= 0} onClick={() => onDone(to, Math.floor(Number(points)), note.trim() || undefined)}>Enviar</button>
      </div>
    </Sheet>
  );
}

function WithdrawModal({ config, max, onClose, onDone, error }: { config: FamilyConfig | null; max: number; onClose: () => void; onDone: (points: number) => void; error: string; }) {
  const [points, setPoints] = useState('');
  const ppu = config?.pointsPerUnit || 100;
  const money = Number(points) > 0 ? (Number(points) / ppu).toFixed(2) : '0.00';
  return (
    <Sheet title="Retirar puntos" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-slate-400">Disponible: {max.toLocaleString('es-AR')} pts · {ppu} pts = 1 {config?.currency}</p>
        <input type="number" inputMode="numeric" value={points} onChange={(e) => setPoints(e.target.value)} placeholder="Puntos a retirar" className={field} />
        <p className="text-sm text-slate-600">≈ <span className="font-extrabold text-blue-600">{money} {config?.currency}</span></p>
        {error && <p className="text-sm text-rose-500">{error}</p>}
        <button className="w-full rounded-2xl bg-amber-400 py-3.5 text-sm font-bold text-slate-900 transition active:scale-95 disabled:opacity-40" disabled={Number(points) <= 0 || Number(points) > max} onClick={() => onDone(Math.floor(Number(points)))}>
          Solicitar retiro
        </button>
      </div>
    </Sheet>
  );
}
