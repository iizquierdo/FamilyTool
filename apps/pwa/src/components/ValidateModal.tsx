import { useEffect, useState, useCallback } from 'react';
import { familyApi, type Task } from '../family';
import { Button, Spinner } from '../ui';

export default function ValidateModal({
  taskId,
  validatorId,
  onClose,
  onDone
}: {
  taskId: string;
  validatorId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [task, setTask] = useState<Task | null>(null);
  const [approved, setApproved] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const t = await familyApi.task(taskId);
    setTask(t);
    const init: Record<string, boolean> = {};
    (t.subtasks || []).forEach((s) => (init[s.id] = s.doneByChild));
    setApproved(init);
  }, [taskId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!task) {
    return (
      <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40" onClick={onClose}>
        <div className="w-full max-w-lg rounded-t-[32px] bg-white p-5" onClick={(e) => e.stopPropagation()}>
          <Spinner />
        </div>
      </div>
    );
  }

  const isPaid = task.taskKind === 'Paid';
  const unit = isPaid ? 'pts' : 'XP';
  const subs = task.subtasks || [];
  const hasSubs = subs.length > 0;
  const payout = hasSubs
    ? subs.filter((s) => approved[s.id]).reduce((sum, s) => sum + s.points, 0)
    : isPaid
      ? task.rewardPoints
      : task.rewardXp;

  const confirm = async () => {
    setBusy(true);
    try {
      const approvedIds = hasSubs ? subs.filter((s) => approved[s.id]).map((s) => s.id) : undefined;
      await familyApi.validateTask(task.id, validatorId, approvedIds);
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-[32px] bg-white p-5 safe-bottom" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-200" />
        <h2 className="text-lg font-extrabold text-slate-800">Revisar: {task.title}</h2>
        <p className="mt-1 text-xs text-slate-500">
          {hasSubs ? 'Aprobá solo las subtareas bien hechas. Las que no apruebes no se pagan.' : 'Confirmá para pagar la recompensa.'}
        </p>

        {hasSubs && (
          <div className="mt-4 space-y-2">
            {subs.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setApproved((prev) => ({ ...prev, [s.id]: !prev[s.id] }))}
                className={`flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition ${
                  approved[s.id] ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-slate-50'
                }`}
              >
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border text-xs ${
                    approved[s.id] ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 bg-white text-transparent'
                  }`}
                >
                  ✓
                </span>
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-800">{s.title}</p>
                    <span className={`shrink-0 text-xs font-extrabold ${isPaid ? 'text-amber-500' : 'text-indigo-500'}`}>+{s.points} {unit}</span>
                  </div>
                  {s.description && <p className="mt-0.5 text-xs text-slate-500">{s.description}</p>}
                  <p className="mt-1 text-[11px] text-slate-400">{s.doneByChild ? 'El chico la marcó hecha' : 'No marcada por el chico'}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between rounded-2xl bg-blue-50 px-4 py-3">
          <span className="text-sm font-medium text-slate-600">Va a pagar</span>
          <span className={`text-lg font-extrabold ${isPaid ? 'text-amber-500' : 'text-indigo-500'}`}>{payout} {unit}</span>
        </div>

        <div className="mt-4 flex gap-2">
          <Button variant="ghost" className="flex-1" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button className="flex-1" disabled={busy} onClick={confirm}>
            {busy ? 'Validando…' : 'Validar y pagar'}
          </Button>
        </div>
      </div>
    </div>
  );
}
