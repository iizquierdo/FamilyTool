import express from 'express';
import crypto from 'crypto';
import type { Pool } from 'pg';
import {
  fetchMergedItemsByCategoryCodes,
  resolveCompanyContextForRequest,
  resolveTenantAuthContext
} from '@sinapsis/module-sdk-server';
import { reserveNextReference } from '@sinapsis/module-sdk-server';
import { registerFamilyRoutes, expireStaleTasks, generateDueRecurrences } from './family';

interface TaskModuleContext {
  app: express.Express;
  pool: Pool;
}

const TASK_MODULE_CODE = 'TASKS';
const TASK_REF_MODULE = 'TASKS';
const TASK_REF_CODE = 'TASKS';

const toNullableIsoDate = (value: any) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const normalizeTaskShares = (value: any): string[] => {
  if (!Array.isArray(value)) return [];
  const set = new Set<string>();
  for (const raw of value) {
    const id = String(raw || '').trim();
    if (id) set.add(id);
  }
  return Array.from(set);
};

const buildTaskByIdFetcher = (pool: Pool) => async (taskId: string) => {
  const result = await pool.query(`
    SELECT
      t.*,
      owner.name as "ownerName",
      owner.email as "ownerEmail",
      creator.name as "creatorName",
      creator.email as "creatorEmail",
      COALESCE(array_remove(array_agg(ts."userId"), NULL), '{}') as "sharedUserIds"
    FROM "Task" t
    JOIN "User" owner ON owner.id = t."ownerId"
    JOIN "User" creator ON creator.id = t."createdById"
    LEFT JOIN "TaskShare" ts ON ts."taskId" = t.id
    WHERE t.id = $1
    GROUP BY t.id, owner.name, owner.email, creator.name, creator.email
    LIMIT 1
  `, [taskId]);

  const task = result.rows[0] || null;
  if (task) {
    const subs = await pool.query(
      'SELECT id, title, description, points, "sortOrder", "doneByChild", approved FROM "TaskSubtask" WHERE "taskId" = $1 ORDER BY "sortOrder" ASC, "createdAt" ASC',
      [taskId]
    );
    task.subtasks = subs.rows;
  }
  return task;
};

const nextTaskCodeForCompany = (pool: Pool) => (companyId: string) =>
  reserveNextReference(pool, { companyId, module: TASK_REF_MODULE, code: TASK_REF_CODE });

export default function registerTasksModule({ app, pool }: TaskModuleContext) {
  const router = express.Router();
  const getTaskById = buildTaskByIdFetcher(pool);
  const nextTaskCode = nextTaskCodeForCompany(pool);

  const ensureActive = async () => {
    const mod = await pool.query('SELECT status FROM "SystemModule" WHERE code = $1 LIMIT 1', [TASK_MODULE_CODE]);
    return String(mod.rows[0]?.status || '') === 'Active';
  };

  // FamilyTool: registra rutas de economía, billetera, metas y ciclo de vida.
  registerFamilyRoutes(router, pool, { getTaskById, ensureActive });


  router.get('/openapi.json', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Task module is not active.' });
      const serverUrl = `${req.protocol}://${req.get('host')}`;
      res.json({
        openapi: '3.0.3',
        info: { title: 'Sinapsis Tasks API', version: '1.0.0', description: 'Tasks module endpoints.' },
        tags: [{ name: 'Tasks', description: 'Tasks management endpoints' }],
        servers: [{ url: serverUrl }],
        paths: {
          '/api/tasks/meta': { get: { tags: ['Tasks'], summary: 'Get tasks metadata', responses: { '200': { description: 'Tasks metadata' } } } },
          '/api/tasks': { get: { tags: ['Tasks'], summary: 'List tasks', responses: { '200': { description: 'Tasks list' } } }, post: { tags: ['Tasks'], summary: 'Create task', responses: { '201': { description: 'Task created' } } } },
          '/api/tasks/{id}': { get: { tags: ['Tasks'], summary: 'Get task by id', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Task detail' } } }, put: { tags: ['Tasks'], summary: 'Update task', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Task updated' } } }, delete: { tags: ['Tasks'], summary: 'Delete task', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Task deleted' } } } },
          '/api/tasks/{id}/status': { patch: { tags: ['Tasks'], summary: 'Update task status', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Task status updated' } } } }
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to build Tasks OpenAPI document', details: error.message });
    }
  });

  router.get('/docs', async (req, res) => {
    if (!(await ensureActive())) return res.status(409).json({ error: 'Task module is not active.' });
    const html = `<!doctype html>
<html><head><meta charset="utf-8" /><title>Sinapsis Tasks API Docs</title><link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" /></head><body>
<div id="swagger-ui"></div><script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script><script>
window.ui = SwaggerUIBundle({ url: '/api/tasks/openapi.json', dom_id: '#swagger-ui', deepLinking: true });
</script></body></html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  });

  router.get('/meta', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Task module is not active.' });

      const companyId = String(req.query.companyId || '').trim();
      const userId = String(req.query.userId || '').trim();
      const ctx = userId ? await resolveTenantAuthContext(pool, userId) : null;
      const organizationId = ctx?.organizationId || '';
      const companyCtx =
        ctx && companyId ? await resolveCompanyContextForRequest(pool, ctx, companyId) : null;

      const catMap = await fetchMergedItemsByCategoryCodes(pool, {
        codes: ['TASK_TYPE', 'TASK_STATUS', 'TASK_PRIORITY'],
        organizationId,
        companyIdContext: companyCtx,
        activeOnly: true
      });

      const usersResult = await pool.query(
        companyId
          ? 'SELECT id, name, "firstName", "lastName", email, avatar, "companyId" FROM "User" WHERE "companyId" = $1 ORDER BY "createdAt" ASC'
          : 'SELECT id, name, "firstName", "lastName", email, avatar, "companyId" FROM "User" ORDER BY "createdAt" ASC',
        companyId ? [companyId] : []
      );

      const categories = {
        types: catMap.get('TASK_TYPE') || [],
        statuses: catMap.get('TASK_STATUS') || [],
        priorities: catMap.get('TASK_PRIORITY') || []
      };

      res.json({
        users: usersResult.rows.map((u: any) => ({
          ...u,
          name: u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email
        })),
        categories
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to load tasks metadata', details: error.message });
    }
  });

  router.get('/', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Task module is not active.' });

      const companyId = String(req.query.companyId || '').trim();
      // FamilyTool: genera instancias de tareas recurrentes que ya vencieron su ocurrencia.
      if (companyId) await generateDueRecurrences(pool, companyId);
      // Vence las tareas cuyo countdown expiró (vuelven a 'creada').
      await expireStaleTasks(pool);

      const viewerId = String(req.query.viewerId || '').trim();
      const mode = String(req.query.mode || 'my').toLowerCase();
      const status = String(req.query.status || '').trim();
      const priority = String(req.query.priority || '').trim();
      const search = String(req.query.search || '').trim();
      const taskKind = String(req.query.taskKind || '').trim();
      const lifecycle = String(req.query.lifecycle || '').trim();
      const from = toNullableIsoDate(req.query.from);
      const to = toNullableIsoDate(req.query.to);

      const where: string[] = [];
      const params: any[] = [];

      if (companyId) {
        params.push(companyId);
        where.push(`t."companyId" = $${params.length}`);
      }
      if (status) {
        params.push(status);
        where.push(`t."status" = $${params.length}`);
      }
      if (taskKind) {
        params.push(taskKind);
        where.push(`t."taskKind" = $${params.length}`);
      }
      if (lifecycle) {
        params.push(lifecycle);
        where.push(`t."lifecycle" = $${params.length}`);
      }
      if (priority) {
        params.push(priority);
        where.push(`t."priority" = $${params.length}`);
      }
      if (search) {
        params.push(`%${search}%`);
        where.push(`(LOWER(t.title) LIKE LOWER($${params.length}) OR LOWER(COALESCE(t.description, '')) LIKE LOWER($${params.length}) OR LOWER(t.code) LIKE LOWER($${params.length}))`);
      }
      if (from) {
        params.push(from);
        where.push(`COALESCE(t."startDate", t."dueDate", t."createdAt") >= $${params.length}::timestamp`);
      }
      if (to) {
        params.push(to);
        where.push(`COALESCE(t."dueDate", t."startDate", t."createdAt") <= $${params.length}::timestamp`);
      }

      if (viewerId && mode === 'my') {
        params.push(viewerId);
        const idx = params.length;
        where.push(`(t."ownerId" = $${idx} OR t."createdById" = $${idx} OR EXISTS (SELECT 1 FROM "TaskShare" ts1 WHERE ts1."taskId" = t.id AND ts1."userId" = $${idx}))`);
      }
      if (viewerId && mode === 'shared') {
        params.push(viewerId);
        const idx = params.length;
        where.push(`EXISTS (SELECT 1 FROM "TaskShare" ts1 WHERE ts1."taskId" = t.id AND ts1."userId" = $${idx})`);
      }

      const sql = `
        SELECT
          t.*,
          owner.name as "ownerName",
          owner.email as "ownerEmail",
          creator.name as "creatorName",
          creator.email as "creatorEmail",
          COALESCE(array_remove(array_agg(ts."userId"), NULL), '{}') as "sharedUserIds"
        FROM "Task" t
        JOIN "User" owner ON owner.id = t."ownerId"
        JOIN "User" creator ON creator.id = t."createdById"
        LEFT JOIN "TaskShare" ts ON ts."taskId" = t.id
        ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
        GROUP BY t.id, owner.name, owner.email, creator.name, creator.email
        ORDER BY t."dueDate" ASC NULLS LAST, t."createdAt" DESC
      `;

      const result = await pool.query(sql, params);
      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch tasks', details: error.message });
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Task module is not active.' });
      const task = await getTaskById(req.params.id);
      if (!task) return res.status(404).json({ error: 'Task not found' });
      res.json(task);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch task', details: error.message });
    }
  });

  router.post('/', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Task module is not active.' });

      const title = String(req.body?.title || '').trim();
      const createdById = String(req.body?.createdById || '').trim();
      const ownerId = String(req.body?.ownerId || '').trim() || createdById;
      const companyId = String(req.body?.companyId || '').trim();

      if (!title || !createdById || !ownerId || !companyId) {
        return res.status(400).json({ error: 'title, createdById, ownerId and companyId are required.' });
      }

      const shareWith = normalizeTaskShares(req.body?.shareWith || []);
      const code = await nextTaskCode(companyId);
      const id = crypto.randomUUID();

      // FamilyTool: tipo de tarea, recompensas y ciclo de vida.
      const taskKind = String(req.body?.taskKind || 'Responsibility') === 'Paid' ? 'Paid' : 'Responsibility';
      const rewardPoints = Math.max(0, Math.floor(Number(req.body?.rewardPoints || 0)));
      const rewardXp = Math.max(0, Math.floor(Number(req.body?.rewardXp || 0)));
      const availableUntil = toNullableIsoDate(req.body?.availableUntil);
      const familyGoalId = String(req.body?.familyGoalId || '').trim() || null;
      // Si viene availableUntil, la tarea nace publicada (en_espera); si no, queda 'creada'.
      const lifecycle = String(req.body?.lifecycle || '').trim() || (availableUntil ? 'en_espera' : 'creada');

      await pool.query(
        `INSERT INTO "Task" (id, code, title, description, status, priority, category, "startDate", "dueDate", "completedAt", visibility, "companyId", "createdById", "ownerId",
           "taskKind", "rewardPoints", "rewardXp", lifecycle, "availableUntil", "familyGoalId", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamp, $9::timestamp, $10::timestamp, $11, $12, $13, $14,
           $15, $16, $17, $18, $19::timestamp, $20, NOW(), NOW())`,
        [
          id,
          code,
          title,
          String(req.body?.description || '').trim() || null,
          String(req.body?.status || 'Todo'),
          String(req.body?.priority || 'Medium'),
          String(req.body?.category || '').trim() || null,
          toNullableIsoDate(req.body?.startDate),
          toNullableIsoDate(req.body?.dueDate),
          toNullableIsoDate(req.body?.completedAt),
          shareWith.length > 0 ? 'Shared' : 'Private',
          companyId,
          createdById,
          ownerId,
          taskKind,
          rewardPoints,
          rewardXp,
          lifecycle,
          availableUntil,
          familyGoalId
        ]
      );

      for (const userId of shareWith) {
        if (userId === ownerId || userId === createdById) continue;
        await pool.query(
          'INSERT INTO "TaskShare" (id, "taskId", "userId", "createdAt") VALUES ($1, $2, $3, NOW()) ON CONFLICT ("taskId", "userId") DO NOTHING',
          [crypto.randomUUID(), id, userId]
        );
      }

      // FamilyTool: subtareas con puntos propios.
      const subtasks = Array.isArray(req.body?.subtasks) ? req.body.subtasks : [];
      let order = 0;
      for (const sub of subtasks) {
        const subTitle = String(sub?.title || '').trim();
        if (!subTitle) continue;
        await pool.query(
          `INSERT INTO "TaskSubtask" (id, "taskId", title, description, points, "sortOrder", "doneByChild", approved, "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, FALSE, NULL, NOW(), NOW())`,
          [crypto.randomUUID(), id, subTitle, String(sub?.description || '').trim() || null, Math.max(0, Math.floor(Number(sub?.points || 0))), order]
        );
        order += 1;
      }

      const task = await getTaskById(id);
      res.status(201).json(task);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to create task', details: error.message });
    }
  });

  // FamilyTool: un usuario crea su propia actividad no paga, auto-asignada.
  // Nace en 'doing' (ya tomada por él mismo) y sin puntos: el padre/madre los
  // determina al validar (por defecto 0). No admite subtareas ni pago en $.
  router.post('/self', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Task module is not active.' });

      const userId = String(req.body?.userId || '').trim();
      const companyId = String(req.body?.companyId || '').trim();
      const title = String(req.body?.title || '').trim();

      if (!userId || !companyId || !title) {
        return res.status(400).json({ error: 'userId, companyId and title are required.' });
      }

      const code = await nextTaskCode(companyId);
      const id = crypto.randomUUID();

      await pool.query(
        `INSERT INTO "Task" (id, code, title, description, status, priority, visibility, "companyId", "createdById", "ownerId",
           "taskKind", "rewardPoints", "rewardXp", lifecycle, "takenById", "takenAt", "selfCreated", "dueDate", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, 'Todo', 'Medium', 'Private', $5, $6, $6,
           'Responsibility', 0, 0, 'doing', $6, NOW(), TRUE, $7::timestamp, NOW(), NOW())`,
        [id, code, title, String(req.body?.description || '').trim() || null, companyId, userId, toNullableIsoDate(req.body?.dueDate)]
      );

      const task = await getTaskById(id);
      res.status(201).json(task);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to create activity', details: error.message });
    }
  });

  router.put('/:id', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Task module is not active.' });

      const taskId = String(req.params.id || '').trim();
      const existing = await getTaskById(taskId);
      if (!existing) return res.status(404).json({ error: 'Task not found' });

      const title = String(req.body?.title || existing.title || '').trim();
      const ownerId = String(req.body?.ownerId || existing.ownerId || '').trim();

      if (!title || !ownerId) {
        return res.status(400).json({ error: 'title and ownerId are required.' });
      }

      const shareWith = normalizeTaskShares(req.body?.shareWith || existing.sharedUserIds || []);

      await pool.query(
        `UPDATE "Task"
         SET title = $1,
             description = $2,
             status = $3,
             priority = $4,
             category = $5,
             "startDate" = $6::timestamp,
             "dueDate" = $7::timestamp,
             "completedAt" = $8::timestamp,
             visibility = $9,
             "ownerId" = $10,
             "updatedAt" = NOW()
         WHERE id = $11`,
        [
          title,
          String(req.body?.description || '').trim() || null,
          String(req.body?.status || existing.status || 'Todo'),
          String(req.body?.priority || existing.priority || 'Medium'),
          String(req.body?.category || '').trim() || null,
          toNullableIsoDate(req.body?.startDate),
          toNullableIsoDate(req.body?.dueDate),
          toNullableIsoDate(req.body?.completedAt),
          shareWith.length > 0 ? 'Shared' : 'Private',
          ownerId,
          taskId
        ]
      );

      await pool.query('DELETE FROM "TaskShare" WHERE "taskId" = $1', [taskId]);
      for (const userId of shareWith) {
        if (userId === ownerId || userId === existing.createdById) continue;
        await pool.query(
          'INSERT INTO "TaskShare" (id, "taskId", "userId", "createdAt") VALUES ($1, $2, $3, NOW()) ON CONFLICT ("taskId", "userId") DO NOTHING',
          [crypto.randomUUID(), taskId, userId]
        );
      }

      const task = await getTaskById(taskId);
      res.json(task);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update task', details: error.message });
    }
  });

  router.patch('/:id/status', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Task module is not active.' });

      const status = String(req.body?.status || '').trim();
      if (!status) return res.status(400).json({ error: 'status is required.' });

      await pool.query(
        'UPDATE "Task" SET status = $1, "updatedAt" = NOW(), "completedAt" = CASE WHEN $1 = $2 THEN NOW() ELSE "completedAt" END WHERE id = $3',
        [status, 'Done', req.params.id]
      );

      const task = await getTaskById(req.params.id);
      if (!task) return res.status(404).json({ error: 'Task not found' });
      res.json(task);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update task status', details: error.message });
    }
  });

  router.delete('/:id', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Task module is not active.' });
      await pool.query('DELETE FROM "Task" WHERE id = $1', [req.params.id]);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to delete task', details: error.message });
    }
  });

  app.use('/api/tasks', router);

  return { basePath: '/api/tasks', openapiPath: '/api/tasks/openapi.json', docsPath: '/api/tasks/docs' };
}



