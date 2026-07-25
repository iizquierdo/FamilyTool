import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../auth';
import { familyApi, familyRecurrences, humanizeRrule, type Task, type Withdrawal, type FamilyMember, type FamilyGoal, type FamilyConfig, type Recurrence } from '../family';
import { Card, Button, Spinner, Points, EmptyState } from '../ui';
import ValidateModal from '../components/ValidateModal';

type Tab = 'approvals' | 'create' | 'points' | 'family';
const TABS: { key: Tab; label: string }[] = [
  { key: 'approvals', label: 'Aprobaciones' },
  { key: 'create', label: 'Crear' },
  { key: 'points', label: 'Puntos' },
  { key: 'family', label: 'Familia' }
];

export default function Manage() {
  const [tab, setTab] = useState<Tab>('approvals');
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-800">Gestión familiar</h1>
      <div className="flex gap-1 rounded-2xl bg-white p-1 shadow-[0_6px_24px_rgba(31,42,68,0.07)]">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-lg px-2 py-2 text-xs font-semibold transition ${tab === t.key ? 'bg-blue-500 text-white' : 'text-slate-400'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'approvals' && <Approvals />}
      {tab === 'create' && <CreateTask />}
      {tab === 'points' && <MintPoints />}
      {tab === 'family' && <FamilySettings />}
    </div>
  );
}

function useMembers() {
  const { user } = useAuth();
  const [members, setMembers] = useState<FamilyMember[]>([]);
  useEffect(() => {
    if (user) familyApi.members(user.companyId).then(setMembers).catch(() => {});
  }, [user]);
  return members;
}

// ── Aprobaciones: validar tareas + aprobar retiros ────────────────────────────
function Approvals() {
  const { user } = useAuth();
  const [pendingTasks, setPendingTasks] = useState<Task[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [validating, setValidating] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const [tasks, wds] = await Promise.all([
      familyApi.tasks({ companyId: user.companyId, lifecycle: 'done' }),
      familyApi.withdrawals({ companyId: user.companyId, status: 'pending' })
    ]);
    setPendingTasks(tasks);
    setWithdrawals(wds);
    setLoading(false);
  }, [user]);
  useEffect(() => { load(); }, [load]);

  const run = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    try { await fn(); await load(); } finally { setBusy(null); }
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-5">
      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-500">Tareas por validar</h2>
        {pendingTasks.length === 0 ? (
          <EmptyState text="Nada por validar." />
        ) : (
          <div className="space-y-2">
            {pendingTasks.map((t) => (
              <Card key={t.id}>
                <p className="font-semibold text-slate-800">{t.title}</p>
                <p className="text-xs text-slate-400">
                  {t.taskKind === 'Paid' ? <Points value={t.rewardPoints} /> : <Points value={t.rewardXp} kind="xp" />} · por {t.ownerName || 'miembro'}
                </p>
                <div className="mt-3 flex gap-2">
                  <Button variant="danger" className="flex-1" disabled={busy === t.id} onClick={() => run(t.id, () => familyApi.rejectTask(t.id, 'Revisar de nuevo'))}>
                    Rechazar
                  </Button>
                  <Button className="flex-1" disabled={busy === t.id} onClick={() => setValidating(t.id)}>
                    Revisar y validar
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {validating && (
        <ValidateModal
          taskId={validating}
          validatorId={user!.id}
          onClose={() => setValidating(null)}
          onDone={async () => {
            setValidating(null);
            await load();
          }}
        />
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-500">Retiros pendientes</h2>
        {withdrawals.length === 0 ? (
          <EmptyState text="No hay retiros pendientes." />
        ) : (
          <div className="space-y-2">
            {withdrawals.map((w) => (
              <Card key={w.id}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-800">{w.userName}</p>
                    <p className="text-xs text-slate-400">{w.points} pts ≈ <span className="text-amber-300">{w.moneyAmount} {w.currency}</span></p>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button variant="danger" className="flex-1" disabled={busy === w.id} onClick={() => run(w.id, () => familyApi.rejectWithdrawal(w.id, user!.id, 'Rechazado'))}>
                    Rechazar
                  </Button>
                  <Button variant="accent" className="flex-1" disabled={busy === w.id} onClick={() => run(w.id, () => familyApi.approveWithdrawal(w.id, user!.id))}>
                    Aprobar
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ── Crear tarea ───────────────────────────────────────────────────────────────
function CreateTask() {
  const { user } = useAuth();
  const members = useMembers();
  const [goals, setGoals] = useState<FamilyGoal[]>([]);
  const [kind, setKind] = useState<'Paid' | 'Responsibility'>('Responsibility');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [rewardPoints, setRewardPoints] = useState('');
  const [rewardXp, setRewardXp] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [availableUntil, setAvailableUntil] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [goalId, setGoalId] = useState('');
  const [subs, setSubs] = useState<{ title: string; points: string; description: string }[]>([]);
  const todayStr = new Date().toISOString().slice(0, 10);
  const [repeat, setRepeat] = useState<'none' | 'daily' | 'weekdays' | 'weekly' | 'biweekly' | 'monthly'>('none');
  const [weekDays, setWeekDays] = useState<string[]>([]);
  const [startDate, setStartDate] = useState(todayStr);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const buildRrule = () => {
    switch (repeat) {
      case 'daily': return 'FREQ=DAILY;INTERVAL=1';
      case 'weekdays': return 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
      case 'weekly': return weekDays.length ? `FREQ=WEEKLY;BYDAY=${weekDays.join(',')}` : 'FREQ=WEEKLY';
      case 'biweekly': return 'FREQ=WEEKLY;INTERVAL=2';
      case 'monthly': return 'FREQ=MONTHLY';
      default: return '';
    }
  };

  useEffect(() => {
    if (user) familyApi.goals(user.companyId).then(setGoals).catch(() => {});
  }, [user]);

  const submit = async () => {
    if (!user || !title.trim()) return;
    setBusy(true);
    setMsg('');
    try {
      const cleanSubs = subs
        .map((s) => ({ title: s.title.trim(), points: Math.max(0, Math.floor(Number(s.points) || 0)), description: s.description.trim() || undefined }))
        .filter((s) => s.title);
      const subSum = cleanSubs.reduce((a, s) => a + s.points, 0);
      // Con subtareas, la recompensa total = suma de sus puntos; sin subtareas, el valor del campo.
      const effPoints = kind === 'Paid' ? (cleanSubs.length ? subSum : Math.floor(Number(rewardPoints) || 0)) : 0;
      const effXp =
        kind === 'Responsibility'
          ? cleanSubs.length
            ? subSum
            : Math.floor(Number(rewardXp) || 0)
          : Math.floor(Number(rewardXp) || 0);

      // Si tiene repetición, se crea una recurrencia (que genera las instancias) en vez de una sola tarea.
      if (repeat !== 'none') {
        await familyRecurrences.create({
          companyId: user.companyId,
          createdById: user.id,
          ownerId: ownerId || undefined,
          title: title.trim(),
          description: description.trim() || undefined,
          taskKind: kind,
          rewardPoints: effPoints,
          rewardXp: effXp,
          familyGoalId: goalId || undefined,
          subtasks: cleanSubs.length ? cleanSubs : undefined,
          rrule: buildRrule(),
          startDate: startDate || todayStr
        });
        setMsg('✅ Tarea recurrente creada.');
        setTitle(''); setDescription(''); setRewardPoints(''); setRewardXp(''); setDueDate(''); setGoalId(''); setSubs([]); setRepeat('none'); setWeekDays([]);
        setBusy(false);
        return;
      }

      const task = await familyApi.createTask({
        title: title.trim(),
        description: description.trim() || undefined,
        companyId: user.companyId,
        createdById: user.id,
        ownerId: ownerId || user.id,
        taskKind: kind,
        rewardPoints: effPoints,
        rewardXp: effXp,
        subtasks: cleanSubs.length ? cleanSubs : undefined,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        familyGoalId: goalId || undefined
      });
      // Publicar: pasa a 'en_espera' (con countdown si se indicó).
      await familyApi.publishTask(task.id, availableUntil ? new Date(availableUntil).toISOString() : null);
      setMsg('✅ Tarea creada y publicada.');
      setTitle(''); setDescription(''); setRewardPoints(''); setRewardXp(''); setAvailableUntil(''); setDueDate(''); setGoalId(''); setSubs([]);
    } catch {
      setMsg('No se pudo crear la tarea.');
    } finally {
      setBusy(false);
    }
  };

  const input = 'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-800 text-sm outline-none focus:border-blue-400';

  return (
    <Card className="space-y-3">
      <div className="flex gap-2">
        <button onClick={() => setKind('Responsibility')} className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${kind === 'Responsibility' ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
          🏠 Responsabilidad
        </button>
        <button onClick={() => setKind('Paid')} className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${kind === 'Paid' ? 'bg-amber-400 text-slate-900' : 'bg-slate-100 text-slate-500'}`}>
          ⚡ Paga
        </button>
      </div>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título de la tarea" className={input} />
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción (opcional)" className={input} rows={2} />
      {kind === 'Paid' && (
        <label className="block text-xs text-slate-400">
          Puntos $ (recompensa)
          <input type="number" inputMode="numeric" value={rewardPoints} onChange={(e) => setRewardPoints(e.target.value)} placeholder="ej: 300" className={input + ' mt-1'} />
        </label>
      )}
      <label className="block text-xs text-slate-400">
        Reputación XP
        <input type="number" inputMode="numeric" value={rewardXp} onChange={(e) => setRewardXp(e.target.value)} placeholder="ej: 30" className={input + ' mt-1'} />
      </label>
      <label className="block text-xs text-slate-400">
        {kind === 'Paid' ? 'Asignar a (opcional, si no queda libre para tomar)' : 'Asignar a'}
        <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className={input + ' mt-1'}>
          <option value="">— Cualquiera —</option>
          {members.map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}
        </select>
      </label>
      <label className="block text-xs text-slate-400">
        Cuenta regresiva (opcional)
        <input type="datetime-local" value={availableUntil} onChange={(e) => setAvailableUntil(e.target.value)} className={input + ' mt-1'} />
      </label>
      <label className="block text-xs text-slate-400">
        Vence (para el candado pedagógico, opcional)
        <input type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={input + ' mt-1'} />
      </label>
      {goals.length > 0 && (
        <label className="block text-xs text-slate-400">
          Aporta a meta (opcional)
          <select value={goalId} onChange={(e) => setGoalId(e.target.value)} className={input + ' mt-1'}>
            <option value="">— Ninguna —</option>
            {goals.map((g) => (<option key={g.id} value={g.id}>{g.title}</option>))}
          </select>
        </label>
      )}
      <div>
        <label className="block text-xs text-slate-400">Repetición</label>
        <select value={repeat} onChange={(e) => setRepeat(e.target.value as typeof repeat)} className={input + ' mt-1'}>
          <option value="none">No se repite</option>
          <option value="daily">Todos los días</option>
          <option value="weekdays">Días de semana (Lun a Vie)</option>
          <option value="weekly">Semanal (elegir días)</option>
          <option value="biweekly">Cada 2 semanas</option>
          <option value="monthly">Una vez al mes</option>
        </select>
        {repeat === 'weekly' && (
          <div className="mt-2 flex gap-1">
            {([['MO', 'L'], ['TU', 'M'], ['WE', 'X'], ['TH', 'J'], ['FR', 'V'], ['SA', 'S'], ['SU', 'D']] as const).map(([code, lbl]) => (
              <button
                key={code}
                type="button"
                onClick={() => setWeekDays(weekDays.includes(code) ? weekDays.filter((d) => d !== code) : [...weekDays, code])}
                className={`h-9 w-9 rounded-full text-xs font-bold ${weekDays.includes(code) ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-500'}`}
              >
                {lbl}
              </button>
            ))}
          </div>
        )}
        {repeat !== 'none' && (
          <label className="mt-2 block text-xs text-slate-400">
            Empieza el
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={input + ' mt-1'} />
          </label>
        )}
        {repeat !== 'none' && <p className="mt-1 text-[11px] text-blue-500">Se crearán tareas automáticamente según la repetición.</p>}
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs text-slate-400">Subtareas (cada una con sus puntos)</span>
          <button type="button" onClick={() => setSubs([...subs, { title: '', points: '', description: '' }])} className="text-xs font-semibold text-blue-500">
            + Agregar
          </button>
        </div>
        {subs.map((s, i) => (
          <div key={i} className="mb-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
            <div className="flex gap-2">
              <input
                value={s.title}
                onChange={(e) => setSubs(subs.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                placeholder={`Subtarea ${i + 1}`}
                className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-400"
              />
              <input
                type="number"
                inputMode="numeric"
                value={s.points}
                onChange={(e) => setSubs(subs.map((x, j) => (j === i ? { ...x, points: e.target.value } : x)))}
                placeholder={kind === 'Paid' ? 'pts' : 'XP'}
                className="w-16 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-400"
              />
              <button type="button" onClick={() => setSubs(subs.filter((_, j) => j !== i))} className="px-1 text-rose-500">
                ✕
              </button>
            </div>
            <input
              value={s.description}
              onChange={(e) => setSubs(subs.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))}
              placeholder="Descripción (opcional) — qué hay que hacer"
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-400"
            />
          </div>
        ))}
        {subs.length > 0 && (
          <p className="text-[11px] text-slate-500">
            Total: {subs.reduce((a, s) => a + (Math.floor(Number(s.points) || 0)), 0)} {kind === 'Paid' ? 'pts' : 'XP'} · reemplaza la recompensa fija de arriba.
          </p>
        )}
      </div>

      {msg && <p className="text-sm text-slate-500">{msg}</p>}
      <Button className="w-full" disabled={busy || !title.trim()} onClick={submit}>
        {busy ? 'Creando…' : repeat !== 'none' ? 'Crear tarea recurrente' : 'Crear y publicar'}
      </Button>
    </Card>
  );
}

// ── Cargar puntos (mint) ──────────────────────────────────────────────────────
function MintPoints() {
  const { user } = useAuth();
  const members = useMembers();
  const [target, setTarget] = useState('');
  const [currency, setCurrency] = useState<'MONEY' | 'XP'>('MONEY');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const input = 'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-800 text-sm outline-none focus:border-blue-400';

  const submit = async () => {
    if (!user || !target || Number(amount) <= 0) return;
    setBusy(true);
    setMsg('');
    try {
      await familyApi.mint(user.id, target, currency, Math.floor(Number(amount)));
      setMsg('✅ Puntos cargados.');
      setAmount('');
    } catch {
      setMsg('No se pudo cargar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-3">
      <p className="text-xs text-slate-400">Cargá puntos a un miembro de la familia (emisión).</p>
      <select value={target} onChange={(e) => setTarget(e.target.value)} className={input}>
        <option value="">— Elegir miembro —</option>
        {members.map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}
      </select>
      <div className="flex gap-2">
        <button onClick={() => setCurrency('MONEY')} className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${currency === 'MONEY' ? 'bg-amber-400 text-slate-900' : 'bg-slate-100 text-slate-500'}`}>Puntos $</button>
        <button onClick={() => setCurrency('XP')} className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${currency === 'XP' ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-500'}`}>Reputación XP</button>
      </div>
      <input type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Cantidad" className={input} />
      {msg && <p className="text-sm text-slate-500">{msg}</p>}
      <Button variant="accent" className="w-full" disabled={busy || !target || Number(amount) <= 0} onClick={submit}>Cargar puntos</Button>
    </Card>
  );
}

// ── Config + metas ────────────────────────────────────────────────────────────
function FamilySettings() {
  const { user } = useAuth();
  const [config, setConfig] = useState<FamilyConfig | null>(null);
  const [goals, setGoals] = useState<FamilyGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [goalTitle, setGoalTitle] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [recs, setRecs] = useState<Recurrence[]>([]);

  const load = useCallback(async () => {
    if (!user) return;
    const [c, g, r] = await Promise.all([familyApi.config(user.companyId), familyApi.goals(user.companyId), familyRecurrences.list(user.companyId)]);
    setConfig(c);
    setGoals(g);
    setRecs(r);
    setLoading(false);
  }, [user]);
  useEffect(() => { load(); }, [load]);

  if (loading || !config) return <Spinner />;
  const input = 'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-800 text-sm outline-none focus:border-blue-400';

  const saveConfig = async () => {
    if (!user) return;
    setMsg('');
    try {
      await familyApi.updateConfig(user.companyId, user.id, {
        pointsPerUnit: config.pointsPerUnit,
        currency: config.currency,
        minWithdrawalPoints: config.minWithdrawalPoints,
        requireResponsibilitiesUpToDate: config.requireResponsibilitiesUpToDate
      });
      setMsg('✅ Configuración guardada.');
    } catch {
      setMsg('No se pudo guardar.');
    }
  };

  const addGoal = async () => {
    if (!user || !goalTitle.trim()) return;
    await familyApi.createGoal({ companyId: user.companyId, title: goalTitle.trim(), targetXp: Math.floor(Number(goalTarget) || 0), createdById: user.id });
    setGoalTitle(''); setGoalTarget('');
    await load();
  };

  return (
    <div className="space-y-5">
      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-500">Conversión y reglas</h2>
        <label className="block text-xs text-slate-400">
          Puntos por unidad de dinero (1 {config.currency})
          <input type="number" value={config.pointsPerUnit} onChange={(e) => setConfig({ ...config, pointsPerUnit: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} className={input + ' mt-1'} />
        </label>
        <label className="block text-xs text-slate-400">
          Moneda
          <input value={config.currency} onChange={(e) => setConfig({ ...config, currency: e.target.value })} className={input + ' mt-1'} />
        </label>
        <label className="block text-xs text-slate-400">
          Mínimo de puntos para retirar
          <input type="number" value={config.minWithdrawalPoints} onChange={(e) => setConfig({ ...config, minWithdrawalPoints: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} className={input + ' mt-1'} />
        </label>
        <label className="flex items-center justify-between text-sm text-slate-700">
          Candado pedagógico (responsabilidades al día para retirar)
          <input type="checkbox" checked={config.requireResponsibilitiesUpToDate} onChange={(e) => setConfig({ ...config, requireResponsibilitiesUpToDate: e.target.checked })} className="h-5 w-5 accent-blue-500" />
        </label>
        {msg && <p className="text-sm text-slate-500">{msg}</p>}
        <Button className="w-full" onClick={saveConfig}>Guardar</Button>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-500">Metas familiares</h2>
        {goals.map((g) => (
          <div key={g.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <span className="text-slate-700">{g.title} <span className="text-xs text-slate-500">({g.currentXp}/{g.targetXp} XP)</span></span>
            <button onClick={async () => { await familyApi.deleteGoal(g.id); await load(); }} className="text-xs text-rose-500">Borrar</button>
          </div>
        ))}
        <input value={goalTitle} onChange={(e) => setGoalTitle(e.target.value)} placeholder="Nueva meta (ej: Vacaciones)" className={input} />
        <input type="number" inputMode="numeric" value={goalTarget} onChange={(e) => setGoalTarget(e.target.value)} placeholder="XP objetivo" className={input} />
        <Button variant="ghost" className="w-full" disabled={!goalTitle.trim()} onClick={addGoal}>Agregar meta</Button>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-500">Tareas recurrentes 🔁</h2>
        {recs.length === 0 ? (
          <p className="text-xs text-slate-400">No hay tareas recurrentes. Creá una desde la pestaña "Crear" eligiendo una repetición.</p>
        ) : (
          recs.map((rc) => (
            <div key={rc.id} className={`rounded-xl border border-slate-200 p-3 ${rc.active ? '' : 'opacity-50'}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{rc.title}</p>
                  <p className="text-xs text-slate-500">
                    {humanizeRrule(rc.rrule, rc.startDate)}
                    {rc.ownerName ? ` · ${rc.ownerName}` : ''} · {rc.taskKind === 'Paid' ? `${rc.rewardPoints} pts` : `${rc.rewardXp} XP`}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button onClick={async () => { await familyRecurrences.toggle(rc.id); await load(); }} className="text-xs font-semibold text-blue-500">
                    {rc.active ? 'Pausar' : 'Activar'}
                  </button>
                  <button onClick={async () => { await familyRecurrences.remove(rc.id); await load(); }} className="text-xs text-rose-500">Borrar</button>
                </div>
              </div>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
