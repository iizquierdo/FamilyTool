import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../auth';
import { familyApi, type Task } from '../family';
import { Card, Button, Spinner, Points, EmptyState } from '../ui';
import TaskDetailModal from '../components/TaskDetailModal';

const stateLabel: Record<string, string> = {
  creada: 'Sin publicar',
  en_espera: 'Por hacer',
  doing: 'Haciendo',
  done: 'Esperando validación',
  aprobada: 'Aprobada',
  finalizada: 'Completada'
};

export default function Responsibilities() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const all = await familyApi.tasks({ companyId: user.companyId, taskKind: 'Responsibility', viewerId: user.id, mode: 'my' });
    setTasks(all);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (fn: () => Promise<unknown>, id: string) => {
    setBusy(id);
    try {
      await fn();
      await load();
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <Spinner />;

  const pending = tasks.filter((t) => t.lifecycle !== 'finalizada');
  const done = tasks.filter((t) => t.lifecycle === 'finalizada');

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Mis responsabilidades</h1>
          <p className="text-xs text-slate-400">Colaborar en casa suma reputación y acerca las metas familiares.</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="shrink-0 whitespace-nowrap text-xs font-bold text-blue-500">+ Nueva actividad</button>
      </div>

      {pending.length === 0 ? (
        <EmptyState text="¡Estás al día! No tenés responsabilidades pendientes." />
      ) : (
        <div className="space-y-2">
          {pending.map((t) => {
            const overdue = t.dueDate && new Date(t.dueDate) < new Date() && t.lifecycle !== 'finalizada';
            return (
              <Card key={t.id} className={overdue ? 'border-rose-300' : ''}>
                <div className="flex items-start justify-between gap-3">
                  <button type="button" className="flex-1 text-left" onClick={() => setDetailId(t.id)}>
                    <p className="font-semibold text-slate-800">{t.title}</p>
                    <p className="mt-0.5 text-xs">
                      {t.selfCreated && t.lifecycle !== 'finalizada' ? (
                        <span className="text-slate-400">Puntos a definir por el adulto</span>
                      ) : (
                        <Points value={t.rewardXp} kind="xp" />
                      )}
                      {t.dueDate && <span className={overdue ? 'text-rose-500' : 'text-slate-400'}> · vence {new Date(t.dueDate).toLocaleDateString('es-AR')}</span>}
                    </p>
                    {t.rejectedReason && <p className="mt-1 text-xs text-rose-500">Rechazada: {t.rejectedReason}</p>}
                    <p className="mt-1 text-[11px] text-blue-500">Ver subtareas →</p>
                  </button>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">{stateLabel[t.lifecycle]}</span>
                </div>
                <div className="mt-3 flex gap-2">
                  {t.lifecycle === 'en_espera' && (
                    <Button className="flex-1" disabled={busy === t.id} onClick={() => act(() => familyApi.takeTask(t.id, user!.id), t.id)}>
                      Empezar
                    </Button>
                  )}
                  {t.lifecycle === 'doing' && (
                    <Button className="flex-1" disabled={busy === t.id} onClick={() => act(() => familyApi.submitTask(t.id, user!.id), t.id)}>
                      Marcar hecha
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {done.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-500">Completadas</h2>
          <div className="space-y-2">
            {done.map((t) => (
              <Card key={t.id} className="flex items-center justify-between py-3 opacity-70">
                <p className="text-sm text-slate-500 line-through">{t.title}</p>
                <Points value={t.rewardXp} kind="xp" />
              </Card>
            ))}
          </div>
        </section>
      )}

      {detailId && (
        <TaskDetailModal
          taskId={detailId}
          userId={user!.id}
          onClose={() => setDetailId(null)}
          onChanged={load}
        />
      )}

      {showCreate && (
        <CreateOwnActivityModal
          onClose={() => setShowCreate(false)}
          onDone={async () => {
            setShowCreate(false);
            await load();
          }}
        />
      )}
    </div>
  );
}

// ── Crear actividad propia: el usuario la crea, se auto-asigna y sigue el mismo ─
// proceso de aprobación; el puntaje lo decide el adulto al validar (por defecto 0).
function CreateOwnActivityModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const input = 'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-800 text-sm outline-none focus:border-blue-400';

  const submit = async () => {
    if (!user || !title.trim()) return;
    setBusy(true);
    setMsg('');
    try {
      await familyApi.createOwnActivity({ userId: user.id, companyId: user.companyId, title: title.trim(), description: description.trim() || undefined });
      onDone();
    } catch {
      setMsg('No se pudo crear la actividad.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-lg rounded-t-[32px] bg-white p-5 safe-bottom" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-200" />
        <h2 className="mb-1 text-lg font-extrabold text-slate-800">Nueva actividad</h2>
        <p className="mb-4 text-xs text-slate-500">Se auto-asigna a vos. El adulto la valida y decide cuántos puntos vale (por defecto 0).</p>
        <div className="space-y-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="¿Qué vas a hacer?" className={input} />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción (opcional)" className={input} rows={2} />
          {msg && <p className="text-sm text-rose-500">{msg}</p>}
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" disabled={busy} onClick={onClose}>Cancelar</Button>
            <Button className="flex-1" disabled={busy || !title.trim()} onClick={submit}>{busy ? 'Creando…' : 'Crear'}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
