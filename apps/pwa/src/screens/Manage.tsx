import { useEffect, useState, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell } from 'recharts';
import { useAuth } from '../auth';
import { familyApi, familyRecurrences, humanizeRrule, type Task, type Withdrawal, type FamilyMember, type FamilyMemberFull, type FamilyGoal, type FamilyConfig, type Recurrence, type FamilyStats } from '../family';
import { ApiError } from '../api';
import { Card, Button, Spinner, Points, EmptyState } from '../ui';
import ValidateModal from '../components/ValidateModal';
import Avatar from '../components/Avatar';

type Tab = 'dashboard' | 'approvals' | 'create' | 'points' | 'family' | 'users';
const TABS: { key: Tab; label: string }[] = [
  { key: 'dashboard', label: 'Panel' },
  { key: 'approvals', label: 'Aprobaciones' },
  { key: 'create', label: 'Crear' },
  { key: 'points', label: 'Puntos' },
  { key: 'family', label: 'Familia' },
  { key: 'users', label: 'Usuarios' }
];

export default function Manage() {
  const [tab, setTab] = useState<Tab>('dashboard');
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-800">Gestión familiar</h1>
      <div className="flex gap-1 overflow-x-auto rounded-2xl bg-white p-1 shadow-[0_6px_24px_rgba(31,42,68,0.07)]">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition ${tab === t.key ? 'bg-blue-500 text-white' : 'text-slate-400'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'dashboard' && <Dashboard />}
      {tab === 'approvals' && <Approvals />}
      {tab === 'create' && <CreateTask />}
      {tab === 'points' && <MintPoints />}
      {tab === 'family' && <FamilySettings />}
      {tab === 'users' && <UsersAdmin />}
    </div>
  );
}

// ── Panel: indicadores clave para el administrador ─────────────────────────────
function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<FamilyStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    familyApi.stats(user.companyId).then(setStats).finally(() => setLoading(false));
  }, [user]);

  if (loading || !stats) return <Spinner />;

  const tile = (label: string, value: string | number, accent = 'text-slate-800') => (
    <Card className="!p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-xl font-extrabold ${accent}`}>{value}</p>
    </Card>
  );

  const earnersData = stats.topEarners.map((e) => ({ name: e.userName.split(' ')[0], total: e.money + e.xp }));
  const tasksData = stats.mostTasksTaken.map((t) => ({ name: t.userName.split(' ')[0], count: t.count }));
  const COLORS = ['#818cf8', '#facc15', '#34d399', '#f472b6', '#60a5fa'];

  return (
    <div className="space-y-5">
      {(stats.pendingApprovals.tasks > 0 || stats.pendingApprovals.withdrawals > 0) && (
        <Card className="border-amber-300 bg-amber-50">
          <p className="text-sm font-semibold text-amber-700">
            ⚠️ Tenés {stats.pendingApprovals.tasks} tarea{stats.pendingApprovals.tasks === 1 ? '' : 's'} y {stats.pendingApprovals.withdrawals} retiro
            {stats.pendingApprovals.withdrawals === 1 ? '' : 's'} esperando aprobación.
          </p>
        </Card>
      )}

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-500">Puntos otorgados este mes</h2>
        <div className="grid grid-cols-2 gap-2">
          {tile('Puntos $', stats.pointsGiven.month.money, 'text-amber-500')}
          {tile('XP', stats.pointsGiven.month.xp, 'text-indigo-500')}
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-500">Puntos otorgados este año</h2>
        <div className="grid grid-cols-2 gap-2">
          {tile('Puntos $', stats.pointsGiven.year.money, 'text-amber-500')}
          {tile('XP', stats.pointsGiven.year.xp, 'text-indigo-500')}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {tile('Tareas completadas', `${stats.finalizedTasks}/${stats.totalTasks}`)}
        {tile('Tareas vencidas', stats.overdueTasks, stats.overdueTasks > 0 ? 'text-rose-500' : 'text-slate-800')}
      </div>

      {stats.topEarners.length > 0 && (
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-slate-500">🏆 Quién lleva más puntos</h2>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={earnersData} layout="vertical" margin={{ left: 4, right: 12 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={70} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <Bar dataKey="total" radius={[0, 8, 8, 0]}>
                  {earnersData.map((_, i) => (<Cell key={i} fill={COLORS[i % COLORS.length]} />))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {stats.mostTasksTaken.length > 0 && (
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-slate-500">✅ Quién completó más tareas</h2>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tasksData} layout="vertical" margin={{ left: 4, right: 12 }}>
                <XAxis type="number" hide allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={70} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <Bar dataKey="count" radius={[0, 8, 8, 0]}>
                  {tasksData.map((_, i) => (<Cell key={i} fill={COLORS[i % COLORS.length]} />))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-slate-500">Estado de las tareas</h2>
        <div className="space-y-1.5">
          {([
            ['creada', 'Sin publicar'],
            ['en_espera', 'Disponibles'],
            ['doing', 'En curso'],
            ['done', 'Por validar'],
            ['finalizada', 'Completadas']
          ] as const).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between text-sm">
              <span className="text-slate-600">{label}</span>
              <span className="font-semibold text-slate-800">{stats.tasksByLifecycle[key] || 0}</span>
            </div>
          ))}
        </div>
      </Card>

      {stats.goals.length > 0 && (
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-slate-500">🎯 Metas activas</h2>
          <div className="space-y-3">
            {stats.goals.map((g) => {
              const pct = g.targetXp > 0 ? Math.min(100, Math.round((g.currentXp / g.targetXp) * 100)) : 0;
              return (
                <div key={g.id}>
                  <div className="mb-1 flex justify-between text-xs text-slate-600">
                    <span>{g.title}</span>
                    <span className="font-semibold text-blue-500">{pct}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-amber-300" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
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
  const [activeTasks, setActiveTasks] = useState<Task[]>([]);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
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

  const loadActiveTasks = useCallback(async () => {
    if (!user) return;
    const all = await familyApi.tasks({ companyId: user.companyId });
    setActiveTasks(all.filter((t) => t.lifecycle !== 'finalizada'));
  }, [user]);

  useEffect(() => {
    if (user) familyApi.goals(user.companyId).then(setGoals).catch(() => {});
    loadActiveTasks();
  }, [user, loadActiveTasks]);

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
      await loadActiveTasks();
    } catch {
      setMsg('No se pudo crear la tarea.');
    } finally {
      setBusy(false);
    }
  };

  const input = 'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-800 text-sm outline-none focus:border-blue-400';

  return (
    <>
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

      {activeTasks.length > 0 && (
        <Card className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-500">Tareas activas</h2>
          {activeTasks.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate text-slate-700">{t.title}</p>
                <p className="text-xs text-slate-400">
                  {t.taskKind === 'Paid' ? `${t.rewardPoints} pts` : `${t.rewardXp} XP`} · {t.ownerName || 'sin asignar'}
                </p>
              </div>
              <button onClick={() => setEditingTask(t)} className="shrink-0 text-xs font-semibold text-blue-500">Editar</button>
            </div>
          ))}
        </Card>
      )}

      {editingTask && (
        <EditTaskModal
          task={editingTask}
          goals={goals}
          onClose={() => setEditingTask(null)}
          onDone={async () => { setEditingTask(null); await loadActiveTasks(); }}
        />
      )}
    </>
  );
}

function EditTaskModal({ task, goals, onClose, onDone }: { task: Task; goals: FamilyGoal[]; onClose: () => void; onDone: () => void }) {
  const members = useMembers();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || '');
  const [rewardPoints, setRewardPoints] = useState(String(task.rewardPoints));
  const [rewardXp, setRewardXp] = useState(String(task.rewardXp));
  const [ownerId, setOwnerId] = useState(task.ownerId);
  const [dueDate, setDueDate] = useState(task.dueDate ? task.dueDate.slice(0, 16) : '');
  const [goalId, setGoalId] = useState(task.familyGoalId || '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const isPaid = task.taskKind === 'Paid';
  const input = 'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-800 text-sm outline-none focus:border-blue-400';

  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true);
    setMsg('');
    try {
      await familyApi.updateTask(task.id, {
        title: title.trim(),
        description: description.trim() || undefined,
        ownerId: ownerId || task.ownerId,
        rewardPoints: isPaid ? Math.max(0, Math.floor(Number(rewardPoints) || 0)) : 0,
        rewardXp: Math.max(0, Math.floor(Number(rewardXp) || 0)),
        familyGoalId: goalId || null,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null
      });
      onDone();
    } catch {
      setMsg('No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-lg rounded-t-[32px] bg-white p-5 safe-bottom" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-200" />
        <h2 className="mb-4 text-lg font-extrabold text-slate-800">Editar tarea</h2>
        <div className="space-y-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título" className={input} />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción (opcional)" className={input} rows={2} />
          {isPaid && (
            <label className="block text-xs text-slate-400">
              Puntos $ (recompensa)
              <input type="number" inputMode="numeric" value={rewardPoints} onChange={(e) => setRewardPoints(e.target.value)} className={input + ' mt-1'} />
            </label>
          )}
          <label className="block text-xs text-slate-400">
            Reputación XP
            <input type="number" inputMode="numeric" value={rewardXp} onChange={(e) => setRewardXp(e.target.value)} className={input + ' mt-1'} />
          </label>
          <label className="block text-xs text-slate-400">
            Asignar a
            <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className={input + ' mt-1'}>
              {members.map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}
            </select>
          </label>
          <label className="block text-xs text-slate-400">
            Vence (opcional)
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
          {msg && <p className="text-sm text-rose-500">{msg}</p>}
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" disabled={busy} onClick={onClose}>Cancelar</Button>
            <Button className="flex-1" disabled={busy || !title.trim()} onClick={submit}>{busy ? 'Guardando…' : 'Guardar'}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Cargar / descontar puntos ─────────────────────────────────────────────────
function MintPoints() {
  const { user } = useAuth();
  const members = useMembers();
  const [mode, setMode] = useState<'add' | 'deduct'>('add');
  const [target, setTarget] = useState('');
  const [currency, setCurrency] = useState<'MONEY' | 'XP'>('MONEY');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const input = 'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-800 text-sm outline-none focus:border-blue-400';
  const unit = currency === 'XP' ? 'XP' : 'pts';
  const canSubmit = target && Number(amount) > 0 && (mode === 'add' || reason.trim());

  const submit = async () => {
    if (!user || !canSubmit) return;
    setBusy(true);
    setMsg('');
    try {
      if (mode === 'add') {
        await familyApi.mint(user.id, target, currency, Math.floor(Number(amount)), reason.trim() || undefined);
        setMsg('✅ Puntos cargados.');
      } else {
        const r = await familyApi.penalty(user.id, target, currency, Math.floor(Number(amount)), reason.trim());
        setMsg(`✅ Descontados ${r.deducted} ${unit}${r.deducted < r.requested ? ' (no se pudo bajar de 0)' : ''}.`);
      }
      setAmount('');
      setReason('');
    } catch {
      setMsg('No se pudo aplicar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-3">
      <div className="flex gap-2">
        <button onClick={() => setMode('add')} className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${mode === 'add' ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-500'}`}>➕ Cargar</button>
        <button onClick={() => setMode('deduct')} className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${mode === 'deduct' ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-500'}`}>➖ Descontar</button>
      </div>
      <p className="text-xs text-slate-400">
        {mode === 'add' ? 'Cargá puntos a un miembro (emisión).' : 'Descontá puntos por una situación familiar. No baja de 0.'}
      </p>
      <select value={target} onChange={(e) => setTarget(e.target.value)} className={input}>
        <option value="">— Elegir miembro —</option>
        {members.map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}
      </select>
      <div className="flex gap-2">
        <button onClick={() => setCurrency('MONEY')} className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${currency === 'MONEY' ? 'bg-amber-400 text-slate-900' : 'bg-slate-100 text-slate-500'}`}>Puntos $</button>
        <button onClick={() => setCurrency('XP')} className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${currency === 'XP' ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-500'}`}>Reputación XP</button>
      </div>
      <input type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Cantidad" className={input} />
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={mode === 'deduct' ? 'Motivo (ej: dejó la ropa tirada)' : 'Nota (opcional)'} className={input} />
      {msg && <p className="text-sm text-slate-500">{msg}</p>}
      <Button variant={mode === 'add' ? 'accent' : 'danger'} className="w-full" disabled={busy || !canSubmit} onClick={submit}>
        {mode === 'add' ? 'Cargar puntos' : 'Descontar puntos'}
      </Button>
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
  const [editingGoal, setEditingGoal] = useState<FamilyGoal | null>(null);
  const [recs, setRecs] = useState<Recurrence[]>([]);
  const members = useMembers();
  const [creditLimit, setCreditLimit] = useState('');
  const [creditTarget, setCreditTarget] = useState('');
  const [creditMsg, setCreditMsg] = useState('');

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

  const saveCreditLimit = async () => {
    if (!user || creditLimit === '') return;
    setCreditMsg('');
    try {
      await familyApi.setCreditLimit(user.id, user.companyId, Math.max(0, Math.floor(Number(creditLimit) || 0)), creditTarget || undefined);
      setCreditMsg(`✅ Límite de ${Math.floor(Number(creditLimit) || 0)} pts ${creditTarget ? 'actualizado' : 'aplicado a todos'}.`);
    } catch {
      setCreditMsg('No se pudo guardar.');
    }
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
            <div className="flex shrink-0 gap-3">
              <button onClick={() => setEditingGoal(g)} className="text-xs font-semibold text-blue-500">Editar</button>
              <button onClick={async () => { await familyApi.deleteGoal(g.id); await load(); }} className="text-xs text-rose-500">Borrar</button>
            </div>
          </div>
        ))}
        <input value={goalTitle} onChange={(e) => setGoalTitle(e.target.value)} placeholder="Nueva meta (ej: Vacaciones)" className={input} />
        <input type="number" inputMode="numeric" value={goalTarget} onChange={(e) => setGoalTarget(e.target.value)} placeholder="XP objetivo" className={input} />
        <Button variant="ghost" className="w-full" disabled={!goalTitle.trim()} onClick={addGoal}>Agregar meta</Button>
      </Card>

      {editingGoal && (
        <EditGoalModal
          goal={editingGoal}
          onClose={() => setEditingGoal(null)}
          onDone={async () => { setEditingGoal(null); await load(); }}
        />
      )}

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

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-500">Crédito / adelantos 💳</h2>
        <p className="text-xs text-slate-400">Máximo de puntos que un miembro puede pedir por adelantado. Se salda solo con los puntos que gana en sus tareas.</p>
        <select value={creditTarget} onChange={(e) => setCreditTarget(e.target.value)} className={input}>
          <option value="">Todos los miembros</option>
          {members.map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}
        </select>
        <input type="number" inputMode="numeric" value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} placeholder="Límite de crédito (ej: 200) — 0 = sin crédito" className={input} />
        {creditMsg && <p className="text-sm text-slate-500">{creditMsg}</p>}
        <Button className="w-full" disabled={creditLimit === ''} onClick={saveCreditLimit}>Establecer límite</Button>
      </Card>
    </div>
  );
}

function EditGoalModal({ goal, onClose, onDone }: { goal: FamilyGoal; onClose: () => void; onDone: () => void }) {
  const [title, setTitle] = useState(goal.title);
  const [description, setDescription] = useState(goal.description || '');
  const [targetXp, setTargetXp] = useState(String(goal.targetXp));
  const [status, setStatus] = useState(goal.status);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const input = 'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-800 text-sm outline-none focus:border-blue-400';

  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true);
    setMsg('');
    try {
      await familyApi.updateGoal(goal.id, { title: title.trim(), description: description.trim() || undefined, targetXp: Math.max(0, Math.floor(Number(targetXp) || 0)), status });
      onDone();
    } catch {
      setMsg('No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-lg rounded-t-[32px] bg-white p-5 safe-bottom" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-200" />
        <h2 className="mb-4 text-lg font-extrabold text-slate-800">Editar meta</h2>
        <div className="space-y-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título" className={input} />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción (opcional)" className={input} rows={2} />
          <label className="block text-xs text-slate-400">
            XP objetivo
            <input type="number" inputMode="numeric" value={targetXp} onChange={(e) => setTargetXp(e.target.value)} className={input + ' mt-1'} />
          </label>
          <label className="block text-xs text-slate-400">
            Estado
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={input + ' mt-1'}>
              <option value="Active">Activa</option>
              <option value="Completed">Completada</option>
              <option value="Archived">Archivada</option>
            </select>
          </label>
          {msg && <p className="text-sm text-rose-500">{msg}</p>}
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" disabled={busy} onClick={onClose}>Cancelar</Button>
            <Button className="flex-1" disabled={busy || !title.trim()} onClick={submit}>{busy ? 'Guardando…' : 'Guardar'}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── ABM de usuarios (miembros de la familia) ──────────────────────────────────
function UsersAdmin() {
  const { user } = useAuth();
  const [members, setMembers] = useState<FamilyMemberFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [editing, setEditing] = useState<FamilyMemberFull | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const list = await familyApi.listMembersFull(user.companyId);
    setMembers(list);
    setLoading(false);
  }, [user]);
  useEffect(() => { load(); }, [load]);

  const toggleActive = async (m: FamilyMemberFull) => {
    if (!user) return;
    setBusyId(m.id);
    try {
      await familyApi.updateMember(m.id, { adminUserId: user.id, active: !m.active });
      await load();
    } catch (e) {
      alert(e instanceof ApiError && e.body?.error === 'FAMILY_NEEDS_PARENT' ? 'Debe quedar al menos un padre/madre activo en la familia.' : 'No se pudo cambiar el estado.');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold text-slate-500">Miembros de la familia</h2>
        <div className="flex gap-3">
          <button onClick={() => setShowInvite(true)} className="text-xs font-bold text-blue-500">🔗 Compartir</button>
          <button onClick={() => setShowCreate(true)} className="text-xs font-bold text-blue-500">+ Nuevo miembro</button>
        </div>
      </div>

      <div className="space-y-2">
        {members.map((m) => (
          <Card key={m.id} className={m.active ? '' : 'opacity-50'}>
            <div className="flex items-center gap-3">
              <Avatar name={m.name} email={m.email} avatar={m.avatar} size={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800">{m.name}</p>
                <p className="truncate text-xs text-slate-500">{m.email}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-bold ${m.isParent ? 'bg-indigo-100 text-indigo-600' : 'bg-amber-100 text-amber-600'}`}>
                {m.isParent ? 'Padre/Madre' : 'Hijo/a'}
              </span>
            </div>
            {!m.active && <p className="mt-1 text-[11px] font-semibold text-rose-500">De baja — no puede iniciar sesión</p>}
            <div className="mt-3 flex gap-2">
              <button onClick={() => setEditing(m)} className="flex-1 rounded-xl bg-slate-100 py-2 text-xs font-semibold text-slate-600">Editar</button>
              {m.id !== user?.id && (
                <button
                  disabled={busyId === m.id}
                  onClick={() => toggleActive(m)}
                  className={`flex-1 rounded-xl py-2 text-xs font-semibold disabled:opacity-50 ${m.active ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}
                >
                  {m.active ? 'Dar de baja' : 'Reactivar'}
                </button>
              )}
            </div>
          </Card>
        ))}
      </div>

      {showCreate && <CreateMemberModal onClose={() => setShowCreate(false)} onDone={async () => { setShowCreate(false); await load(); }} />}
      {editing && <EditMemberModal member={editing} onClose={() => setEditing(null)} onDone={async () => { setEditing(null); await load(); }} />}
      {showInvite && <InviteShareModal onClose={() => setShowInvite(false)} />}
    </div>
  );
}

function CreateMemberModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isParent, setIsParent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const input = 'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-800 text-sm outline-none focus:border-blue-400';

  const submit = async () => {
    if (!user || !name.trim() || !email.trim() || password.length < 6) return;
    setBusy(true);
    setMsg('');
    try {
      await familyApi.createMember({ adminUserId: user.id, companyId: user.companyId, name: name.trim(), email: email.trim(), password, isParent });
      onDone();
    } catch (e) {
      setMsg(e instanceof ApiError && e.body?.error === 'EMAIL_TAKEN' ? 'Ese email ya está en uso.' : 'No se pudo crear el miembro.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-lg rounded-t-[32px] bg-white p-5 safe-bottom" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-200" />
        <h2 className="mb-4 text-lg font-extrabold text-slate-800">Nuevo miembro</h2>
        <div className="space-y-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre completo" className={input} />
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className={input} />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Contraseña (mín. 6)" className={input} />
          <div className="flex gap-2">
            <button onClick={() => setIsParent(false)} className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${!isParent ? 'bg-amber-400 text-slate-900' : 'bg-slate-100 text-slate-500'}`}>Hijo/a</button>
            <button onClick={() => setIsParent(true)} className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${isParent ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-500'}`}>Padre/Madre</button>
          </div>
          {msg && <p className="text-sm text-rose-500">{msg}</p>}
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" disabled={busy} onClick={onClose}>Cancelar</Button>
            <Button className="flex-1" disabled={busy || !name.trim() || !email.trim() || password.length < 6} onClick={submit}>
              {busy ? 'Creando…' : 'Crear'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EditMemberModal({ member, onClose, onDone }: { member: FamilyMemberFull; onClose: () => void; onDone: () => void }) {
  const { user } = useAuth();
  const [name, setName] = useState(member.name);
  const [email, setEmail] = useState(member.email);
  const [isParent, setIsParent] = useState(member.isParent);
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const input = 'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-800 text-sm outline-none focus:border-blue-400';

  const submit = async () => {
    if (!user || !name.trim() || !email.trim()) return;
    if (newPassword && newPassword.length < 6) return setMsg('La nueva contraseña debe tener al menos 6 caracteres.');
    setBusy(true);
    setMsg('');
    try {
      await familyApi.updateMember(member.id, {
        adminUserId: user.id,
        name: name.trim(),
        email: email.trim(),
        isParent,
        newPassword: newPassword.trim() || undefined
      });
      onDone();
    } catch (e) {
      setMsg(
        e instanceof ApiError && e.body?.error === 'EMAIL_TAKEN'
          ? 'Ese email ya está en uso.'
          : e instanceof ApiError && e.body?.error === 'FAMILY_NEEDS_PARENT'
            ? 'Debe quedar al menos un padre/madre en la familia.'
            : 'No se pudo guardar.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-lg rounded-t-[32px] bg-white p-5 safe-bottom" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-200" />
        <h2 className="mb-4 text-lg font-extrabold text-slate-800">Editar miembro</h2>
        <div className="space-y-3">
          <input value={name} onChange={(e) => setName(e.target.value)} className={input} placeholder="Nombre" />
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} placeholder="Email" />
          <div className="flex gap-2">
            <button onClick={() => setIsParent(false)} className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${!isParent ? 'bg-amber-400 text-slate-900' : 'bg-slate-100 text-slate-500'}`}>Hijo/a</button>
            <button onClick={() => setIsParent(true)} className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${isParent ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-500'}`}>Padre/Madre</button>
          </div>
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={input} placeholder="Nueva contraseña (opcional)" />
          {msg && <p className="text-sm text-rose-500">{msg}</p>}
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" disabled={busy} onClick={onClose}>Cancelar</Button>
            <Button className="flex-1" disabled={busy || !name.trim() || !email.trim()} onClick={submit}>{busy ? 'Guardando…' : 'Guardar'}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Compartir invitación (link para sumar miembros por WhatsApp) ─────────────
function InviteShareModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const [isParent, setIsParent] = useState(false);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState('');

  const generate = async () => {
    if (!user) return;
    setBusy(true);
    setMsg('');
    setCopied(false);
    try {
      const { code } = await familyApi.createInvite(user.id, user.companyId, isParent);
      setLink(`${window.location.origin}/join?code=${code}`);
    } catch {
      setMsg('No se pudo generar el link.');
    } finally {
      setBusy(false);
    }
  };

  const shareText = `¡Sumate a nuestra familia en FamilyTool! 🏠 Entrá a este link para crear tu cuenta: ${link}`;

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Invitación a FamilyTool', text: shareText });
        return;
      } catch {
        /* el usuario canceló o no está soportado; sigue al fallback */
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank');
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setMsg('No se pudo copiar. Copialo manualmente.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-lg rounded-t-[32px] bg-white p-5 safe-bottom" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-200" />
        <h2 className="mb-1 text-lg font-extrabold text-slate-800">Compartir invitación</h2>
        <p className="mb-4 text-xs text-slate-500">
          Generá un link para que un familiar se registre solo y quede sumado a esta familia automáticamente. Ideal para mandar por WhatsApp.
        </p>

        {!link ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <button onClick={() => setIsParent(false)} className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${!isParent ? 'bg-amber-400 text-slate-900' : 'bg-slate-100 text-slate-500'}`}>
                Hijo/a
              </button>
              <button onClick={() => setIsParent(true)} className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${isParent ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                Padre/Madre
              </button>
            </div>
            <p className="text-[11px] text-slate-400">El link vence en 7 días y se puede usar varias veces mientras esté activo.</p>
            {msg && <p className="text-sm text-rose-500">{msg}</p>}
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" disabled={busy} onClick={onClose}>Cancelar</Button>
              <Button className="flex-1" disabled={busy} onClick={generate}>{busy ? 'Generando…' : 'Generar link'}</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600 break-all">{link}</div>
            <div className="flex gap-2">
              <button onClick={copy} className="flex-1 rounded-xl bg-slate-100 py-3 text-sm font-semibold text-slate-600">{copied ? '✓ Copiado' : 'Copiar link'}</button>
              <Button className="flex-1" onClick={share}>📲 Compartir</Button>
            </div>
            <button onClick={onClose} className="w-full py-2 text-center text-xs font-semibold text-slate-400">Cerrar</button>
          </div>
        )}
      </div>
    </div>
  );
}
