// Tipos y llamadas específicas del dominio FamilyTool (sobre /api/tasks).
import { api, type SessionUser } from './api';

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  refType: string | null;
  refId: string | null;
  createdAt: string;
}

export interface Rank {
  current: { key: string; label: string; min: number };
  next: { key: string; label: string; min: number } | null;
  xp: number;
  progress: number;
}
export interface Wallet {
  moneyPoints: number;
  xpPoints: number;
  rank: Rank;
  creditLimit: number;
  creditUsed: number;
  creditAvailable: number;
}
export interface LedgerEntry {
  id: string;
  currency: 'MONEY' | 'XP';
  amount: number;
  balanceAfter: number;
  reason: string;
  note: string | null;
  createdAt: string;
}
export interface Subtask {
  id: string;
  title: string;
  description: string | null;
  points: number;
  sortOrder: number;
  doneByChild: boolean;
  approved: boolean | null;
}
export interface Task {
  id: string;
  code: string;
  title: string;
  description: string | null;
  taskKind: 'Paid' | 'Responsibility';
  rewardPoints: number;
  rewardXp: number;
  lifecycle: 'creada' | 'en_espera' | 'doing' | 'done' | 'aprobada' | 'finalizada';
  availableUntil: string | null;
  dueDate: string | null;
  takenById: string | null;
  ownerId: string;
  ownerName?: string;
  familyGoalId: string | null;
  rejectedReason: string | null;
  selfCreated: boolean;
  subtasks?: Subtask[];
}
export interface FamilyGoal {
  id: string;
  title: string;
  description: string | null;
  targetXp: number;
  currentXp: number;
  status: string;
  imageUrl: string | null;
}
export interface GoalStats {
  goal: FamilyGoal;
  totalXp: number;
  targetXp: number;
  progress: number;
  contributors: { userId: string; userName: string; avatar: string | null; xp: number; pct: number }[];
}
export interface FamilyMember {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
}
export interface FamilyMemberFull {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  isParent: boolean;
  active: boolean;
  createdAt: string;
}
export interface Withdrawal {
  id: string;
  points: number;
  moneyAmount: string;
  currency: string;
  status: string;
  createdAt: string;
  userName?: string;
}
export interface FamilyConfig {
  companyId: string;
  pointsPerUnit: number;
  currency: string;
  minWithdrawalPoints: number;
  requireResponsibilitiesUpToDate: boolean;
}
export interface BadgeInfo {
  code: string;
  name: string;
  description: string | null;
  icon: string | null;
  earned: boolean;
  awardedAt: string | null;
}
export interface Gamification {
  streak: { currentStreak: number; longestStreak: number };
  badges: BadgeInfo[];
}

const q = (params: Record<string, string | undefined>) =>
  Object.entries(params)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`)
    .join('&');

export const familyApi = {
  wallet: (userId: string) => api.get<Wallet>(`/tasks/family/wallet?userId=${userId}`),
  history: (userId: string, limit = 30) => api.get<LedgerEntry[]>(`/tasks/family/wallet/history?userId=${userId}&limit=${limit}`),
  transfer: (fromUserId: string, toUserId: string, points: number, note?: string) =>
    api.post('/tasks/family/wallet/transfer', { fromUserId, toUserId, points, note }),
  requestWithdrawal: (userId: string, points: number) =>
    api.post<Withdrawal>('/tasks/family/wallet/withdrawals', { userId, points }),
  withdrawals: (params: { userId?: string; companyId?: string; status?: string }) =>
    api.get<Withdrawal[]>(`/tasks/family/wallet/withdrawals?${q(params)}`),
  config: (companyId: string) => api.get<FamilyConfig>(`/tasks/family/config?companyId=${companyId}`),

  members: (companyId: string) =>
    api.get<{ users: FamilyMember[] }>(`/tasks/meta?companyId=${companyId}`).then((r) => r.users),

  tasks: (params: { companyId?: string; taskKind?: string; lifecycle?: string; viewerId?: string; mode?: string }) =>
    api.get<Task[]>(`/tasks?${q(params)}`),
  task: (id: string) => api.get<Task>(`/tasks/${id}`),
  takeTask: (id: string, userId: string) => api.post<Task>(`/tasks/${id}/take`, { userId }),
  cancelTask: (id: string, userId: string) => api.post<Task>(`/tasks/${id}/cancel`, { userId }),
  submitTask: (id: string, userId: string) => api.post<Task>(`/tasks/${id}/submit`, { userId }),
  toggleSubtask: (taskId: string, subId: string, done: boolean) => api.patch<Task>(`/tasks/${taskId}/subtasks/${subId}`, { done }),

  goals: (companyId: string, status = 'Active') => api.get<FamilyGoal[]>(`/tasks/family/goals?${q({ companyId, status })}`),
  goalStats: (id: string) => api.get<GoalStats>(`/tasks/family/goals/${id}/stats`),
  gamification: (userId: string) => api.get<Gamification>(`/tasks/family/gamification?userId=${userId}`),

  notifications: (userId: string, limit = 30) =>
    api.get<{ items: AppNotification[]; unread: number }>(`/tasks/family/notifications?userId=${userId}&limit=${limit}`),
  markNotificationsRead: (userId: string, ids?: string[]) =>
    api.post('/tasks/family/notifications/read', { userId, ids }),
  updateProfile: (userId: string, data: { name?: string; avatar?: string | null }) =>
    api.put<SessionUser>('/tasks/family/profile', { userId, ...data }),
  changePassword: (userId: string, currentPassword: string, newPassword: string, confirmPassword: string) =>
    api.post(`/users/${userId}/change-password`, { currentPassword, newPassword, confirmPassword }),

  // ── Acciones de padre / administración ──────────────────────────────────────
  createTask: (body: Record<string, unknown>) => api.post<Task>('/tasks', body),
  publishTask: (id: string, availableUntil: string | null) => api.post<Task>(`/tasks/${id}/publish`, { availableUntil }),
  // ── Actividad propia: el usuario la crea, se auto-asigna, y el puntaje lo define quien valida ──
  createOwnActivity: (body: { userId: string; companyId: string; title: string; description?: string; dueDate?: string }) =>
    api.post<Task>('/tasks/self', body),
  validateTask: (id: string, validatorId: string, approvedSubtaskIds?: string[], awardedPoints?: number) =>
    api.post<Task>(`/tasks/${id}/validate`, { validatorId, approvedSubtaskIds, awardedPoints }),
  rejectTask: (id: string, reason: string) => api.post<Task>(`/tasks/${id}/reject`, { reason }),
  mint: (adminUserId: string, targetUserId: string, currency: 'MONEY' | 'XP', amount: number, note?: string) =>
    api.post('/tasks/family/wallet/mint', { adminUserId, targetUserId, currency, amount, note }),
  penalty: (adminUserId: string, targetUserId: string, currency: 'MONEY' | 'XP', amount: number, reason: string) =>
    api.post<{ requested: number; deducted: number }>('/tasks/family/wallet/penalty', { adminUserId, targetUserId, currency, amount, reason }),
  requestCredit: (userId: string, amount: number) =>
    api.post<{ amount: number; creditUsed: number; creditLimit: number; creditAvailable: number }>('/tasks/family/wallet/credit/request', { userId, amount }),
  setCreditLimit: (adminUserId: string, companyId: string, limit: number, targetUserId?: string) =>
    api.post('/tasks/family/wallet/credit/limit', { adminUserId, companyId, limit, targetUserId }),

  listMembersFull: (companyId: string) => api.get<FamilyMemberFull[]>(`/tasks/family/members?companyId=${companyId}`),
  createMember: (body: { adminUserId: string; companyId: string; name: string; email: string; password: string; isParent: boolean }) =>
    api.post<FamilyMemberFull>('/tasks/family/members', body),
  updateMember: (id: string, body: Record<string, unknown>) => api.put<FamilyMemberFull>(`/tasks/family/members/${id}`, body),
  approveWithdrawal: (id: string, approverId: string) => api.post(`/tasks/family/wallet/withdrawals/${id}/approve`, { approverId }),
  rejectWithdrawal: (id: string, approverId: string, reason: string) =>
    api.post(`/tasks/family/wallet/withdrawals/${id}/reject`, { approverId, reason }),
  updateConfig: (companyId: string, editorId: string, body: Partial<FamilyConfig>) =>
    api.put<FamilyConfig>(`/tasks/family/config?companyId=${companyId}`, { editorId, ...body }),
  createGoal: (body: Record<string, unknown>) => api.post<FamilyGoal>('/tasks/family/goals', body),
  updateGoal: (id: string, body: Record<string, unknown>) => api.put<FamilyGoal>(`/tasks/family/goals/${id}`, body),
  deleteGoal: (id: string) => api.del(`/tasks/family/goals/${id}`)
};

export interface Recurrence {
  id: string;
  title: string;
  description: string | null;
  taskKind: 'Paid' | 'Responsibility';
  rewardPoints: number;
  rewardXp: number;
  rrule: string;
  startDate: string;
  active: boolean;
  ownerId: string | null;
  ownerName?: string | null;
}

export const familyRecurrences = {
  list: (companyId: string) => api.get<Recurrence[]>(`/tasks/family/recurrences?companyId=${companyId}`),
  create: (body: Record<string, unknown>) => api.post<Recurrence>('/tasks/family/recurrences', body),
  toggle: (id: string) => api.post(`/tasks/family/recurrences/${id}/toggle`),
  remove: (id: string) => api.del(`/tasks/family/recurrences/${id}`)
};

const DAY_LABEL: Record<string, string> = { MO: 'Lun', TU: 'Mar', WE: 'Mié', TH: 'Jue', FR: 'Vie', SA: 'Sáb', SU: 'Dom' };
export function humanizeRrule(rrule: string, startDate?: string): string {
  const parts: Record<string, string> = {};
  for (const p of (rrule || '').split(';')) {
    const [k, v] = p.split('=');
    if (k) parts[k.toUpperCase()] = (v || '').trim();
  }
  const freq = (parts.FREQ || '').toUpperCase();
  const interval = Math.max(1, Number(parts.INTERVAL) || 1);
  const byday = (parts.BYDAY || '').split(',').filter(Boolean);
  if (freq === 'DAILY') return interval === 1 ? 'Todos los días' : `Cada ${interval} días`;
  if (freq === 'WEEKLY') {
    const days = byday.length ? byday.map((d) => DAY_LABEL[d] || d).join(', ') : startDate ? DAY_LABEL[['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][new Date(startDate + 'T00:00:00').getDay()]] : 'semanal';
    if (byday.length === 5 && ['MO', 'TU', 'WE', 'TH', 'FR'].every((d) => byday.includes(d))) return interval === 1 ? 'Días de semana (Lun a Vie)' : `Cada ${interval} sem., Lun a Vie`;
    return interval === 1 ? `Cada semana: ${days}` : `Cada ${interval} semanas: ${days}`;
  }
  if (freq === 'MONTHLY') {
    const dom = parts.BYMONTHDAY || (startDate ? String(new Date(startDate + 'T00:00:00').getDate()) : '');
    return `Una vez al mes${dom ? ` (día ${dom})` : ''}`;
  }
  return rrule;
}

const PARENT_ROLES = ['administrator', 'admin', 'parent', 'padre', 'madre', 'tutor'];
export const isParent = (role?: string) => {
  const r = (role || '').toLowerCase();
  return PARENT_ROLES.includes(r) || /parent|padre|madre|tutor|adult/.test(r);
};
