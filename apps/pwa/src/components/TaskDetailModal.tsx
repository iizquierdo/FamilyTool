import { useEffect, useState, useCallback } from 'react';
import { familyApi, type Task } from '../family';
import { Button, Spinner } from '../ui';
import TaskAttachments from './TaskAttachments';

const lifecycleLabel: Record<string, string> = {
  creada: 'Sin publicar',
  en_espera: 'Disponible',
  doing: 'En curso',
  done: 'Esperando validación',
  aprobada: 'Aprobada',
  finalizada: 'Completada'
};

export default function TaskDetailModal({
  taskId,
  userId,
  onClose,
  onChanged
}: {
  taskId: string;
  userId: string;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [task, setTask] = useState<Task | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => familyApi.task(taskId).then(setTask).catch(() => setTask(null)), [taskId]);
  useEffect(() => {
    load();
  }, [load]);

  const isMine = task?.takenById === userId;
  const canCheck = isMine && task?.lifecycle === 'doing';
  const isPaid = task?.taskKind === 'Paid';
  const unit = isPaid ? 'pts' : 'XP';
  const subs = task?.subtasks || [];
  const totalPoints = subs.reduce((s, x) => s + x.points, 0);
  const doneCount = subs.filter((s) => s.doneByChild).length;

  const act = async (fn: () => Promise<unknown>, close = false) => {
    setBusy(true);
    try {
      await fn();
      onChanged?.();
      if (close) onClose();
      else await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-[32px] bg-white p-5 safe-bottom" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-200" />
        {!task ? (
          <Spinner />
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${isPaid ? 'bg-amber-100 text-amber-600' : 'bg-indigo-100 text-indigo-600'}`}>
                  {isPaid ? '⚡ Actividad paga' : '🏠 Responsabilidad'}
                </span>
                <h2 className="mt-2 text-xl font-extrabold text-slate-800">{task.title}</h2>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-500">{lifecycleLabel[task.lifecycle]}</span>
            </div>

            {task.description && <p className="mt-3 text-sm text-slate-600">{task.description}</p>}

            <div className="mt-3 flex items-center gap-3 text-sm">
              <span className={isPaid ? 'font-extrabold text-amber-500' : 'font-extrabold text-indigo-500'}>
                {(isPaid ? task.rewardPoints : task.rewardXp) || totalPoints} {unit} en total
              </span>
              {task.rejectedReason && <span className="text-rose-500">· Rechazada: {task.rejectedReason}</span>}
            </div>

            {subs.length > 0 && (
              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-700">
                    Subtareas <span className="text-slate-400">({doneCount}/{subs.length})</span>
                  </h3>
                  <span className="text-[11px] text-slate-400">Cada una suma sus puntos si se hace bien</span>
                </div>
                <div className="space-y-2">
                  {subs.map((s) => {
                    const finalized = task.lifecycle === 'finalizada';
                    return (
                      <div
                        key={s.id}
                        className={`flex items-start gap-3 rounded-2xl border p-3 ${
                          finalized
                            ? s.approved
                              ? 'border-emerald-200 bg-emerald-50'
                              : 'border-rose-200 bg-rose-50'
                            : 'border-slate-200 bg-slate-50'
                        }`}
                      >
                        <button
                          disabled={!canCheck || busy}
                          onClick={() => act(() => familyApi.toggleSubtask(task.id, s.id, !s.doneByChild))}
                          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border text-xs ${
                            s.doneByChild ? 'border-blue-500 bg-blue-500 text-white' : 'border-slate-300 bg-white text-transparent'
                          } ${canCheck ? 'cursor-pointer' : 'cursor-default'}`}
                        >
                          ✓
                        </button>
                        <div className="flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className={`text-sm font-semibold ${s.doneByChild ? 'text-slate-800' : 'text-slate-600'}`}>{s.title}</p>
                            <span className={`shrink-0 text-xs font-extrabold ${isPaid ? 'text-amber-500' : 'text-indigo-500'}`}>+{s.points} {unit}</span>
                          </div>
                          {s.description && <p className="mt-0.5 text-xs text-slate-500">{s.description}</p>}
                          {finalized && (
                            <p className={`mt-1 text-[11px] font-bold ${s.approved ? 'text-emerald-500' : 'text-rose-500'}`}>
                              {s.approved ? '✓ Aprobada · pagó sus puntos' : '✗ No aprobada · no pagó'}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {canCheck && (
                  <p className="mt-2 text-[11px] text-slate-400">
                    Marcá lo que hiciste. El adulto revisa cada subtarea al validar: si no está bien hecha, esa no se cobra.
                  </p>
                )}
              </div>
            )}

            <TaskAttachments
              taskId={task.id}
              kind="attachment"
              userId={userId}
              canUpload={false}
              canDelete={() => false}
              title="📎 Material de referencia"
              emptyText="Sin adjuntos."
            />

            {(canCheck || (task.evidence && task.evidence.length > 0)) && (
              <TaskAttachments
                taskId={task.id}
                kind="evidence"
                userId={userId}
                canUpload={canCheck}
                canDelete={(a) => canCheck && a.uploadedById === userId}
                title="📸 Evidencia"
                emptyText="Subí una foto o video cuando termines, antes de marcarla hecha."
              />
            )}

            <div className="mt-6 flex gap-2">
              {task.lifecycle === 'en_espera' && (
                <Button variant="accent" className="flex-1" disabled={busy} onClick={() => act(() => familyApi.takeTask(task.id, userId), true)}>
                  Tomar tarea
                </Button>
              )}
              {task.lifecycle === 'doing' && isMine && (
                <>
                  <Button variant="ghost" className="flex-1" disabled={busy} onClick={() => act(() => familyApi.cancelTask(task.id, userId), true)}>
                    Cancelar
                  </Button>
                  <Button className="flex-1" disabled={busy} onClick={() => act(() => familyApi.submitTask(task.id, userId), true)}>
                    Marcar hecha
                  </Button>
                </>
              )}
              {task.lifecycle === 'done' && (
                <div className="flex-1 rounded-2xl bg-slate-100 py-3 text-center text-sm font-medium text-slate-500">Esperando validación del adulto</div>
              )}
              {task.lifecycle === 'finalizada' && (
                <div className="flex-1 rounded-2xl bg-emerald-50 py-3 text-center text-sm font-bold text-emerald-500">✓ Completada</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
