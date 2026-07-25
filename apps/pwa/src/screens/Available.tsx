import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../auth';
import { familyApi, type Task } from '../family';
import { Card, Button, Spinner, Points, EmptyState } from '../ui';
import TaskDetailModal from '../components/TaskDetailModal';

function Countdown({ until }: { until: string | null }) {
  if (!until) return null;
  const ms = new Date(until).getTime() - Date.now();
  if (ms <= 0) return <span className="text-rose-500">vencida</span>;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return (
    <span className="text-amber-500">
      ⏳ {h > 24 ? `${Math.floor(h / 24)}d ` : ''}
      {h % 24}h {m}m
    </span>
  );
}

export default function Available() {
  const { user } = useAuth();
  const [available, setAvailable] = useState<Task[]>([]);
  const [mine, setMine] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const [avail, all] = await Promise.all([
      familyApi.tasks({ companyId: user.companyId, taskKind: 'Paid', lifecycle: 'en_espera' }),
      familyApi.tasks({ companyId: user.companyId, taskKind: 'Paid' })
    ]);
    setAvailable(avail);
    setMine(all.filter((t) => t.takenById === user.id && (t.lifecycle === 'doing' || t.lifecycle === 'done')));
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
    } catch {
      /* noop */
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-slate-800">Actividades pagas</h1>

      {mine.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-500">En curso</h2>
          <div className="space-y-2">
            {mine.map((t) => (
              <Card key={t.id}>
                <div className="flex items-start justify-between gap-3">
                  <button type="button" className="flex-1 text-left" onClick={() => setDetailId(t.id)}>
                    <p className="font-semibold text-slate-800">{t.title}</p>
                    <p className="text-xs text-slate-400">
                      <Points value={t.rewardPoints} /> {t.rewardXp > 0 && <>· <Points value={t.rewardXp} kind="xp" /></>}
                    </p>
                    {t.rejectedReason && <p className="mt-1 text-xs text-rose-500">Rechazada: {t.rejectedReason}</p>}
                    <p className="mt-1 text-[11px] text-blue-500">Ver subtareas →</p>
                  </button>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                    {t.lifecycle === 'done' ? 'esperando validación' : 'haciendo'}
                  </span>
                </div>
                {t.lifecycle === 'doing' && (
                  <div className="mt-3 flex gap-2">
                    <Button variant="ghost" className="flex-1" disabled={busy === t.id} onClick={() => act(() => familyApi.cancelTask(t.id, user!.id), t.id)}>
                      Cancelar
                    </Button>
                    <Button className="flex-1" disabled={busy === t.id} onClick={() => act(() => familyApi.submitTask(t.id, user!.id), t.id)}>
                      Marcar hecha
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-500">Disponibles para tomar</h2>
        {available.length === 0 ? (
          <EmptyState text="No hay actividades disponibles ahora." />
        ) : (
          <div className="space-y-2">
            {available.map((t) => (
              <Card key={t.id}>
                <div className="flex items-start justify-between gap-3">
                  <button type="button" className="flex-1 text-left" onClick={() => setDetailId(t.id)}>
                    <p className="font-semibold text-slate-800">{t.title}</p>
                    {t.description && <p className="mt-0.5 text-xs text-slate-400">{t.description}</p>}
                    <p className="mt-1 text-xs">
                      <Points value={t.rewardPoints} /> {t.rewardXp > 0 && <>· <Points value={t.rewardXp} kind="xp" /></>} · <Countdown until={t.availableUntil} />
                    </p>
                    <p className="mt-1 text-[11px] text-blue-500">Ver detalle y subtareas →</p>
                  </button>
                  <Button variant="accent" disabled={busy === t.id} onClick={() => act(() => familyApi.takeTask(t.id, user!.id), t.id)}>
                    Tomar
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

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
