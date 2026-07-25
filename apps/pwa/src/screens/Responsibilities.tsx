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
      <div>
        <h1 className="text-xl font-bold text-slate-800">Mis responsabilidades</h1>
        <p className="text-xs text-slate-400">Colaborar en casa suma reputación y acerca las metas familiares.</p>
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
                      <Points value={t.rewardXp} kind="xp" />
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
    </div>
  );
}
