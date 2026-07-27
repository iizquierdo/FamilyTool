// FamilyTool — Motor de economía familiar + ciclo de vida de tareas.
// Se registra sobre el router del módulo Tasks (/api/tasks).
import express from 'express';
import crypto from 'crypto';
import type { Pool, PoolClient } from 'pg';
import { reserveNextReference } from '@sinapsis/module-sdk-server';
import webpush from 'web-push';

// ── Web Push (VAPID) ──────────────────────────────────────────────────────────
let vapidReady = false;
const ensureVapid = (): boolean => {
  if (vapidReady) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const sub = process.env.VAPID_SUBJECT || 'mailto:familytool@example.com';
  if (!pub || !priv) return false;
  try {
    webpush.setVapidDetails(sub, pub, priv);
    vapidReady = true;
    return true;
  } catch {
    return false;
  }
};

const sendPush = async (pool: Pool, userId: string, title: string, body: string, data?: Record<string, unknown>) => {
  if (!ensureVapid()) return;
  try {
    const subs = await pool.query('SELECT id, endpoint, p256dh, auth FROM "PushSubscription" WHERE "userId" = $1', [userId]);
    const payload = JSON.stringify({ title, body, data: data || {} });
    for (const s of subs.rows) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
      } catch (err: any) {
        const code = err?.statusCode;
        if (code === 404 || code === 410) await pool.query('DELETE FROM "PushSubscription" WHERE id = $1', [s.id]).catch(() => {});
      }
    }
  } catch {
    /* best-effort */
  }
};

export type Currency = 'MONEY' | 'XP';

// ─────────────────────────────────────────────────────────────────────────────
// Rangos por reputación (XP). Umbrales provisionales (M3 los hará configurables).
// ─────────────────────────────────────────────────────────────────────────────
export const RANKS = [
  { key: 'apprentice', label: 'Aprendiz', min: 0 },
  { key: 'collaborator', label: 'Colaborador', min: 100 },
  { key: 'helper', label: 'Ayudante', min: 300 },
  { key: 'expert', label: 'Experto', min: 700 },
  { key: 'master', label: 'Maestro del Hogar', min: 1500 }
];

export const computeRank = (xp: number) => {
  const x = Number(xp || 0);
  let current = RANKS[0];
  for (const r of RANKS) if (x >= r.min) current = r;
  const next = RANKS.find((r) => r.min > x) || null;
  const progress = next
    ? Math.min(1, (x - current.min) / (next.min - current.min))
    : 1;
  return { current, next, xp: x, progress };
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de transacción y billetera
// ─────────────────────────────────────────────────────────────────────────────
export const withTx = async <T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const ensureWalletRow = async (client: PoolClient, userId: string, companyId: string) => {
  await client.query(
    `INSERT INTO "Wallet" (id, "userId", "companyId", "moneyPoints", "xpPoints", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, 0, 0, NOW(), NOW())
     ON CONFLICT ("userId") DO NOTHING`,
    [crypto.randomUUID(), userId, companyId]
  );
  const row = await client.query('SELECT * FROM "Wallet" WHERE "userId" = $1 FOR UPDATE', [userId]);
  return row.rows[0];
};

interface AdjustArgs {
  userId: string;
  companyId: string;
  currency: Currency;
  amount: number; // con signo
  reason: string;
  refType?: string | null;
  refId?: string | null;
  note?: string | null;
}

// Ajusta la billetera dentro de una transacción existente. Lanza INSUFFICIENT_FUNDS
// si el débito dejaría el saldo negativo.
export const adjustWalletTx = async (client: PoolClient, args: AdjustArgs): Promise<number> => {
  const wallet = await ensureWalletRow(client, args.userId, args.companyId);
  const col = args.currency === 'MONEY' ? 'moneyPoints' : 'xpPoints';
  const current = Number(wallet[col] || 0);
  const nextBalance = current + args.amount;
  if (nextBalance < 0) {
    throw Object.assign(new Error('INSUFFICIENT_FUNDS'), { code: 'INSUFFICIENT_FUNDS' });
  }
  await client.query(`UPDATE "Wallet" SET "${col}" = $1, "updatedAt" = NOW() WHERE id = $2`, [
    nextBalance,
    wallet.id
  ]);
  await client.query(
    `INSERT INTO "WalletLedger" (id, "walletId", "userId", "companyId", currency, amount, "balanceAfter", reason, "refType", "refId", note, "createdAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
    [
      crypto.randomUUID(),
      wallet.id,
      args.userId,
      args.companyId,
      args.currency,
      args.amount,
      nextBalance,
      args.reason,
      args.refType || null,
      args.refId || null,
      args.note || null
    ]
  );

  // Auto-repago del adelanto: todo ingreso de dinero (que no sea el propio adelanto/repago)
  // salda primero la deuda antes de sumar al saldo gastable.
  if (args.currency === 'MONEY' && args.amount > 0 && args.reason !== 'credit_advance' && args.reason !== 'credit_repay') {
    const debt = Number(wallet.creditUsed || 0);
    // Solo lo que ENTRA (args.amount) salda deuda; el saldo previo no se toca.
    const repay = Math.min(args.amount, debt);
    if (repay > 0) {
      const afterRepay = nextBalance - repay;
      await client.query('UPDATE "Wallet" SET "moneyPoints" = $1, "creditUsed" = $2, "updatedAt" = NOW() WHERE id = $3', [afterRepay, debt - repay, wallet.id]);
      await client.query(
        `INSERT INTO "WalletLedger" (id, "walletId", "userId", "companyId", currency, amount, "balanceAfter", reason, "refType", "refId", note, "createdAt")
         VALUES ($1, $2, $3, $4, 'MONEY', $5, $6, 'credit_repay', NULL, NULL, $7, NOW())`,
        [crypto.randomUUID(), wallet.id, args.userId, args.companyId, -repay, afterRepay, 'Pago del adelanto']
      );
      return afterRepay;
    }
  }
  return nextBalance;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de usuario / familia
// ─────────────────────────────────────────────────────────────────────────────
const resolveUserCompanyId = async (pool: Pool, userId: string): Promise<string | null> => {
  const r = await pool.query('SELECT "companyId" FROM "User" WHERE id = $1 LIMIT 1', [userId]);
  return r.rows[0]?.companyId || null;
};

const LEGACY_PARENT_ROLES = new Set(['administrator', 'admin', 'parent', 'padre', 'madre', 'tutor']);
const PARENT_ROLE_NAME_RE = /parent|padre|madre|tutor|adult/;
// Un "padre" es un admin/legacy admin o un rol cuyo nombre sugiere paternidad/tutoría.
export const computeIsParent = (role?: string | null, roleName?: string | null): boolean => {
  const r = String(role || '').toLowerCase();
  if (LEGACY_PARENT_ROLES.has(r)) return true;
  return PARENT_ROLE_NAME_RE.test(String(roleName || '').toLowerCase());
};

export const isParentUser = async (pool: Pool, userId: string): Promise<boolean> => {
  const r = await pool.query(
    `SELECT u.role AS role, r.name AS "roleName"
     FROM "User" u LEFT JOIN "Role" r ON r.id = u."roleId"
     WHERE u.id = $1 LIMIT 1`,
    [userId]
  );
  const row = r.rows[0];
  if (!row) return false;
  return computeIsParent(row.role, row.roleName);
};

// Encuentra (o crea) un Role con permiso de lectura sobre TASKS para asignar a "hijos".
// Reusa cualquier rol no-admin que ya tenga el permiso (p. ej. sembrado por la provisión);
// si no existe ninguno, crea uno nuevo "Miembro" y le otorga el permiso.
const ensureChildRoleId = async (pool: Pool): Promise<string> => {
  const existing = await pool.query(
    `SELECT r.id FROM "Role" r
     JOIN "Permission" p ON p."roleId" = r.id
     JOIN "SystemModule" m ON m.id = p."moduleId" AND m.code = 'TASKS'
     WHERE p."canRead" = TRUE AND LOWER(r.name) NOT IN ('administrator', 'admin')
     ORDER BY r.name ASC LIMIT 1`
  );
  if (existing.rows[0]?.id) return existing.rows[0].id;

  const roleId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO "Role" (id, name, description, "createdAt", "updatedAt")
     VALUES ($1, 'Miembro', 'Miembro de familia (FamilyTool)', NOW(), NOW())`,
    [roleId]
  );
  const mod = await pool.query('SELECT id FROM "SystemModule" WHERE code = $1 LIMIT 1', ['TASKS']);
  const moduleId = mod.rows[0]?.id;
  if (moduleId) {
    await pool.query(
      `INSERT INTO "Permission" (id, "roleId", "moduleId", "canRead", "canWrite", "canCreate", "canDelete", "createdAt", "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, TRUE, TRUE, TRUE, TRUE, NOW(), NOW())`,
      [roleId, moduleId]
    );
  }
  return roleId;
};

// Hashing de password compatible con apps/api/src/password.ts (mismo formato scrypt$salt$hash),
// así el login del core reconoce y verifica correctamente los usuarios creados desde acá.
const hashPasswordForUser = (plain: string): string => {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(plain, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
};

export const getFamilyConfig = async (pool: Pool, companyId: string) => {
  const r = await pool.query('SELECT * FROM "FamilyConfig" WHERE "companyId" = $1 LIMIT 1', [companyId]);
  if (r.rows[0]) return r.rows[0];
  // Si no existe (familia creada después del install), crear con defaults.
  await pool.query(
    `INSERT INTO "FamilyConfig" ("companyId", "pointsPerUnit", "currency", "minWithdrawalPoints", "requireResponsibilitiesUpToDate", "createdAt", "updatedAt")
     VALUES ($1, 100, 'USD', 0, TRUE, NOW(), NOW()) ON CONFLICT ("companyId") DO NOTHING`,
    [companyId]
  );
  const again = await pool.query('SELECT * FROM "FamilyConfig" WHERE "companyId" = $1 LIMIT 1', [companyId]);
  return again.rows[0];
};

// Candado pedagógico: ¿tiene el usuario sus responsabilidades vencidas al día?
// Bloquea si existe alguna responsabilidad asignada, vencida y no finalizada.
export const responsibilitiesUpToDate = async (pool: Pool, userId: string): Promise<boolean> => {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS c FROM "Task"
     WHERE "taskKind" = 'Responsibility'
       AND lifecycle <> 'finalizada'
       AND ("ownerId" = $1 OR "takenById" = $1)
       AND "dueDate" IS NOT NULL AND "dueDate" < NOW()`,
    [userId]
  );
  return Number(r.rows[0]?.c || 0) === 0;
};

// Devuelve las tareas cuyo countdown venció al estado 'creada'. Se llama al listar.
export const expireStaleTasks = async (pool: Pool): Promise<void> => {
  await pool.query(
    `UPDATE "Task"
     SET lifecycle = 'creada', "availableUntil" = NULL, "updatedAt" = NOW()
     WHERE lifecycle = 'en_espera' AND "availableUntil" IS NOT NULL AND "availableUntil" < NOW()`
  );
};

// Aporta XP a una meta familiar (si corresponde) al validar una responsabilidad.
const contributeToGoal = async (
  client: PoolClient,
  args: { companyId: string; userId: string; xp: number; taskId: string; goalId?: string | null }
) => {
  let goalId = args.goalId || null;
  if (!goalId) {
    // Meta activa más reciente de la familia (para que las responsabilidades la alimenten).
    const g = await client.query(
      `SELECT id FROM "FamilyGoal" WHERE "companyId" = $1 AND status = 'Active' ORDER BY "createdAt" DESC LIMIT 1`,
      [args.companyId]
    );
    goalId = g.rows[0]?.id || null;
  }
  if (!goalId || args.xp <= 0) return;

  await client.query(
    `INSERT INTO "FamilyGoalContribution" (id, "goalId", "userId", "companyId", xp, "sourceTaskId", "createdAt")
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [crypto.randomUUID(), goalId, args.userId, args.companyId, args.xp, args.taskId]
  );
  await client.query(
    `UPDATE "FamilyGoal"
     SET "currentXp" = "currentXp" + $1,
         status = CASE WHEN "currentXp" + $1 >= "targetXp" AND "targetXp" > 0 THEN 'Reached' ELSE status END,
         "updatedAt" = NOW()
     WHERE id = $2`,
    [args.xp, goalId]
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Gamificación: rachas e insignias
// ─────────────────────────────────────────────────────────────────────────────
const awardBadge = async (pool: Pool, userId: string, companyId: string, code: string) => {
  const b = await pool.query('SELECT id FROM "Badge" WHERE code = $1 LIMIT 1', [code]);
  const badgeId = b.rows[0]?.id;
  if (!badgeId) return;
  await pool.query(
    `INSERT INTO "UserBadge" (id, "userId", "badgeId", "companyId", "awardedAt")
     VALUES (gen_random_uuid(), $1, $2, $3, NOW())
     ON CONFLICT ("userId", "badgeId") DO NOTHING`,
    [userId, badgeId, companyId]
  );
};

// Actualiza la racha diaria (un incremento por día con al menos una tarea completada).
const updateStreak = async (pool: Pool, userId: string, companyId: string): Promise<number> => {
  const r = await pool.query(
    'SELECT "currentStreak", "longestStreak", "lastCompletedDate"::text AS last FROM "UserStreak" WHERE "userId" = $1',
    [userId]
  );
  const row = r.rows[0];
  const today = (await pool.query('SELECT CURRENT_DATE::text AS d')).rows[0].d;
  if (!row) {
    await pool.query(
      `INSERT INTO "UserStreak" ("userId", "companyId", "currentStreak", "longestStreak", "lastCompletedDate", "updatedAt")
       VALUES ($1, $2, 1, 1, CURRENT_DATE, NOW())`,
      [userId, companyId]
    );
    return 1;
  }
  if (row.last === today) return row.currentStreak;
  const diff = Number((await pool.query('SELECT (CURRENT_DATE - $1::date) AS d', [row.last])).rows[0].d);
  const current = diff === 1 ? row.currentStreak + 1 : 1;
  const longest = Math.max(current, row.longestStreak);
  await pool.query(
    'UPDATE "UserStreak" SET "currentStreak" = $1, "longestStreak" = $2, "lastCompletedDate" = CURRENT_DATE, "updatedAt" = NOW() WHERE "userId" = $3',
    [current, longest, userId]
  );
  return current;
};

// Se llama tras validar una tarea (best-effort, no bloquea el pago).
const processGamificationOnValidate = async (pool: Pool, userId: string, companyId: string) => {
  try {
    const streak = await updateStreak(pool, userId, companyId);
    await awardBadge(pool, userId, companyId, 'FIRST_TASK');
    if (streak >= 3) await awardBadge(pool, userId, companyId, 'STREAK_3');
    if (streak >= 7) await awardBadge(pool, userId, companyId, 'STREAK_7');
    const count = Number(
      (await pool.query(`SELECT COUNT(*)::int AS c FROM "Task" WHERE lifecycle = 'finalizada' AND ("takenById" = $1 OR "ownerId" = $1)`, [userId])).rows[0].c
    );
    if (count >= 10) await awardBadge(pool, userId, companyId, 'HELPER_10');
  } catch {
    /* la gamificación es best-effort: nunca rompe el flujo principal */
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Notificaciones (best-effort: nunca rompen el flujo principal)
// ─────────────────────────────────────────────────────────────────────────────
const notify = async (
  pool: Pool,
  userId: string,
  companyId: string,
  type: string,
  title: string,
  body?: string | null,
  refType?: string | null,
  refId?: string | null
) => {
  try {
    await pool.query(
      `INSERT INTO "Notification" (id, "userId", "companyId", type, title, body, read, "refType", "refId", "createdAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, FALSE, $6, $7, NOW())`,
      [userId, companyId, type, title, body || null, refType || null, refId || null]
    );
  } catch {
    /* noop */
  }
  // Además de la notificación in-app, dispara la push (best-effort).
  await sendPush(pool, userId, title, body || '', { type, refType, refId });
};

const getParentIds = async (pool: Pool, companyId: string): Promise<string[]> => {
  const r = await pool.query(
    `SELECT u.id FROM "User" u LEFT JOIN "Role" r ON r.id = u."roleId"
     WHERE u."companyId" = $1
       AND (LOWER(u.role) IN ('administrator','admin','parent','padre','madre','tutor')
            OR LOWER(COALESCE(r.name, '')) ~ 'parent|padre|madre|tutor|adult')`,
    [companyId]
  );
  return r.rows.map((x: any) => x.id);
};

const notifyParents = async (
  pool: Pool,
  companyId: string,
  type: string,
  title: string,
  body?: string | null,
  refType?: string | null,
  refId?: string | null
) => {
  const ids = await getParentIds(pool, companyId);
  for (const id of ids) await notify(pool, id, companyId, type, title, body, refType, refId);
};

// ─────────────────────────────────────────────────────────────────────────────
// Tareas recurrentes (RRULE): genera instancias de Task cuando llega cada ocurrencia
// ─────────────────────────────────────────────────────────────────────────────
const MS_DAY = 86400000;
const WD = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const toMidnight = (d: any) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const startOfWeekMonday = (d: Date) => { const x = toMidnight(d); return addDays(x, -((x.getDay() + 6) % 7)); };

interface ParsedRule { freq: string; interval: number; byday: Set<string>; bymonthday: number | null; }
const parseRule = (rrule: string): ParsedRule => {
  const parts: Record<string, string> = {};
  for (const p of String(rrule || '').split(';')) {
    const [k, v] = p.split('=');
    if (k) parts[k.trim().toUpperCase()] = (v || '').trim();
  }
  return {
    freq: (parts.FREQ || '').toUpperCase(),
    interval: Math.max(1, Number(parts.INTERVAL) || 1),
    byday: new Set((parts.BYDAY || '').split(',').filter(Boolean).map((s) => s.toUpperCase())),
    bymonthday: parts.BYMONTHDAY ? Number(parts.BYMONTHDAY) : null
  };
};

const matchesRule = (rule: ParsedRule, start: Date, d: Date): boolean => {
  const s = toMidnight(start);
  const dd = toMidnight(d);
  const dayDiff = Math.round((dd.getTime() - s.getTime()) / MS_DAY);
  if (dayDiff < 0) return false;
  if (rule.freq === 'DAILY') return dayDiff % rule.interval === 0;
  if (rule.freq === 'WEEKLY') {
    const wd = WD[dd.getDay()];
    if (rule.byday.size ? !rule.byday.has(wd) : dd.getDay() !== s.getDay()) return false;
    const weekDiff = Math.round((startOfWeekMonday(dd).getTime() - startOfWeekMonday(s).getTime()) / (7 * MS_DAY));
    return weekDiff % rule.interval === 0;
  }
  if (rule.freq === 'MONTHLY') {
    const dom = rule.bymonthday || s.getDate();
    if (dd.getDate() !== dom) return false;
    const monthDiff = (dd.getFullYear() - s.getFullYear()) * 12 + (dd.getMonth() - s.getMonth());
    return monthDiff >= 0 && monthDiff % rule.interval === 0;
  }
  return false;
};

// Ocurrencias pendientes de generar (desde la última generación hasta hoy, con tope de días).
const occurrencesDue = (rec: any, today: Date, capDays = 21): Date[] => {
  const start = toMidnight(rec.startDate);
  let from = rec.lastGeneratedDate ? addDays(toMidnight(rec.lastGeneratedDate), 1) : start;
  if (from < start) from = start;
  const capFrom = addDays(toMidnight(today), -capDays);
  if (from < capFrom) from = capFrom;
  const end = rec.endDate ? toMidnight(rec.endDate) : null;
  const rule = parseRule(rec.rrule);
  const todayMid = toMidnight(today);
  const out: Date[] = [];
  for (let d = new Date(from); d <= todayMid; d = addDays(d, 1)) {
    if (end && d > end) break;
    if (matchesRule(rule, start, d)) out.push(new Date(d));
  }
  return out;
};

const createTaskInstance = async (pool: Pool, rec: any, occDate: Date) => {
  const code = await reserveNextReference(pool, { companyId: rec.companyId, module: 'TASKS', code: 'TASKS' });
  const id = crypto.randomUUID();
  const owner = rec.ownerId || rec.createdById;
  const due = new Date(occDate);
  due.setHours(23, 59, 0, 0);
  await pool.query(
    `INSERT INTO "Task" (id, code, title, description, status, priority, visibility, "companyId", "createdById", "ownerId",
       "taskKind", "rewardPoints", "rewardXp", lifecycle, "availableUntil", "dueDate", "familyGoalId", "recurrenceId", "occurrenceDate", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, 'Todo', 'Medium', 'Private', $5, $6, $7, $8, $9, $10, 'en_espera', $11::timestamp, $12::timestamp, $13, $14, $15, NOW(), NOW())`,
    [id, code, rec.title, rec.description || null, rec.companyId, rec.createdById, owner, rec.taskKind, rec.rewardPoints, rec.rewardXp,
      due.toISOString(), due.toISOString(), rec.familyGoalId || null, rec.id, ymd(occDate)]
  );
  const subs = Array.isArray(rec.subtasks) ? rec.subtasks : [];
  let order = 0;
  for (const s of subs) {
    const t = String(s?.title || '').trim();
    if (!t) continue;
    await pool.query(
      `INSERT INTO "TaskSubtask" (id, "taskId", title, description, points, "sortOrder", "doneByChild", approved, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, FALSE, NULL, NOW(), NOW())`,
      [crypto.randomUUID(), id, t, String(s?.description || '').trim() || null, Math.max(0, Math.floor(Number(s?.points) || 0)), order]
    );
    order += 1;
  }
};

// Materializa las instancias pendientes de todas las recurrencias activas de la familia.
export const generateDueRecurrences = async (pool: Pool, companyId: string) => {
  try {
    const recs = await pool.query(
      `SELECT * FROM "TaskRecurrence"
       WHERE "companyId" = $1 AND active = TRUE AND "startDate" <= CURRENT_DATE AND ("endDate" IS NULL OR "endDate" >= CURRENT_DATE)`,
      [companyId]
    );
    const today = new Date();
    for (const rec of recs.rows) {
      for (const date of occurrencesDue(rec, today)) {
        const exists = await pool.query('SELECT 1 FROM "Task" WHERE "recurrenceId" = $1 AND "occurrenceDate" = $2 LIMIT 1', [rec.id, ymd(date)]);
        if (exists.rows[0]) continue;
        await createTaskInstance(pool, rec, date);
      }
      await pool.query('UPDATE "TaskRecurrence" SET "lastGeneratedDate" = CURRENT_DATE, "updatedAt" = NOW() WHERE id = $1', [rec.id]);
    }
  } catch {
    /* best-effort: no rompe el listado de tareas */
  }
};

type GetTaskById = (taskId: string) => Promise<any>;

// ─────────────────────────────────────────────────────────────────────────────
// Registro de rutas
// ─────────────────────────────────────────────────────────────────────────────
export function registerFamilyRoutes(
  router: express.Router,
  pool: Pool,
  deps: { getTaskById: GetTaskById; ensureActive: () => Promise<boolean> }
) {
  const { getTaskById, ensureActive } = deps;
  const guard = async (res: express.Response): Promise<boolean> => {
    if (!(await ensureActive())) {
      res.status(409).json({ error: 'Task module is not active.' });
      return false;
    }
    return true;
  };

  // ═══════════════════════ Ciclo de vida de tareas ═══════════════════════════

  // creada → en_espera (publicar con cuenta regresiva)
  router.post('/:id/publish', async (req, res) => {
    try {
      if (!(await guard(res))) return;
      const task = await getTaskById(req.params.id);
      if (!task) return res.status(404).json({ error: 'Task not found' });
      if (task.lifecycle !== 'creada') {
        return res.status(409).json({ error: `Task cannot be published from '${task.lifecycle}'.` });
      }
      const availableUntil = req.body?.availableUntil ? new Date(req.body.availableUntil) : null;
      await pool.query(
        `UPDATE "Task" SET lifecycle = 'en_espera', "availableUntil" = $1, "updatedAt" = NOW() WHERE id = $2`,
        [availableUntil && !Number.isNaN(availableUntil.getTime()) ? availableUntil.toISOString() : null, task.id]
      );
      res.json(await getTaskById(task.id));
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to publish task', details: error.message });
    }
  });

  // en_espera → doing (tomar)
  router.post('/:id/take', async (req, res) => {
    try {
      if (!(await guard(res))) return;
      const userId = String(req.body?.userId || '').trim();
      if (!userId) return res.status(400).json({ error: 'userId is required.' });
      const task = await getTaskById(req.params.id);
      if (!task) return res.status(404).json({ error: 'Task not found' });
      if (task.lifecycle !== 'en_espera') {
        return res.status(409).json({ error: `Task is not available (state '${task.lifecycle}').` });
      }
      if (task.availableUntil && new Date(task.availableUntil) < new Date()) {
        return res.status(409).json({ error: 'Task countdown has expired.' });
      }
      await pool.query(
        `UPDATE "Task" SET lifecycle = 'doing', "takenById" = $1, "takenAt" = NOW(), "updatedAt" = NOW() WHERE id = $2`,
        [userId, task.id]
      );
      res.json(await getTaskById(task.id));
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to take task', details: error.message });
    }
  });

  // doing → en_espera (cancelar / liberar para otro miembro)
  router.post('/:id/cancel', async (req, res) => {
    try {
      if (!(await guard(res))) return;
      const task = await getTaskById(req.params.id);
      if (!task) return res.status(404).json({ error: 'Task not found' });
      if (task.lifecycle !== 'doing') {
        return res.status(409).json({ error: `Task cannot be cancelled from '${task.lifecycle}'.` });
      }
      await pool.query(
        `UPDATE "Task" SET lifecycle = 'en_espera', "takenById" = NULL, "takenAt" = NULL, "submittedAt" = NULL, "updatedAt" = NOW() WHERE id = $1`,
        [task.id]
      );
      res.json(await getTaskById(task.id));
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to cancel task', details: error.message });
    }
  });

  // doing → done (enviar para validación)
  router.post('/:id/submit', async (req, res) => {
    try {
      if (!(await guard(res))) return;
      const task = await getTaskById(req.params.id);
      if (!task) return res.status(404).json({ error: 'Task not found' });
      if (task.lifecycle !== 'doing') {
        return res.status(409).json({ error: `Task cannot be submitted from '${task.lifecycle}'.` });
      }
      await pool.query(
        `UPDATE "Task" SET lifecycle = 'done', "submittedAt" = NOW(), "updatedAt" = NOW() WHERE id = $1`,
        [task.id]
      );
      await notifyParents(pool, task.companyId, 'task_submitted', `Tarea por validar: ${task.title}`, 'Un miembro la marcó como hecha.', 'task', task.id);
      res.json(await getTaskById(task.id));
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to submit task', details: error.message });
    }
  });

  // done → aprobada/finalizada (validar y pagar puntos)
  router.post('/:id/validate', async (req, res) => {
    try {
      if (!(await guard(res))) return;
      const validatorId = String(req.body?.validatorId || '').trim();
      const task = await getTaskById(req.params.id);
      if (!task) return res.status(404).json({ error: 'Task not found' });
      if (task.lifecycle !== 'done') {
        return res.status(409).json({ error: `Task cannot be validated from '${task.lifecycle}'.` });
      }

      const beneficiaryId = task.takenById || task.ownerId;
      const companyId = task.companyId;
      const subtasks: any[] = Array.isArray(task.subtasks) ? task.subtasks : [];
      const hasSubtasks = subtasks.length > 0;

      // Subtareas aprobadas: si el padre manda approvedSubtaskIds se usa eso; si no,
      // se aprueban las que el chico marcó como hechas.
      const approvedIds: Set<string> = Array.isArray(req.body?.approvedSubtaskIds)
        ? new Set(req.body.approvedSubtaskIds.map(String))
        : new Set(subtasks.filter((s) => s.doneByChild).map((s) => s.id));

      // Cálculo del pago: con subtareas paga la suma de las aprobadas; sin subtareas, el reward plano.
      const flatMoney = Number(task.rewardPoints || 0);
      const flatXp = Number(task.rewardXp || 0);
      const subtaskPoints = subtasks.filter((s) => approvedIds.has(s.id)).reduce((sum, s) => sum + Number(s.points || 0), 0);

      let moneyPayout = 0;
      let xpPayout = 0;
      if (task.selfCreated) {
        // Actividad auto-creada por el usuario: el puntaje no viene de la tarea,
        // lo determina quien valida (por defecto 0).
        xpPayout = Math.max(0, Math.floor(Number(req.body?.awardedPoints || 0)));
      } else if (hasSubtasks) {
        if (task.taskKind === 'Paid') {
          moneyPayout = subtaskPoints;
          xpPayout = flatXp;
        } else {
          xpPayout = subtaskPoints;
        }
      } else {
        moneyPayout = task.taskKind === 'Paid' ? flatMoney : 0;
        xpPayout = flatXp;
      }

      await withTx(pool, async (client) => {
        // Persistir el veredicto de cada subtarea (aprobada = paga).
        for (const s of subtasks) {
          await client.query('UPDATE "TaskSubtask" SET approved = $1, "updatedAt" = NOW() WHERE id = $2', [approvedIds.has(s.id), s.id]);
        }
        if (moneyPayout > 0) {
          await adjustWalletTx(client, {
            userId: beneficiaryId, companyId, currency: 'MONEY', amount: moneyPayout,
            reason: 'task_reward', refType: 'task', refId: task.id, note: task.title
          });
        }
        if (xpPayout > 0) {
          await adjustWalletTx(client, {
            userId: beneficiaryId, companyId, currency: 'XP', amount: xpPayout,
            reason: 'task_reward', refType: 'task', refId: task.id, note: task.title
          });
        }
        // Las responsabilidades (y tareas con meta asignada) alimentan la meta familiar.
        if (task.taskKind === 'Responsibility' || task.familyGoalId) {
          await contributeToGoal(client, {
            companyId, userId: beneficiaryId, xp: xpPayout, taskId: task.id, goalId: task.familyGoalId
          });
        }
        await client.query(
          `UPDATE "Task"
           SET lifecycle = 'finalizada', status = 'Done',
               "validatedById" = $1, "validatedAt" = NOW(), "completedAt" = NOW(),
               "rejectedReason" = NULL, "updatedAt" = NOW()
           WHERE id = $2`,
          [validatorId || null, task.id]
        );
      });

      await processGamificationOnValidate(pool, beneficiaryId, companyId);
      const rewardMsg = [moneyPayout > 0 ? `${moneyPayout} pts` : '', xpPayout > 0 ? `${xpPayout} XP` : ''].filter(Boolean).join(' y ');
      await notify(pool, beneficiaryId, companyId, 'task_validated', `¡Validada! ${task.title}`, rewardMsg ? `Ganaste ${rewardMsg}.` : 'Sin puntos esta vez.', 'task', task.id);
      res.json(await getTaskById(task.id));
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to validate task', details: error.message });
    }
  });

  // done → doing (rechazar, vuelve al que la hizo con motivo)
  router.post('/:id/reject', async (req, res) => {
    try {
      if (!(await guard(res))) return;
      const reason = String(req.body?.reason || '').trim() || null;
      const task = await getTaskById(req.params.id);
      if (!task) return res.status(404).json({ error: 'Task not found' });
      if (task.lifecycle !== 'done') {
        return res.status(409).json({ error: `Task cannot be rejected from '${task.lifecycle}'.` });
      }
      await pool.query(
        `UPDATE "Task" SET lifecycle = 'doing', "submittedAt" = NULL, "rejectedReason" = $1, "updatedAt" = NOW() WHERE id = $2`,
        [reason, task.id]
      );
      await notify(pool, task.takenById || task.ownerId, task.companyId, 'task_rejected', `Tarea a rehacer: ${task.title}`, reason || 'Revisala y volvé a enviarla.', 'task', task.id);
      res.json(await getTaskById(task.id));
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to reject task', details: error.message });
    }
  });

  // El que hace la tarea marca/desmarca una subtarea como hecha.
  router.patch('/:id/subtasks/:subId', async (req, res) => {
    try {
      if (!(await guard(res))) return;
      const done = Boolean(req.body?.done);
      const r = await pool.query(
        'UPDATE "TaskSubtask" SET "doneByChild" = $1, "updatedAt" = NOW() WHERE id = $2 AND "taskId" = $3 RETURNING id',
        [done, req.params.subId, req.params.id]
      );
      if (!r.rows[0]) return res.status(404).json({ error: 'Subtask not found' });
      res.json(await getTaskById(req.params.id));
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update subtask', details: error.message });
    }
  });

  // ═══════════════════════ Billetera / economía ══════════════════════════════
  const family = express.Router();

  // Balance + rango
  family.get('/wallet', async (req, res) => {
    try {
      if (!(await guard(res))) return;
      const userId = String(req.query.userId || '').trim();
      if (!userId) return res.status(400).json({ error: 'userId is required.' });
      const r = await pool.query('SELECT * FROM "Wallet" WHERE "userId" = $1 LIMIT 1', [userId]);
      const wallet = r.rows[0] || { moneyPoints: 0, xpPoints: 0 };
      const creditLimit = Number(wallet.creditLimit || 0);
      const creditUsed = Number(wallet.creditUsed || 0);
      res.json({
        moneyPoints: Number(wallet.moneyPoints || 0),
        xpPoints: Number(wallet.xpPoints || 0),
        rank: computeRank(Number(wallet.xpPoints || 0)),
        creditLimit,
        creditUsed,
        creditAvailable: Math.max(0, creditLimit - creditUsed)
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to load wallet', details: error.message });
    }
  });

  // Historial de movimientos
  family.get('/wallet/history', async (req, res) => {
    try {
      if (!(await guard(res))) return;
      const userId = String(req.query.userId || '').trim();
      if (!userId) return res.status(400).json({ error: 'userId is required.' });
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
      const r = await pool.query(
        `SELECT * FROM "WalletLedger" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT $2`,
        [userId, limit]
      );
      res.json(r.rows);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to load wallet history', details: error.message });
    }
  });

  // Transferencia P2P (solo puntos MONEY) — visible para el padre vía tabla Transfer
  family.post('/wallet/transfer', async (req, res) => {
    try {
      if (!(await guard(res))) return;
      const fromUserId = String(req.body?.fromUserId || '').trim();
      const toUserId = String(req.body?.toUserId || '').trim();
      const points = Math.floor(Number(req.body?.points || 0));
      const note = String(req.body?.note || '').trim() || null;

      if (!fromUserId || !toUserId) return res.status(400).json({ error: 'fromUserId and toUserId are required.' });
      if (fromUserId === toUserId) return res.status(400).json({ error: 'Cannot transfer to yourself.' });
      if (points <= 0) return res.status(400).json({ error: 'points must be positive.' });

      const fromCompany = await resolveUserCompanyId(pool, fromUserId);
      const toCompany = await resolveUserCompanyId(pool, toUserId);
      if (!fromCompany || fromCompany !== toCompany) {
        return res.status(400).json({ error: 'Both users must belong to the same family.' });
      }

      const transferId = crypto.randomUUID();
      await withTx(pool, async (client) => {
        await adjustWalletTx(client, {
          userId: fromUserId, companyId: fromCompany, currency: 'MONEY', amount: -points,
          reason: 'transfer_out', refType: 'transfer', refId: transferId, note
        });
        await adjustWalletTx(client, {
          userId: toUserId, companyId: toCompany, currency: 'MONEY', amount: points,
          reason: 'transfer_in', refType: 'transfer', refId: transferId, note
        });
        await client.query(
          `INSERT INTO "Transfer" (id, "companyId", "fromUserId", "toUserId", points, note, "createdAt")
           VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          [transferId, fromCompany, fromUserId, toUserId, points, note]
        );
      });
      await awardBadge(pool, fromUserId, fromCompany, 'GENEROUS');
      await notify(pool, toUserId, fromCompany, 'transfer_received', `Recibiste ${points} pts`, note || 'Una transferencia de otro miembro.', 'transfer', transferId);
      res.status(201).json({ id: transferId, fromUserId, toUserId, points, note });
    } catch (error: any) {
      if (error?.code === 'INSUFFICIENT_FUNDS') return res.status(400).json({ error: 'INSUFFICIENT_FUNDS' });
      res.status(500).json({ error: 'Failed to transfer points', details: error.message });
    }
  });

  // Emisión de puntos por el padre (carga puntos "de la nada")
  family.post('/wallet/mint', async (req, res) => {
    try {
      if (!(await guard(res))) return;
      const adminUserId = String(req.body?.adminUserId || '').trim();
      const targetUserId = String(req.body?.targetUserId || '').trim();
      const currency: Currency = String(req.body?.currency || 'MONEY').toUpperCase() === 'XP' ? 'XP' : 'MONEY';
      const amount = Math.floor(Number(req.body?.amount || 0));
      const note = String(req.body?.note || '').trim() || null;

      if (!adminUserId || !targetUserId) return res.status(400).json({ error: 'adminUserId and targetUserId are required.' });
      if (amount === 0) return res.status(400).json({ error: 'amount must be non-zero.' });
      if (!(await isParentUser(pool, adminUserId))) return res.status(403).json({ error: 'Only a parent can mint points.' });

      const companyId = await resolveUserCompanyId(pool, targetUserId);
      if (!companyId) return res.status(404).json({ error: 'Target user not found.' });

      const balance = await withTx(pool, (client) =>
        adjustWalletTx(client, {
          userId: targetUserId, companyId, currency, amount,
          reason: 'mint', refType: 'user', refId: adminUserId, note
        })
      );
      await notify(pool, targetUserId, companyId, 'points_minted', `Te cargaron ${amount} ${currency === 'XP' ? 'XP' : 'pts'}`, note || 'Un adulto te acreditó puntos.', 'user', adminUserId);
      res.status(201).json({ targetUserId, currency, amount, balance });
    } catch (error: any) {
      if (error?.code === 'INSUFFICIENT_FUNDS') return res.status(400).json({ error: 'INSUFFICIENT_FUNDS' });
      res.status(500).json({ error: 'Failed to mint points', details: error.message });
    }
  });

  // Descuento de puntos por el padre (penalización por situación familiar). No baja de 0.
  family.post('/wallet/penalty', async (req, res) => {
    try {
      if (!(await guard(res))) return;
      const adminUserId = String(req.body?.adminUserId || '').trim();
      const targetUserId = String(req.body?.targetUserId || '').trim();
      const currency: Currency = String(req.body?.currency || 'MONEY').toUpperCase() === 'XP' ? 'XP' : 'MONEY';
      const amount = Math.abs(Math.floor(Number(req.body?.amount || 0)));
      const reason = String(req.body?.reason || '').trim();

      if (!adminUserId || !targetUserId) return res.status(400).json({ error: 'adminUserId and targetUserId are required.' });
      if (amount <= 0) return res.status(400).json({ error: 'amount must be positive.' });
      if (!(await isParentUser(pool, adminUserId))) return res.status(403).json({ error: 'Only a parent can deduct points.' });

      const companyId = await resolveUserCompanyId(pool, targetUserId);
      if (!companyId) return res.status(404).json({ error: 'Target user not found.' });

      const col = currency === 'MONEY' ? 'moneyPoints' : 'xpPoints';
      const w = await pool.query(`SELECT "${col}" AS bal FROM "Wallet" WHERE "userId" = $1 LIMIT 1`, [targetUserId]);
      const current = Number(w.rows[0]?.bal || 0);
      const deducted = Math.min(amount, current); // no baja de 0
      const unit = currency === 'XP' ? 'XP' : 'pts';

      if (deducted > 0) {
        await withTx(pool, (client) =>
          adjustWalletTx(client, {
            userId: targetUserId, companyId, currency, amount: -deducted,
            reason: 'penalty', refType: 'user', refId: adminUserId, note: reason || null
          })
        );
      }
      await notify(pool, targetUserId, companyId, 'points_penalty', `Te descontaron ${deducted} ${unit}`, reason || 'Descuento aplicado por un adulto.', 'user', adminUserId);
      res.status(201).json({ targetUserId, currency, requested: amount, deducted });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to deduct points', details: error.message });
    }
  });

  // ═══════════════════════ Crédito / adelanto de puntos ═══════════════════════

  // El usuario pide un adelanto (dentro de su límite). Le da puntos ahora y crea deuda.
  family.post('/wallet/credit/request', async (req, res) => {
    try {
      if (!(await guard(res))) return;
      const userId = String(req.body?.userId || '').trim();
      const amount = Math.floor(Number(req.body?.amount || 0));
      if (!userId) return res.status(400).json({ error: 'userId is required.' });
      if (amount <= 0) return res.status(400).json({ error: 'amount must be positive.' });

      const companyId = await resolveUserCompanyId(pool, userId);
      if (!companyId) return res.status(404).json({ error: 'User not found.' });

      const wr = await pool.query('SELECT "creditLimit", "creditUsed" FROM "Wallet" WHERE "userId" = $1 LIMIT 1', [userId]);
      const limit = Number(wr.rows[0]?.creditLimit || 0);
      const used = Number(wr.rows[0]?.creditUsed || 0);
      const available = Math.max(0, limit - used);
      if (limit <= 0) return res.status(403).json({ error: 'NO_CREDIT', message: 'No tenés crédito habilitado.' });
      if (amount > available) return res.status(400).json({ error: 'CREDIT_LIMIT', available });

      await withTx(pool, async (client) => {
        await adjustWalletTx(client, { userId, companyId, currency: 'MONEY', amount, reason: 'credit_advance', note: 'Adelanto de puntos' });
        await client.query('UPDATE "Wallet" SET "creditUsed" = "creditUsed" + $1, "updatedAt" = NOW() WHERE "userId" = $2', [amount, userId]);
      });
      await notifyParents(pool, companyId, 'credit_requested', 'Adelanto de puntos', `Un miembro pidió ${amount} pts de adelanto.`, 'user', userId);
      res.status(201).json({ amount, creditUsed: used + amount, creditLimit: limit, creditAvailable: available - amount });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to request credit', details: error.message });
    }
  });

  // El padre fija el límite de crédito de un miembro, o de todos (sin targetUserId).
  family.post('/wallet/credit/limit', async (req, res) => {
    try {
      if (!(await guard(res))) return;
      const adminUserId = String(req.body?.adminUserId || '').trim();
      const companyId = String(req.body?.companyId || '').trim();
      const targetUserId = String(req.body?.targetUserId || '').trim();
      const limit = Math.max(0, Math.floor(Number(req.body?.limit || 0)));
      if (!(await isParentUser(pool, adminUserId))) return res.status(403).json({ error: 'Only a parent can set credit limits.' });
      if (!companyId) return res.status(400).json({ error: 'companyId is required.' });

      if (targetUserId) {
        await pool.query(
          `INSERT INTO "Wallet" (id, "userId", "companyId", "moneyPoints", "xpPoints", "creditLimit", "createdAt", "updatedAt")
           VALUES (gen_random_uuid(), $1, $2, 0, 0, $3, NOW(), NOW())
           ON CONFLICT ("userId") DO UPDATE SET "creditLimit" = $3, "updatedAt" = NOW()`,
          [targetUserId, companyId, limit]
        );
      } else {
        await pool.query(
          `INSERT INTO "Wallet" (id, "userId", "companyId", "moneyPoints", "xpPoints", "creditLimit", "createdAt", "updatedAt")
           SELECT gen_random_uuid(), u.id, u."companyId", 0, 0, $1, NOW(), NOW() FROM "User" u WHERE u."companyId" = $2
           ON CONFLICT ("userId") DO UPDATE SET "creditLimit" = $1, "updatedAt" = NOW()`,
          [limit, companyId]
        );
      }
      res.json({ success: true, limit });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to set credit limit', details: error.message });
    }
  });

  // ═══════════════════════ Retiros (canje puntos → dinero) ════════════════════

  // Solicitar retiro: snapshot de conversión + candado pedagógico. No descuenta aún.
  family.post('/wallet/withdrawals', async (req, res) => {
    try {
      if (!(await guard(res))) return;
      const userId = String(req.body?.userId || '').trim();
      const points = Math.floor(Number(req.body?.points || 0));
      if (!userId) return res.status(400).json({ error: 'userId is required.' });
      if (points <= 0) return res.status(400).json({ error: 'points must be positive.' });

      const companyId = await resolveUserCompanyId(pool, userId);
      if (!companyId) return res.status(404).json({ error: 'User not found.' });
      const config = await getFamilyConfig(pool, companyId);

      if (config.requireResponsibilitiesUpToDate && !(await responsibilitiesUpToDate(pool, userId))) {
        return res.status(423).json({ error: 'PEDAGOGICAL_LOCK', message: 'Tenés responsabilidades pendientes al día.' });
      }
      if (points < Number(config.minWithdrawalPoints || 0)) {
        return res.status(400).json({ error: 'BELOW_MIN', minWithdrawalPoints: config.minWithdrawalPoints });
      }

      const wallet = await pool.query('SELECT "moneyPoints" FROM "Wallet" WHERE "userId" = $1 LIMIT 1', [userId]);
      const money = Number(wallet.rows[0]?.moneyPoints || 0);
      if (money < points) return res.status(400).json({ error: 'INSUFFICIENT_FUNDS' });

      const pointsPerUnit = Number(config.pointsPerUnit || 100);
      const moneyAmount = pointsPerUnit > 0 ? (points / pointsPerUnit) : 0;
      const id = crypto.randomUUID();
      await pool.query(
        `INSERT INTO "Withdrawal" (id, "userId", "companyId", points, "pointsPerUnit", currency, "moneyAmount", status, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', NOW(), NOW())`,
        [id, userId, companyId, points, pointsPerUnit, config.currency, moneyAmount.toFixed(2)]
      );
      await notifyParents(pool, companyId, 'withdrawal_requested', 'Retiro solicitado', `${points} pts ≈ ${moneyAmount.toFixed(2)} ${config.currency}`, 'withdrawal', id);
      const r = await pool.query('SELECT * FROM "Withdrawal" WHERE id = $1', [id]);
      res.status(201).json(r.rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to request withdrawal', details: error.message });
    }
  });

  // Listar retiros (por usuario o por familia)
  family.get('/wallet/withdrawals', async (req, res) => {
    try {
      if (!(await guard(res))) return;
      const userId = String(req.query.userId || '').trim();
      const companyId = String(req.query.companyId || '').trim();
      const status = String(req.query.status || '').trim();
      const where: string[] = [];
      const params: any[] = [];
      if (userId) { params.push(userId); where.push(`w."userId" = $${params.length}`); }
      if (companyId) { params.push(companyId); where.push(`w."companyId" = $${params.length}`); }
      if (status) { params.push(status); where.push(`w.status = $${params.length}`); }
      const r = await pool.query(
        `SELECT w.*, u.name AS "userName", u.email AS "userEmail"
         FROM "Withdrawal" w JOIN "User" u ON u.id = w."userId"
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY w."createdAt" DESC`,
        params
      );
      res.json(r.rows);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to list withdrawals', details: error.message });
    }
  });

  // Aprobar retiro: descuenta los puntos (padre)
  family.post('/wallet/withdrawals/:id/approve', async (req, res) => {
    try {
      if (!(await guard(res))) return;
      const approverId = String(req.body?.approverId || '').trim();
      if (!(await isParentUser(pool, approverId))) return res.status(403).json({ error: 'Only a parent can approve withdrawals.' });

      const wr = await pool.query('SELECT * FROM "Withdrawal" WHERE id = $1 LIMIT 1', [req.params.id]);
      const withdrawal = wr.rows[0];
      if (!withdrawal) return res.status(404).json({ error: 'Withdrawal not found' });
      if (withdrawal.status !== 'pending') return res.status(409).json({ error: `Withdrawal is '${withdrawal.status}'.` });

      await withTx(pool, async (client) => {
        await adjustWalletTx(client, {
          userId: withdrawal.userId, companyId: withdrawal.companyId, currency: 'MONEY',
          amount: -Number(withdrawal.points), reason: 'withdrawal', refType: 'withdrawal', refId: withdrawal.id,
          note: `Retiro aprobado (${withdrawal.moneyAmount} ${withdrawal.currency})`
        });
        await client.query(
          `UPDATE "Withdrawal" SET status = 'approved', "approvedById" = $1, "approvedAt" = NOW(), "updatedAt" = NOW() WHERE id = $2`,
          [approverId || null, withdrawal.id]
        );
      });
      await awardBadge(pool, withdrawal.userId, withdrawal.companyId, 'SAVER');
      await notify(pool, withdrawal.userId, withdrawal.companyId, 'withdrawal_approved', 'Retiro aprobado ✅', `${withdrawal.moneyAmount} ${withdrawal.currency} (${withdrawal.points} pts)`, 'withdrawal', withdrawal.id);
      const out = await pool.query('SELECT * FROM "Withdrawal" WHERE id = $1', [withdrawal.id]);
      res.json(out.rows[0]);
    } catch (error: any) {
      if (error?.code === 'INSUFFICIENT_FUNDS') return res.status(400).json({ error: 'INSUFFICIENT_FUNDS' });
      res.status(500).json({ error: 'Failed to approve withdrawal', details: error.message });
    }
  });

  // Rechazar retiro (padre)
  family.post('/wallet/withdrawals/:id/reject', async (req, res) => {
    try {
      if (!(await guard(res))) return;
      const approverId = String(req.body?.approverId || '').trim();
      const reason = String(req.body?.reason || '').trim() || null;
      if (!(await isParentUser(pool, approverId))) return res.status(403).json({ error: 'Only a parent can reject withdrawals.' });
      const wr = await pool.query('SELECT status, "userId", "companyId" FROM "Withdrawal" WHERE id = $1 LIMIT 1', [req.params.id]);
      if (!wr.rows[0]) return res.status(404).json({ error: 'Withdrawal not found' });
      if (wr.rows[0].status !== 'pending') return res.status(409).json({ error: `Withdrawal is '${wr.rows[0].status}'.` });
      await pool.query(
        `UPDATE "Withdrawal" SET status = 'rejected', "approvedById" = $1, "rejectedReason" = $2, "updatedAt" = NOW() WHERE id = $3`,
        [approverId || null, reason, req.params.id]
      );
      await notify(pool, wr.rows[0].userId, wr.rows[0].companyId, 'withdrawal_rejected', 'Retiro rechazado', reason || 'El adulto rechazó tu retiro.', 'withdrawal', req.params.id);
      const out = await pool.query('SELECT * FROM "Withdrawal" WHERE id = $1', [req.params.id]);
      res.json(out.rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to reject withdrawal', details: error.message });
    }
  });

  // Cancelar retiro propio (el usuario)
  family.post('/wallet/withdrawals/:id/cancel', async (req, res) => {
    try {
      if (!(await guard(res))) return;
      const userId = String(req.body?.userId || '').trim();
      const wr = await pool.query('SELECT * FROM "Withdrawal" WHERE id = $1 LIMIT 1', [req.params.id]);
      const withdrawal = wr.rows[0];
      if (!withdrawal) return res.status(404).json({ error: 'Withdrawal not found' });
      if (withdrawal.userId !== userId) return res.status(403).json({ error: 'Not your withdrawal.' });
      if (withdrawal.status !== 'pending') return res.status(409).json({ error: `Withdrawal is '${withdrawal.status}'.` });
      await pool.query(`UPDATE "Withdrawal" SET status = 'cancelled', "updatedAt" = NOW() WHERE id = $1`, [req.params.id]);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to cancel withdrawal', details: error.message });
    }
  });

  // ═══════════════════════ Configuración de la familia ════════════════════════
  family.get('/config', async (req, res) => {
    try {
      if (!(await guard(res))) return;
      const companyId = String(req.query.companyId || '').trim();
      if (!companyId) return res.status(400).json({ error: 'companyId is required.' });
      res.json(await getFamilyConfig(pool, companyId));
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to load family config', details: error.message });
    }
  });

  family.put('/config', async (req, res) => {
    try {
      if (!(await guard(res))) return;
      const companyId = String(req.query.companyId || req.body?.companyId || '').trim();
      const editorId = String(req.body?.editorId || '').trim();
      if (!companyId) return res.status(400).json({ error: 'companyId is required.' });
      if (editorId && !(await isParentUser(pool, editorId))) {
        return res.status(403).json({ error: 'Only a parent can edit family config.' });
      }
      const current = await getFamilyConfig(pool, companyId);
      const pointsPerUnit = req.body?.pointsPerUnit != null ? Math.max(1, Math.floor(Number(req.body.pointsPerUnit))) : current.pointsPerUnit;
      const currency = req.body?.currency != null ? String(req.body.currency) : current.currency;
      const minWithdrawalPoints = req.body?.minWithdrawalPoints != null ? Math.max(0, Math.floor(Number(req.body.minWithdrawalPoints))) : current.minWithdrawalPoints;
      const requireResp = req.body?.requireResponsibilitiesUpToDate != null ? Boolean(req.body.requireResponsibilitiesUpToDate) : current.requireResponsibilitiesUpToDate;
      await pool.query(
        `UPDATE "FamilyConfig" SET "pointsPerUnit" = $1, currency = $2, "minWithdrawalPoints" = $3, "requireResponsibilitiesUpToDate" = $4, "updatedAt" = NOW() WHERE "companyId" = $5`,
        [pointsPerUnit, currency, minWithdrawalPoints, requireResp, companyId]
      );
      res.json(await getFamilyConfig(pool, companyId));
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update family config', details: error.message });
    }
  });

  // ═══════════════════════ Metas familiares ═══════════════════════════════════
  family.get('/goals', async (req, res) => {
    try {
      if (!(await guard(res))) return;
      const companyId = String(req.query.companyId || '').trim();
      const status = String(req.query.status || '').trim();
      const where: string[] = [];
      const params: any[] = [];
      if (companyId) { params.push(companyId); where.push(`"companyId" = $${params.length}`); }
      if (status) { params.push(status); where.push(`status = $${params.length}`); }
      const r = await pool.query(
        `SELECT * FROM "FamilyGoal" ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY "createdAt" DESC`,
        params
      );
      res.json(r.rows);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to list goals', details: error.message });
    }
  });

  family.post('/goals', async (req, res) => {
    try {
      if (!(await guard(res))) return;
      const companyId = String(req.body?.companyId || '').trim();
      const title = String(req.body?.title || '').trim();
      const createdById = String(req.body?.createdById || '').trim();
      if (!companyId || !title || !createdById) {
        return res.status(400).json({ error: 'companyId, title and createdById are required.' });
      }
      const id = crypto.randomUUID();
      await pool.query(
        `INSERT INTO "FamilyGoal" (id, "companyId", title, description, "targetXp", "currentXp", status, "imageUrl", "createdById", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, 0, 'Active', $6, $7, NOW(), NOW())`,
        [id, companyId, title, String(req.body?.description || '').trim() || null, Math.max(0, Math.floor(Number(req.body?.targetXp || 0))), String(req.body?.imageUrl || '').trim() || null, createdById]
      );
      const r = await pool.query('SELECT * FROM "FamilyGoal" WHERE id = $1', [id]);
      res.status(201).json(r.rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to create goal', details: error.message });
    }
  });

  family.put('/goals/:id', async (req, res) => {
    try {
      if (!(await guard(res))) return;
      const gr = await pool.query('SELECT * FROM "FamilyGoal" WHERE id = $1 LIMIT 1', [req.params.id]);
      const goal = gr.rows[0];
      if (!goal) return res.status(404).json({ error: 'Goal not found' });
      const title = req.body?.title != null ? String(req.body.title).trim() : goal.title;
      const description = req.body?.description != null ? (String(req.body.description).trim() || null) : goal.description;
      const targetXp = req.body?.targetXp != null ? Math.max(0, Math.floor(Number(req.body.targetXp))) : goal.targetXp;
      const status = req.body?.status != null ? String(req.body.status) : goal.status;
      const imageUrl = req.body?.imageUrl != null ? (String(req.body.imageUrl).trim() || null) : goal.imageUrl;
      await pool.query(
        `UPDATE "FamilyGoal" SET title = $1, description = $2, "targetXp" = $3, status = $4, "imageUrl" = $5, "updatedAt" = NOW() WHERE id = $6`,
        [title, description, targetXp, status, imageUrl, req.params.id]
      );
      const r = await pool.query('SELECT * FROM "FamilyGoal" WHERE id = $1', [req.params.id]);
      res.json(r.rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update goal', details: error.message });
    }
  });

  family.delete('/goals/:id', async (req, res) => {
    try {
      if (!(await guard(res))) return;
      await pool.query('DELETE FROM "FamilyGoal" WHERE id = $1', [req.params.id]);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to delete goal', details: error.message });
    }
  });

  // Estadística de colaboración (para el gráfico de torta) — enfoque colectivo
  family.get('/goals/:id/stats', async (req, res) => {
    try {
      if (!(await guard(res))) return;
      const gr = await pool.query('SELECT * FROM "FamilyGoal" WHERE id = $1 LIMIT 1', [req.params.id]);
      const goal = gr.rows[0];
      if (!goal) return res.status(404).json({ error: 'Goal not found' });
      const cr = await pool.query(
        `SELECT c."userId", COALESCE(u.name, u.email) AS "userName", u.avatar, SUM(c.xp)::int AS xp
         FROM "FamilyGoalContribution" c JOIN "User" u ON u.id = c."userId"
         WHERE c."goalId" = $1
         GROUP BY c."userId", u.name, u.email, u.avatar
         ORDER BY xp DESC`,
        [req.params.id]
      );
      const totalXp = cr.rows.reduce((sum: number, row: any) => sum + Number(row.xp || 0), 0);
      const contributors = cr.rows.map((row: any) => ({
        userId: row.userId,
        userName: row.userName,
        avatar: row.avatar,
        xp: Number(row.xp || 0),
        pct: totalXp > 0 ? Math.round((Number(row.xp || 0) / totalXp) * 100) : 0
      }));
      res.json({
        goal,
        totalXp,
        targetXp: Number(goal.targetXp || 0),
        progress: Number(goal.targetXp || 0) > 0 ? Math.min(1, Number(goal.currentXp || 0) / Number(goal.targetXp)) : 0,
        contributors
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to load goal stats', details: error.message });
    }
  });

  // Racha + insignias (ganadas y por ganar)
  family.get('/gamification', async (req, res) => {
    try {
      if (!(await guard(res))) return;
      const userId = String(req.query.userId || '').trim();
      if (!userId) return res.status(400).json({ error: 'userId is required.' });
      const streakRow = await pool.query('SELECT "currentStreak", "longestStreak" FROM "UserStreak" WHERE "userId" = $1', [userId]);
      const badges = await pool.query(
        `SELECT b.code, b.name, b.description, b.icon, b."sortOrder",
                ub."awardedAt" IS NOT NULL AS earned, ub."awardedAt"
         FROM "Badge" b
         LEFT JOIN "UserBadge" ub ON ub."badgeId" = b.id AND ub."userId" = $1
         ORDER BY b."sortOrder" ASC`,
        [userId]
      );
      res.json({
        streak: {
          currentStreak: Number(streakRow.rows[0]?.currentStreak || 0),
          longestStreak: Number(streakRow.rows[0]?.longestStreak || 0)
        },
        badges: badges.rows
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to load gamification', details: error.message });
    }
  });

  // ═══════════════════════ Notificaciones ═════════════════════════════════════
  family.get('/notifications', async (req, res) => {
    try {
      if (!(await guard(res))) return;
      const userId = String(req.query.userId || '').trim();
      if (!userId) return res.status(400).json({ error: 'userId is required.' });
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
      const items = await pool.query('SELECT * FROM "Notification" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT $2', [userId, limit]);
      const unread = await pool.query('SELECT COUNT(*)::int AS c FROM "Notification" WHERE "userId" = $1 AND read = FALSE', [userId]);
      res.json({ items: items.rows, unread: Number(unread.rows[0]?.c || 0) });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to load notifications', details: error.message });
    }
  });

  family.post('/notifications/read', async (req, res) => {
    try {
      if (!(await guard(res))) return;
      const userId = String(req.body?.userId || '').trim();
      if (!userId) return res.status(400).json({ error: 'userId is required.' });
      const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : null;
      if (ids && ids.length) {
        await pool.query('UPDATE "Notification" SET read = TRUE WHERE "userId" = $1 AND id = ANY($2)', [userId, ids]);
      } else {
        await pool.query('UPDATE "Notification" SET read = TRUE WHERE "userId" = $1 AND read = FALSE', [userId]);
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to mark notifications read', details: error.message });
    }
  });

  // ═══════════════════════ Perfil del usuario ═════════════════════════════════
  family.put('/profile', async (req, res) => {
    try {
      if (!(await guard(res))) return;
      const userId = String(req.body?.userId || '').trim();
      if (!userId) return res.status(400).json({ error: 'userId is required.' });
      const sets: string[] = [];
      const params: any[] = [];
      let i = 1;
      if (req.body?.name != null) {
        const name = String(req.body.name).trim();
        const parts = name.split(' ').filter(Boolean);
        const firstName = parts.shift() || name;
        const lastName = parts.join(' ') || null;
        sets.push(`name = $${i++}`); params.push(name);
        sets.push(`"firstName" = $${i++}`); params.push(firstName);
        sets.push(`"lastName" = $${i++}`); params.push(lastName);
      }
      if (req.body?.avatar !== undefined) {
        sets.push(`avatar = $${i++}`);
        params.push(req.body.avatar ? String(req.body.avatar) : null);
      }
      if (sets.length) {
        params.push(userId);
        await pool.query(`UPDATE "User" SET ${sets.join(', ')}, "updatedAt" = NOW() WHERE id = $${i}`, params);
      }
      const u = await pool.query('SELECT id, email, name, "firstName", "lastName", avatar, "companyId", role FROM "User" WHERE id = $1', [userId]);
      res.json(u.rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update profile', details: error.message });
    }
  });

  // ═══════════════════════ Tareas recurrentes ════════════════════════════════
  family.get('/recurrences', async (req, res) => {
    try {
      if (!(await guard(res))) return;
      const companyId = String(req.query.companyId || '').trim();
      if (!companyId) return res.status(400).json({ error: 'companyId is required.' });
      const r = await pool.query(
        `SELECT rc.*, u.name AS "ownerName" FROM "TaskRecurrence" rc
         LEFT JOIN "User" u ON u.id = rc."ownerId"
         WHERE rc."companyId" = $1 ORDER BY rc."createdAt" DESC`,
        [companyId]
      );
      res.json(r.rows);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to list recurrences', details: error.message });
    }
  });

  family.post('/recurrences', async (req, res) => {
    try {
      if (!(await guard(res))) return;
      const companyId = String(req.body?.companyId || '').trim();
      const createdById = String(req.body?.createdById || '').trim();
      const title = String(req.body?.title || '').trim();
      const rrule = String(req.body?.rrule || '').trim();
      const startDate = String(req.body?.startDate || '').trim();
      if (!companyId || !createdById || !title || !rrule || !startDate) {
        return res.status(400).json({ error: 'companyId, createdById, title, rrule and startDate are required.' });
      }
      const id = crypto.randomUUID();
      await pool.query(
        `INSERT INTO "TaskRecurrence" (id, "companyId", "createdById", "ownerId", title, description, "taskKind", "rewardPoints", "rewardXp", "familyGoalId", subtasks, rrule, "startDate", "endDate", active, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13::date, $14::date, TRUE, NOW(), NOW())`,
        [
          id, companyId, createdById,
          String(req.body?.ownerId || '').trim() || null,
          title,
          String(req.body?.description || '').trim() || null,
          String(req.body?.taskKind || 'Responsibility') === 'Paid' ? 'Paid' : 'Responsibility',
          Math.max(0, Math.floor(Number(req.body?.rewardPoints) || 0)),
          Math.max(0, Math.floor(Number(req.body?.rewardXp) || 0)),
          String(req.body?.familyGoalId || '').trim() || null,
          JSON.stringify(Array.isArray(req.body?.subtasks) ? req.body.subtasks : []),
          rrule,
          startDate,
          String(req.body?.endDate || '').trim() || null
        ]
      );
      // Genera ya la primera instancia si corresponde a hoy.
      await generateDueRecurrences(pool, companyId);
      const out = await pool.query('SELECT * FROM "TaskRecurrence" WHERE id = $1', [id]);
      res.status(201).json(out.rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to create recurrence', details: error.message });
    }
  });

  family.post('/recurrences/:id/toggle', async (req, res) => {
    try {
      if (!(await guard(res))) return;
      await pool.query('UPDATE "TaskRecurrence" SET active = NOT active, "updatedAt" = NOW() WHERE id = $1', [req.params.id]);
      const out = await pool.query('SELECT * FROM "TaskRecurrence" WHERE id = $1', [req.params.id]);
      if (!out.rows[0]) return res.status(404).json({ error: 'Recurrence not found' });
      res.json(out.rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to toggle recurrence', details: error.message });
    }
  });

  family.delete('/recurrences/:id', async (req, res) => {
    try {
      if (!(await guard(res))) return;
      await pool.query('DELETE FROM "TaskRecurrence" WHERE id = $1', [req.params.id]);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to delete recurrence', details: error.message });
    }
  });

  // ═══════════════════════ Web Push ══════════════════════════════════════════
  family.get('/push/vapid', async (_req, res) => {
    res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || null });
  });

  family.post('/push/subscribe', async (req, res) => {
    try {
      if (!(await guard(res))) return;
      const userId = String(req.body?.userId || '').trim();
      const sub = req.body?.subscription;
      const endpoint = String(sub?.endpoint || '').trim();
      const p256dh = String(sub?.keys?.p256dh || '').trim();
      const auth = String(sub?.keys?.auth || '').trim();
      if (!userId || !endpoint || !p256dh || !auth) return res.status(400).json({ error: 'userId and a valid subscription are required.' });
      await pool.query(
        `INSERT INTO "PushSubscription" (id, "userId", endpoint, p256dh, auth, "createdAt")
         VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())
         ON CONFLICT (endpoint) DO UPDATE SET "userId" = $1, p256dh = $3, auth = $4`,
        [userId, endpoint, p256dh, auth]
      );
      res.status(201).json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to subscribe', details: error.message });
    }
  });

  family.post('/push/unsubscribe', async (req, res) => {
    try {
      if (!(await guard(res))) return;
      const endpoint = String(req.body?.endpoint || '').trim();
      if (endpoint) await pool.query('DELETE FROM "PushSubscription" WHERE endpoint = $1', [endpoint]);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to unsubscribe', details: error.message });
    }
  });

  // ═══════════════════════ ABM de miembros de la familia (solo padres) ════════

  family.get('/members', async (req, res) => {
    try {
      if (!(await guard(res))) return;
      const companyId = String(req.query.companyId || '').trim();
      if (!companyId) return res.status(400).json({ error: 'companyId is required.' });
      const r = await pool.query(
        `SELECT u.id, u.email, u.name, u.avatar, u.role, u.active, u."createdAt", rl.name AS "roleName"
         FROM "User" u LEFT JOIN "Role" rl ON rl.id = u."roleId"
         WHERE u."companyId" = $1
         ORDER BY u."createdAt" ASC`,
        [companyId]
      );
      res.json(
        r.rows.map((row: any) => ({
          id: row.id,
          email: row.email,
          name: row.name,
          avatar: row.avatar,
          isParent: computeIsParent(row.role, row.roleName),
          active: row.active !== false,
          createdAt: row.createdAt
        }))
      );
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to list members', details: error.message });
    }
  });

  family.post('/members', async (req, res) => {
    try {
      if (!(await guard(res))) return;
      const adminUserId = String(req.body?.adminUserId || '').trim();
      const companyId = String(req.body?.companyId || '').trim();
      const name = String(req.body?.name || '').trim();
      const email = String(req.body?.email || '').trim().toLowerCase();
      const password = String(req.body?.password || '');
      const isParent = Boolean(req.body?.isParent);

      if (!adminUserId || !companyId || !name || !email || !password) {
        return res.status(400).json({ error: 'adminUserId, companyId, name, email and password are required.' });
      }
      if (password.length < 6) return res.status(400).json({ error: 'PASSWORD_TOO_SHORT' });
      if (!(await isParentUser(pool, adminUserId))) return res.status(403).json({ error: 'Only a parent can create members.' });

      const existing = await pool.query('SELECT id FROM "User" WHERE LOWER(email) = $1 LIMIT 1', [email]);
      if (existing.rows[0]) return res.status(409).json({ error: 'EMAIL_TAKEN' });

      const roleId = isParent ? null : await ensureChildRoleId(pool);
      const legacyRole = isParent ? 'Administrator' : 'Member';
      const parts = name.split(' ').filter(Boolean);
      const firstName = parts.shift() || name;
      const lastName = parts.join(' ') || null;
      const id = crypto.randomUUID();

      await pool.query(
        `INSERT INTO "User" (id, email, name, "firstName", "lastName", password, role, "roleId", "companyId", active, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, NOW(), NOW())`,
        [id, email, name, firstName, lastName, hashPasswordForUser(password), legacyRole, roleId, companyId]
      );

      res.status(201).json({ id, name, email, avatar: null, isParent, active: true, createdAt: new Date().toISOString() });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to create member', details: error.message });
    }
  });

  family.put('/members/:id', async (req, res) => {
    try {
      if (!(await guard(res))) return;
      const adminUserId = String(req.body?.adminUserId || '').trim();
      if (!(await isParentUser(pool, adminUserId))) return res.status(403).json({ error: 'Only a parent can edit members.' });

      const targetId = req.params.id;
      if (targetId === adminUserId && req.body?.active === false) {
        return res.status(400).json({ error: 'SELF_DEACTIVATE' });
      }

      const cur = await pool.query(
        `SELECT u.*, rl.name AS "roleName" FROM "User" u LEFT JOIN "Role" rl ON rl.id = u."roleId" WHERE u.id = $1 LIMIT 1`,
        [targetId]
      );
      const current = cur.rows[0];
      if (!current) return res.status(404).json({ error: 'Member not found' });

      const wasParent = computeIsParent(current.role, current.roleName);
      const nextIsParent = req.body?.isParent != null ? Boolean(req.body.isParent) : wasParent;
      const nextActive = req.body?.active != null ? Boolean(req.body.active) : current.active !== false;

      // Salvaguarda: la familia siempre necesita al menos un padre activo.
      if (wasParent && (!nextIsParent || !nextActive)) {
        const others = await pool.query(
          `SELECT COUNT(*)::int AS c FROM "User" u LEFT JOIN "Role" rl ON rl.id = u."roleId"
           WHERE u."companyId" = $1 AND u.id <> $2 AND u.active IS NOT FALSE
             AND (LOWER(u.role) IN ('administrator','admin','parent','padre','madre','tutor')
                  OR LOWER(COALESCE(rl.name, '')) ~ 'parent|padre|madre|tutor|adult')`,
          [current.companyId, targetId]
        );
        if (Number(others.rows[0]?.c || 0) === 0) {
          return res.status(400).json({ error: 'FAMILY_NEEDS_PARENT' });
        }
      }

      const name = req.body?.name != null ? String(req.body.name).trim() : current.name;
      const email = req.body?.email != null ? String(req.body.email).trim().toLowerCase() : current.email;
      if (email !== current.email) {
        const dup = await pool.query('SELECT id FROM "User" WHERE LOWER(email) = $1 AND id <> $2 LIMIT 1', [email, targetId]);
        if (dup.rows[0]) return res.status(409).json({ error: 'EMAIL_TAKEN' });
      }

      let roleId = current.roleId;
      let legacyRole = current.role;
      if (req.body?.isParent != null && nextIsParent !== wasParent) {
        if (nextIsParent) {
          roleId = null;
          legacyRole = 'Administrator';
        } else {
          roleId = await ensureChildRoleId(pool);
          legacyRole = 'Member';
        }
      }

      const newPassword = req.body?.newPassword ? String(req.body.newPassword) : null;
      if (newPassword && newPassword.length < 6) return res.status(400).json({ error: 'PASSWORD_TOO_SHORT' });

      const parts = name.split(' ').filter(Boolean);
      const firstName = parts.shift() || name;
      const lastName = parts.join(' ') || null;

      const sets = ['name=$1', '"firstName"=$2', '"lastName"=$3', 'email=$4', 'role=$5', '"roleId"=$6', 'active=$7', '"updatedAt"=NOW()'];
      const params: any[] = [name, firstName, lastName, email, legacyRole, roleId, nextActive];
      let idx = params.length + 1;
      if (newPassword) {
        sets.push(`password=$${idx}`);
        params.push(hashPasswordForUser(newPassword));
        idx += 1;
      }
      // Al desactivar, o al resetear la contraseña, se corta la sesión activa.
      if (!nextActive || newPassword) sets.push('"sessionToken"=NULL', '"sessionTokenExpiresAt"=NULL');
      params.push(targetId);
      await pool.query(`UPDATE "User" SET ${sets.join(', ')} WHERE id = $${idx}`, params);

      const out = await pool.query('SELECT id, name, email, avatar, active, "createdAt" FROM "User" WHERE id = $1', [targetId]);
      res.json({ ...out.rows[0], isParent: nextIsParent });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update member', details: error.message });
    }
  });

  // ═══════════════════════ Dashboard de indicadores (solo padres) ═════════════
  family.get('/stats', async (req, res) => {
    try {
      if (!(await guard(res))) return;
      const companyId = String(req.query.companyId || '').trim();
      if (!companyId) return res.status(400).json({ error: 'companyId is required.' });

      const [pointsGivenR, topEarnersR, mostTasksR, pendingTasksR, pendingWithdrawalsR, byLifecycleR, overdueR, totalsR, goalsR] = await Promise.all([
        pool.query(
          `SELECT currency,
             COALESCE(SUM(amount) FILTER (WHERE "createdAt" >= date_trunc('month', NOW())), 0)::int AS month,
             COALESCE(SUM(amount) FILTER (WHERE "createdAt" >= date_trunc('year', NOW())), 0)::int AS year
           FROM "WalletLedger"
           WHERE "companyId" = $1 AND amount > 0 AND reason IN ('task_reward', 'mint')
           GROUP BY currency`,
          [companyId]
        ),
        pool.query(
          `SELECT wl."userId", COALESCE(u.name, u.email) AS "userName", u.avatar,
             COALESCE(SUM(wl.amount) FILTER (WHERE wl.currency = 'MONEY'), 0)::int AS money,
             COALESCE(SUM(wl.amount) FILTER (WHERE wl.currency = 'XP'), 0)::int AS xp
           FROM "WalletLedger" wl JOIN "User" u ON u.id = wl."userId"
           WHERE wl."companyId" = $1 AND wl.amount > 0 AND wl.reason IN ('task_reward', 'mint')
           GROUP BY wl."userId", u.name, u.email, u.avatar
           ORDER BY (COALESCE(SUM(wl.amount) FILTER (WHERE wl.currency = 'MONEY'), 0) + COALESCE(SUM(wl.amount) FILTER (WHERE wl.currency = 'XP'), 0)) DESC
           LIMIT 5`,
          [companyId]
        ),
        pool.query(
          `SELECT COALESCE(t."takenById", t."ownerId") AS "userId", COALESCE(u.name, u.email) AS "userName", u.avatar, COUNT(*)::int AS count
           FROM "Task" t JOIN "User" u ON u.id = COALESCE(t."takenById", t."ownerId")
           WHERE t."companyId" = $1 AND t.lifecycle = 'finalizada'
           GROUP BY COALESCE(t."takenById", t."ownerId"), u.name, u.email, u.avatar
           ORDER BY count DESC
           LIMIT 5`,
          [companyId]
        ),
        pool.query(`SELECT COUNT(*)::int AS c FROM "Task" WHERE "companyId" = $1 AND lifecycle = 'done'`, [companyId]),
        pool.query(`SELECT COUNT(*)::int AS c FROM "Withdrawal" WHERE "companyId" = $1 AND status = 'pending'`, [companyId]),
        pool.query(`SELECT lifecycle, COUNT(*)::int AS c FROM "Task" WHERE "companyId" = $1 GROUP BY lifecycle`, [companyId]),
        pool.query(
          `SELECT COUNT(*)::int AS c FROM "Task" WHERE "companyId" = $1 AND lifecycle <> 'finalizada' AND "dueDate" IS NOT NULL AND "dueDate" < NOW()`,
          [companyId]
        ),
        pool.query(`SELECT COUNT(*)::int AS c FROM "Task" WHERE "companyId" = $1`, [companyId]),
        pool.query(
          `SELECT id, title, "currentXp", "targetXp" FROM "FamilyGoal" WHERE "companyId" = $1 AND status = 'Active' ORDER BY "createdAt" DESC`,
          [companyId]
        )
      ]);

      const pointsGiven = { month: { money: 0, xp: 0 }, year: { money: 0, xp: 0 } };
      for (const row of pointsGivenR.rows) {
        const bucket = row.currency === 'XP' ? 'xp' : 'money';
        pointsGiven.month[bucket] = row.month;
        pointsGiven.year[bucket] = row.year;
      }

      const byLifecycle: Record<string, number> = { creada: 0, en_espera: 0, doing: 0, done: 0, finalizada: 0 };
      for (const row of byLifecycleR.rows) byLifecycle[row.lifecycle] = row.c;

      const totalTasks = totalsR.rows[0]?.c || 0;

      res.json({
        pointsGiven,
        topEarners: topEarnersR.rows,
        mostTasksTaken: mostTasksR.rows,
        pendingApprovals: { tasks: pendingTasksR.rows[0]?.c || 0, withdrawals: pendingWithdrawalsR.rows[0]?.c || 0 },
        tasksByLifecycle: byLifecycle,
        totalTasks,
        finalizedTasks: byLifecycle.finalizada,
        overdueTasks: overdueR.rows[0]?.c || 0,
        goals: goalsR.rows
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to load stats', details: error.message });
    }
  });

  // ═══════════════════════ Invitaciones (link para sumar miembros) ════════════
  // Nota: crear/revocar requiere ser padre autenticado (mismo patrón que el resto de
  // /tasks/family/*). La validación y el alta con el código lo hace un usuario NO
  // autenticado todavía, por eso esos dos endpoints públicos viven en apps/api/src/server.ts
  // (fuera de /api/tasks, que exige sesión) y no acá.

  family.get('/invites', async (req, res) => {
    try {
      if (!(await guard(res))) return;
      const companyId = String(req.query.companyId || '').trim();
      if (!companyId) return res.status(400).json({ error: 'companyId is required.' });
      const r = await pool.query(
        `SELECT id, code, "isParent", "maxUses", "usesCount", "expiresAt", active, "createdAt"
         FROM "FamilyInvite" WHERE "companyId" = $1 ORDER BY "createdAt" DESC`,
        [companyId]
      );
      res.json(r.rows);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to list invites', details: error.message });
    }
  });

  family.post('/invites', async (req, res) => {
    try {
      if (!(await guard(res))) return;
      const adminUserId = String(req.body?.adminUserId || '').trim();
      const companyId = String(req.body?.companyId || '').trim();
      const isParentInvite = Boolean(req.body?.isParent);
      if (!adminUserId || !companyId) return res.status(400).json({ error: 'adminUserId and companyId are required.' });
      if (!(await isParentUser(pool, adminUserId))) return res.status(403).json({ error: 'Only a parent can create invites.' });

      const code = crypto.randomBytes(5).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000); // 7 días
      const id = crypto.randomUUID();
      await pool.query(
        `INSERT INTO "FamilyInvite" (id, "companyId", code, "createdById", "isParent", "maxUses", "usesCount", "expiresAt", active, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, NULL, 0, $6, TRUE, NOW(), NOW())`,
        [id, companyId, code, adminUserId, isParentInvite, expiresAt]
      );
      res.status(201).json({ code, isParent: isParentInvite, expiresAt });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to create invite', details: error.message });
    }
  });

  family.post('/invites/:code/revoke', async (req, res) => {
    try {
      if (!(await guard(res))) return;
      const adminUserId = String(req.body?.adminUserId || '').trim();
      if (!(await isParentUser(pool, adminUserId))) return res.status(403).json({ error: 'Only a parent can revoke invites.' });
      await pool.query('UPDATE "FamilyInvite" SET active = FALSE, "updatedAt" = NOW() WHERE code = $1', [req.params.code]);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to revoke invite', details: error.message });
    }
  });

  router.use('/family', family);
}
