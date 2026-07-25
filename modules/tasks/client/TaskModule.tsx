import React, { useEffect, useMemo, useState } from 'react';
import { AppUser, ViewType } from '@sinapsis/shared-types';

type TaskView = 'list' | 'calendar' | 'kanban' | 'details';

interface TaskModuleProps {
  view: TaskView;
  setView: (view: ViewType) => void;
  currentUser?: AppUser;
  companyId?: string;
  onSubTitleChange?: (subtitle: string) => void;
}

interface TaskUser {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

interface TaskItem {
  id: string;
  code: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  category?: string;
  startDate?: string | null;
  dueDate?: string | null;
  ownerId: string;
  ownerName?: string;
  createdById: string;
  creatorName?: string;
  sharedUserIds?: string[];
  visibility: 'Private' | 'Shared';
}

interface MetaResponse {
  users: TaskUser[];
  categories: {
    types: { id: string; name: string }[];
    statuses: { id: string; name: string }[];
    priorities: { id: string; name: string }[];
  };
}

const SELECTED_TASK_KEY = 'sinapsis.tasks.selected';

const TaskModule: React.FC<TaskModuleProps> = ({ view, setView, currentUser, companyId, onSubTitleChange }) => {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [users, setUsers] = useState<TaskUser[]>([]);
  const [meta, setMeta] = useState<MetaResponse['categories']>({ types: [], statuses: [], priorities: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [mode, setMode] = useState<'my' | 'shared' | 'all'>('my');
  const [search, setSearch] = useState('');
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [calendarCursor, setCalendarCursor] = useState(() => new Date());
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dropStatus, setDropStatus] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    category: 'General',
    priority: 'Medium',
    status: 'Todo',
    startDate: '',
    dueDate: '',
    ownerId: currentUser?.id || '',
    shareWith: [] as string[]
  });

  const loadMeta = async () => {
    try {
      const params = new URLSearchParams();
      if (companyId) params.set('companyId', companyId);
      if (currentUser?.id) params.set('userId', currentUser.id);
      const res = await fetch(`/api/tasks/meta?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'No se pudo cargar metadata.');
      }
      const data: MetaResponse = await res.json();
      setUsers(data.users || []);
      setMeta(data.categories || { types: [], statuses: [], priorities: [] });
    } catch (e: any) {
      setError(e.message || 'Error cargando metadata de tareas.');
    }
  };

  const loadTasks = async () => {
    try {
      setLoading(true);
      setError('');
      const params = new URLSearchParams();
      if (companyId) params.set('companyId', companyId);
      if (currentUser?.id) params.set('viewerId', currentUser.id);
      params.set('mode', mode);
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`/api/tasks?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'No se pudieron cargar tareas.');
      }
      const data: TaskItem[] = await res.json();
      setTasks(data || []);

      if (view === 'details') {
        const selectedId = localStorage.getItem(SELECTED_TASK_KEY);
        const found = (data || []).find((item) => item.id === selectedId);
        setSelectedTask(found || null);
      }
    } catch (e: any) {
      setError(e.message || 'Error cargando tareas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMeta();
  }, [companyId, currentUser?.id]);

  useEffect(() => {
    loadTasks();
  }, [companyId, currentUser?.id, mode, search, view]);

  const openCreate = () => {
    setEditingTask(null);
    setForm({
      title: '',
      description: '',
      category: meta.types[0]?.name || 'General',
      priority: meta.priorities[0]?.name || 'Medium',
      status: meta.statuses[0]?.name || 'Todo',
      startDate: '',
      dueDate: '',
      ownerId: currentUser?.id || users[0]?.id || '',
      shareWith: []
    });
    setFormOpen(true);
  };

  const openEdit = (task: TaskItem) => {
    setEditingTask(task);
    setForm({
      title: task.title,
      description: task.description || '',
      category: task.category || meta.types[0]?.name || 'General',
      priority: task.priority || meta.priorities[0]?.name || 'Medium',
      status: task.status || meta.statuses[0]?.name || 'Todo',
      startDate: task.startDate ? String(task.startDate).slice(0, 10) : '',
      dueDate: task.dueDate ? String(task.dueDate).slice(0, 10) : '',
      ownerId: task.ownerId,
      shareWith: task.sharedUserIds || []
    });
    setFormOpen(true);
  };

  const submitTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser?.id) {
      setError('No hay usuario autenticado.');
      return;
    }

    const payload = {
      title: form.title,
      description: form.description,
      category: form.category,
      priority: form.priority,
      status: form.status,
      startDate: form.startDate || null,
      dueDate: form.dueDate || null,
      ownerId: form.ownerId,
      createdById: currentUser.id,
      companyId: companyId || currentUser.companyId,
      shareWith: form.shareWith
    };

    try {
      const url = editingTask ? `/api/tasks/${editingTask.id}` : '/api/tasks';
      const method = editingTask ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'No se pudo guardar la tarea.');
      }

      setFormOpen(false);
      await loadTasks();
    } catch (e: any) {
      setError(e.message || 'Error guardando tarea.');
    }
  };

  const removeTask = async (taskId: string) => {
    if (!confirm('?Eliminar esta tarea?')) return;

    try {
      const res = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'No se pudo eliminar.');
      }
      await loadTasks();
      if (selectedTask?.id === taskId) {
        localStorage.removeItem(SELECTED_TASK_KEY);
        setSelectedTask(null);
        setView('Tasks');
      }
    } catch (e: any) {
      setError(e.message || 'Error eliminando tarea.');
    }
  };

  const updateTaskStatus = async (taskId: string, status: string) => {
    const res = await fetch(`/api/tasks/${taskId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error || 'No se pudo actualizar estado.');
    }
  };

  const moveTask = async (taskId: string, status: string) => {
    try {
      await updateTaskStatus(taskId, status);
      await loadTasks();
    } catch (e: any) {
      setError(e.message || 'Error actualizando estado.');
    }
  };

  const startTaskDrag = (event: React.DragEvent<HTMLDivElement>, task: TaskItem) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', task.id);
    setDraggingTaskId(task.id);
  };

  const endTaskDrag = () => {
    setDraggingTaskId(null);
    setDropStatus(null);
    setDropIndex(null);
  };

  const handleColumnDragOver = (event: React.DragEvent<HTMLDivElement>, status: string) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (dropStatus !== status) setDropStatus(status);
    const endIndex = tasksByStatus[status]?.length || 0;
    if (dropIndex !== endIndex) setDropIndex(endIndex);
  };

  const handleCardDragOver = (event: React.DragEvent<HTMLDivElement>, status: string, index: number) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (dropStatus !== status) setDropStatus(status);
    if (dropIndex !== index) setDropIndex(index);
  };

  const reorderKanbanTasks = (taskId: string, targetStatus: string, targetIndex: number | null) => {
    setTasks((prev) => {
      const movingTask = prev.find((item) => item.id === taskId);
      if (!movingTask) return prev;

      const sourceStatus = movingTask.status;
      const sourceOriginal = prev.filter((item) => item.status === sourceStatus);
      const fromIndex = sourceOriginal.findIndex((item) => item.id === taskId);
      const sourceWithout = sourceOriginal.filter((item) => item.id !== taskId);
      const isSameStatus = sourceStatus === targetStatus;
      const targetBase = isSameStatus ? sourceWithout : prev.filter((item) => item.status === targetStatus);
      const movedTask = isSameStatus ? movingTask : { ...movingTask, status: targetStatus };

      let insertAt = targetIndex == null ? targetBase.length : targetIndex;
      if (isSameStatus && fromIndex >= 0 && insertAt > fromIndex) {
        insertAt -= 1;
      }
      insertAt = Math.max(0, Math.min(insertAt, targetBase.length));

      const targetReordered = [
        ...targetBase.slice(0, insertAt),
        movedTask,
        ...targetBase.slice(insertAt)
      ];

      const knownStatuses = Array.from(new Set([...statuses, ...prev.map((item) => item.status)]));
      return knownStatuses.flatMap((status) => {
        if (isSameStatus && status === sourceStatus) return targetReordered;
        if (!isSameStatus && status === sourceStatus) return sourceWithout;
        if (!isSameStatus && status === targetStatus) return targetReordered;
        return prev.filter((item) => item.status === status);
      });
    });
  };

  const handleColumnDrop = async (event: React.DragEvent<HTMLDivElement>, status: string) => {
    event.preventDefault();
    const taskId = event.dataTransfer.getData('text/plain') || draggingTaskId;
    const targetIndex = dropStatus === status ? dropIndex : tasksByStatus[status]?.length || 0;

    if (!taskId) {
      setDropStatus(null);
      setDraggingTaskId(null);
      setDropIndex(null);
      return;
    }

    const task = tasks.find((item) => item.id === taskId);
    if (!task) {
      setDropStatus(null);
      setDraggingTaskId(null);
      setDropIndex(null);
      return;
    }

    reorderKanbanTasks(taskId, status, targetIndex);
    setDropStatus(null);
    setDraggingTaskId(null);
    setDropIndex(null);

    if (task.status !== status) {
      try {
        await updateTaskStatus(taskId, status);
      } catch (e: any) {
        setError(e.message || 'Error actualizando estado.');
        await loadTasks();
      }
    }
  };

  const showDetails = (task: TaskItem) => {
    localStorage.setItem(SELECTED_TASK_KEY, task.id);
    setSelectedTask(task);
    setView('TaskDetails');
  };

  const statuses = useMemo(() => {
    const fromMeta = meta.statuses.map((s) => s.name);
    return fromMeta.length > 0 ? fromMeta : ['Todo', 'InProgress', 'Done'];
  }, [meta.statuses]);

  const priorities = useMemo(() => {
    const fromMeta = meta.priorities.map((s) => s.name);
    return fromMeta.length > 0 ? fromMeta : ['Low', 'Medium', 'High'];
  }, [meta.priorities]);

  const tasksByStatus = useMemo(() => {
    const grouped: Record<string, TaskItem[]> = {};
    for (const status of statuses) grouped[status] = [];
    for (const task of tasks) {
      if (!grouped[task.status]) grouped[task.status] = [];
      grouped[task.status].push(task);
    }
    return grouped;
  }, [tasks, statuses]);

  const calendarDays = useMemo(() => {
    const year = calendarCursor.getFullYear();
    const month = calendarCursor.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const lead = firstDay.getDay();
    const total = lastDay.getDate();

    const days: { date: Date; inMonth: boolean; tasks: TaskItem[] }[] = [];

    for (let i = 0; i < lead; i += 1) {
      const d = new Date(year, month, i - lead + 1);
      days.push({ date: d, inMonth: false, tasks: [] });
    }

    for (let day = 1; day <= total; day += 1) {
      const d = new Date(year, month, day);
      const dKey = d.toISOString().slice(0, 10);
      const dayTasks = tasks.filter((t) => String(t.dueDate || t.startDate || '').slice(0, 10) === dKey);
      days.push({ date: d, inMonth: true, tasks: dayTasks });
    }

    while (days.length % 7 !== 0) {
      const idx = days.length - (lead + total) + 1;
      const d = new Date(year, month + 1, idx);
      days.push({ date: d, inMonth: false, tasks: [] });
    }

    return days;
  }, [calendarCursor, tasks]);

  const titleByView = {
    list: 'Mis tareas',
    calendar: 'Calendario de tareas',
    kanban: 'Kanban de tareas',
    details: 'Detalle de tarea'
  }[view];

  useEffect(() => {
    if (!onSubTitleChange) return;
    if (view === 'details') {
      onSubTitleChange(selectedTask?.title || '');
      return;
    }
    onSubTitleChange('');
  }, [view, selectedTask?.title, onSubTitleChange]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{titleByView}</h1>
          <p className="text-xs text-slate-400 mt-1">Crea tareas para ti o comp?rtelas con tu equipo.</p>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as 'my' | 'shared' | 'all')}
            className="px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600"
          >
            <option value="my">Mis tareas</option>
            <option value="shared">Compartidas conmigo</option>
            <option value="all">Todas</option>
          </select>

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar..."
            className="px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium w-44"
          />

          <div className="bg-slate-100 p-1 rounded-xl flex gap-1">
            <button onClick={() => setView('Tasks')} className={`px-3 py-1.5 text-[11px] rounded-lg font-semibold ${view === 'list' ? 'bg-white text-red-500 shadow-sm' : 'text-slate-500'}`}>Lista</button>
            <button onClick={() => setView('TaskCalendar')} className={`px-3 py-1.5 text-[11px] rounded-lg font-semibold ${view === 'calendar' ? 'bg-white text-red-500 shadow-sm' : 'text-slate-500'}`}>Calendario</button>
            <button onClick={() => setView('Kanban')} className={`px-3 py-1.5 text-[11px] rounded-lg font-semibold ${view === 'kanban' ? 'bg-white text-red-500 shadow-sm' : 'text-slate-500'}`}>Kanban</button>
          </div>

          {view !== 'details' && (
            <button
              onClick={openCreate}
              className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-bold uppercase tracking-widest"
            >
              <i className="fa-solid fa-plus mr-2"></i>Nueva tarea
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-600 px-4 py-3 rounded-xl text-sm font-medium">{error}</div>
      )}

      {loading && <div className="text-sm text-slate-500">Cargando tareas...</div>}

      {!loading && view === 'list' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-left min-w-[860px]">
            <thead className="bg-table-header border-b border-foreground/10">
              <tr>
                {['Tarea', 'C?digo', 'Estado', 'Prioridad', 'Vence', 'Asignado', 'Acciones'].map((h) => (
                  <th key={h} className="px-5 py-3 text-[10px] uppercase tracking-widest text-table-header-foreground font-bold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tasks.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-sm text-slate-400">No hay tareas para mostrar.</td>
                </tr>
              )}
              {tasks.map((task) => (
                <tr key={task.id} className="hover:bg-slate-50/70">
                  <td className="px-5 py-4">
                    <button className="text-left" onClick={() => showDetails(task)}>
                      <p className="text-sm font-bold text-slate-900">{task.title}</p>
                      <p className="text-xs text-slate-400">{task.description || 'Sin descripci?n'}</p>
                    </button>
                  </td>
                  <td className="px-5 py-4 text-xs font-mono text-red-500">{task.code}</td>
                  <td className="px-5 py-4 text-xs font-semibold text-slate-600">{task.status}</td>
                  <td className="px-5 py-4 text-xs font-semibold">
                    <span className={`px-2 py-1 rounded-md ${task.priority === 'High' ? 'bg-rose-50 text-rose-600' : task.priority === 'Low' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                      {task.priority}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-xs text-slate-500">{task.dueDate ? new Date(task.dueDate).toLocaleDateString() : '-'}</td>
                  <td className="px-5 py-4 text-xs text-slate-500">{task.ownerName || '-'}</td>
                  <td className="px-5 py-4">
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(task)} className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 hover:bg-red-500 hover:text-white"><i className="fa-solid fa-pen text-xs"></i></button>
                      <button onClick={() => removeTask(task.id)} className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 hover:bg-rose-500 hover:text-white"><i className="fa-solid fa-trash text-xs"></i></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && view === 'calendar' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => setCalendarCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold">Anterior</button>
            <h3 className="text-sm font-bold text-slate-800">{calendarCursor.toLocaleString(undefined, { month: 'long', year: 'numeric' })}</h3>
            <button onClick={() => setCalendarCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold">Siguiente</button>
          </div>

          <div className="grid grid-cols-7 gap-2 text-[11px] text-slate-400 font-bold uppercase mb-2">
            {['Dom', 'Lun', 'Mar', 'Mi?', 'Jue', 'Vie', 'S?b'].map((d) => <div key={d} className="px-2">{d}</div>)}
          </div>

          <div className="grid grid-cols-7 gap-2">
            {calendarDays.map((day) => (
              <div key={day.date.toISOString()} className={`min-h-28 border rounded-xl p-2 ${day.inMonth ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50 text-slate-300'}`}>
                <div className="text-[11px] font-bold mb-2">{day.date.getDate()}</div>
                <div className="space-y-1">
                  {day.tasks.slice(0, 2).map((task) => (
                    <button key={task.id} onClick={() => showDetails(task)} className="w-full text-left text-[10px] px-1.5 py-1 rounded-md bg-red-50 text-red-600 font-semibold truncate">
                      {task.code}
                    </button>
                  ))}
                  {day.tasks.length > 2 && <div className="text-[10px] text-slate-400">+{day.tasks.length - 2} m?s</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && view === 'kanban' && (
        <div className="overflow-x-auto pb-2">
          <div className="flex gap-4 min-w-[980px]">
            {statuses.map((status) => (
              <div
                key={status}
                onDragOver={(event) => handleColumnDragOver(event, status)}
                onDrop={(event) => handleColumnDrop(event, status)}
                onDragLeave={() => {
                  if (dropStatus === status) {
                    setDropStatus(null);
                    setDropIndex(null);
                  }
                }}
                className={`w-[320px] border rounded-2xl p-3 transition-all ${
                  dropStatus === status
                    ? 'border-red-300 bg-red-50/50 ring-2 ring-red-100 shadow-lg shadow-red-100/60'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">{status}</h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-500">{tasksByStatus[status]?.length || 0}</span>
                </div>

                <div className="space-y-3">
                  {(tasksByStatus[status] || []).map((task, index) => (
                    <React.Fragment key={task.id}>
                      {dropStatus === status && dropIndex === index && draggingTaskId !== task.id && (
                        <div className="h-2 rounded-full bg-gradient-to-r from-red-300 via-red-200 to-transparent animate-pulse"></div>
                      )}
                      <div
                        draggable
                        onDragStart={(event) => startTaskDrag(event, task)}
                        onDragEnd={endTaskDrag}
                        onDragOver={(event) => handleCardDragOver(event, status, index)}
                        className={`bg-white border border-slate-200 rounded-xl p-3 space-y-2 cursor-grab active:cursor-grabbing transition-all duration-150 ${
                          draggingTaskId === task.id
                            ? 'opacity-60 scale-[1.02] rotate-[0.4deg] shadow-xl shadow-red-100 ring-2 ring-red-200'
                            : 'opacity-100 shadow-sm hover:shadow-md'
                        }`}
                      >
                        <button onClick={() => showDetails(task)} className="text-left w-full">
                          <p className="text-xs font-mono text-red-500">{task.code}</p>
                          <p className="text-sm font-bold text-slate-900">{task.title}</p>
                          <p className="text-xs text-slate-400 truncate">{task.description || 'Sin descripci?n'}</p>
                        </button>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-slate-500">{task.ownerName || '-'}</span>
                          <div className="flex gap-1">
                            {statuses.filter((s) => s !== task.status).slice(0, 2).map((nextStatus) => (
                              <button key={nextStatus} onClick={() => moveTask(task.id, nextStatus)} className="text-[10px] px-2 py-1 rounded-md bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-600">
                                {nextStatus}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </React.Fragment>
                  ))}
                  {dropStatus === status && dropIndex === (tasksByStatus[status] || []).length && (
                    <div className="h-2 rounded-full bg-gradient-to-r from-red-300 via-red-200 to-transparent animate-pulse"></div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && view === 'details' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-6">
          {!selectedTask && (
            <div className="text-sm text-slate-500">Selecciona una tarea desde la vista de lista, calendario o kanban.</div>
          )}

          {selectedTask && (
            <>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <p className="text-xs font-mono text-red-500">{selectedTask.code}</p>
                  <h2 className="text-2xl font-bold text-slate-900">{selectedTask.title}</h2>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => openEdit(selectedTask)} className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">Editar</button>
                  <button onClick={() => removeTask(selectedTask.id)} className="px-4 py-2 rounded-lg bg-rose-500 text-sm font-semibold text-white hover:bg-rose-600">Eliminar</button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 border border-slate-200 rounded-xl p-4">
                  <h3 className="text-sm font-bold text-slate-900 mb-2">Descripci?n</h3>
                  <p className="text-sm text-slate-600 whitespace-pre-wrap">{selectedTask.description || 'Sin descripci?n.'}</p>
                </div>
                <div className="border border-slate-200 rounded-xl p-4 space-y-2 text-sm">
                  <p><span className="font-semibold text-slate-500">Estado:</span> {selectedTask.status}</p>
                  <p><span className="font-semibold text-slate-500">Prioridad:</span> {selectedTask.priority}</p>
                  <p><span className="font-semibold text-slate-500">Categor?a:</span> {selectedTask.category || '-'}</p>
                  <p><span className="font-semibold text-slate-500">Asignado:</span> {selectedTask.ownerName || '-'}</p>
                  <p><span className="font-semibold text-slate-500">Creada por:</span> {selectedTask.creatorName || '-'}</p>
                  <p><span className="font-semibold text-slate-500">Inicio:</span> {selectedTask.startDate ? new Date(selectedTask.startDate).toLocaleDateString() : '-'}</p>
                  <p><span className="font-semibold text-slate-500">Vence:</span> {selectedTask.dueDate ? new Date(selectedTask.dueDate).toLocaleDateString() : '-'}</p>
                  <p><span className="font-semibold text-slate-500">Visibilidad:</span> {selectedTask.visibility}</p>
                </div>
              </div>

              {selectedTask.sharedUserIds && selectedTask.sharedUserIds.length > 0 && (
                <div className="border border-slate-200 rounded-xl p-4">
                  <h3 className="text-sm font-bold text-slate-900 mb-2">Compartida con</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedTask.sharedUserIds.map((uid) => {
                      const user = users.find((u) => u.id === uid);
                      return (
                        <span key={uid} className="px-2 py-1 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-600 border border-indigo-100">
                          {user?.name || uid}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setFormOpen(false)}></div>
          <div className="relative bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden">
            <form onSubmit={submitTask}>
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900">{editingTask ? 'Editar tarea' : 'Nueva tarea'}</h3>
                <button type="button" onClick={() => setFormOpen(false)} className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-500"><i className="fa-solid fa-xmark"></i></button>
              </div>

              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[70vh] overflow-y-auto">
                <div className="md:col-span-2">
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">T?tulo</label>
                  <input required value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                </div>

                <div className="md:col-span-2">
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Descripci?n</label>
                  <textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={4} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none" />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Tipo</label>
                  <select value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
                    {(meta.types.map((x) => x.name).length ? meta.types.map((x) => x.name) : ['General']).map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Prioridad</label>
                  <select value={form.priority} onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
                    {priorities.map((priority) => (
                      <option key={priority} value={priority}>{priority}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Estado</label>
                  <select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
                    {statuses.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Asignar a</label>
                  <select value={form.ownerId} onChange={(e) => setForm((p) => ({ ...p, ownerId: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>{user.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Inicio</label>
                  <input type="date" value={form.startDate} onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Vencimiento</label>
                  <input type="date" value={form.dueDate} onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                </div>

                <div className="md:col-span-2">
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Compartir con otros usuarios</label>
                  <div className="mt-2 border border-slate-200 rounded-lg p-3 max-h-40 overflow-y-auto space-y-2">
                    {users.filter((u) => u.id !== form.ownerId).map((user) => (
                      <label key={user.id} className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={form.shareWith.includes(user.id)}
                          onChange={(e) => {
                            setForm((prev) => ({
                              ...prev,
                              shareWith: e.target.checked
                                ? [...prev.shareWith, user.id]
                                : prev.shareWith.filter((x) => x !== user.id)
                            }));
                          }}
                        />
                        {user.name} ({user.email})
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
                <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700">Cancelar</button>
                <button type="submit" className="px-5 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-sm font-semibold text-white">Guardar tarea</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskModule;







