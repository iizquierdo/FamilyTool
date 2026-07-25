import express from 'express';
import crypto from 'crypto';
import type { Pool } from 'pg';
import {
  fetchMergedItemsByCategoryCodes,
  resolveCompanyContextForRequest,
  resolveTenantAuthContext
} from '@sinapsis/module-sdk-server';
import { reserveNextReference } from '@sinapsis/module-sdk-server';

interface ExpenseModuleContext { app: express.Express; pool: Pool; }

const MODULE_CODE = 'EXPENSES';
const REF_MODULE = 'EXPENSES';
const REF_EXPENSE = 'EXPENSE';
const REF_RECUR = 'EXP_RECUR';

const CATEGORY_CODES = ['EXPENSE_CATEGORY', 'EXPENSE_STATUS', 'EXPENSE_PAYMENT_METHOD', 'EXPENSE_CURRENCY', 'EXPENSE_RECURRENCE'];
const RECURRENCE = new Set(['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Yearly']);

const hasOwn = (obj: any, key: string) => Object.prototype.hasOwnProperty.call(obj || {}, key);
const toIso = (value: any) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const toPos = (value: any) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const toNum = (value: any, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const norm = (value: any, fallback = '') => String(value || '').trim() || fallback;
const curr = (value: any, fallback = 'USD') => String(value || '').trim().toUpperCase() || fallback;
const roundMoney = (value: number) => Math.round(value * 100) / 100;

const normFreq = (value: any) => {
  const raw = norm(value);
  const found = Array.from(RECURRENCE).find((it) => it.toLowerCase() === raw.toLowerCase());
  return found || 'Monthly';
};

const addStep = (base: Date, frequency: string, interval: number) => {
  const d = new Date(base);
  if (frequency === 'Daily') d.setDate(d.getDate() + interval);
  else if (frequency === 'Weekly') d.setDate(d.getDate() + (7 * interval));
  else if (frequency === 'Monthly') d.setMonth(d.getMonth() + interval);
  else if (frequency === 'Quarterly') d.setMonth(d.getMonth() + (3 * interval));
  else d.setFullYear(d.getFullYear() + interval);
  return d.toISOString();
};

const nextCodeForCompany = (pool: Pool) => (companyId: string) => (code: string) => {
  const cid = norm(companyId);
  if (!cid) throw new Error('companyId is required to generate expense codes');
  return reserveNextReference(pool, { companyId: cid, module: REF_MODULE, code });
};

const getBaseCurrency = async (pool: Pool, companyId?: string) => {
  const cid = norm(companyId);
  if (cid) {
    const c = await pool.query('SELECT "baseCurrency" FROM "Company" WHERE id = $1 LIMIT 1', [cid]);
    const bc = curr(c.rows[0]?.baseCurrency || '', '');
    if (bc) return bc;
  }

  const org = await pool.query('SELECT "baseCurrency" FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1');
  return curr(org.rows[0]?.baseCurrency || 'USD', 'USD');
};

const getRate = async (pool: Pool, args: { companyId?: string; baseCurrency: string; quoteCurrency: string; effectiveAt?: string | null; manual?: number | null; }) => {
  if (args.baseCurrency === args.quoteCurrency) return 1;
  if (args.manual && args.manual > 0) return args.manual;

  const result = await pool.query(
    `SELECT rate FROM "ExpenseExchangeRate"
     WHERE "baseCurrency" = $1 AND "quoteCurrency" = $2
       AND ($3::text = '' OR "companyId" = $3 OR "companyId" IS NULL)
       AND "effectiveDate" <= $4::timestamp
     ORDER BY CASE WHEN "companyId" = $3 THEN 0 ELSE 1 END, "effectiveDate" DESC, "createdAt" DESC
     LIMIT 1`,
    [args.baseCurrency, args.quoteCurrency, norm(args.companyId), args.effectiveAt || new Date().toISOString()]
  );

  const rate = Number(result.rows[0]?.rate || 0);
  return rate > 0 ? rate : null;
};

const expenseByIdFactory = (pool: Pool) => async (id: string) => {
  const result = await pool.query(
    `SELECT e.*, owner.name AS "ownerName", creator.name AS "creatorName", r.title AS "recurringTitle"
     FROM "Expense" e
     JOIN "User" owner ON owner.id = e."ownerId"
     JOIN "User" creator ON creator.id = e."createdById"
     LEFT JOIN "ExpenseRecurring" r ON r.id = e."recurringId"
     WHERE e.id = $1 LIMIT 1`,
    [id]
  );
  return result.rows[0] || null;
};

const recurringByIdFactory = (pool: Pool) => async (id: string) => {
  const result = await pool.query(
    `SELECT r.*, owner.name AS "ownerName", creator.name AS "creatorName"
     FROM "ExpenseRecurring" r
     JOIN "User" owner ON owner.id = r."ownerId"
     JOIN "User" creator ON creator.id = r."createdById"
     WHERE r.id = $1 LIMIT 1`,
    [id]
  );
  return result.rows[0] || null;
};

export default function registerExpensesModule({ app, pool }: ExpenseModuleContext) {
  const router = express.Router();
  const nextCodeFactory = nextCodeForCompany(pool);
  const getExpenseById = expenseByIdFactory(pool);
  const getRecurringById = recurringByIdFactory(pool);

  const ensureActive = async () => {
    const mod = await pool.query('SELECT status FROM "SystemModule" WHERE code = $1 LIMIT 1', [MODULE_CODE]);
    return String(mod.rows[0]?.status || '') === 'Active';
  };


  router.get('/openapi.json', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Expenses module is not active.' });
      const serverUrl = `${req.protocol}://${req.get('host')}`;
      res.json({
        openapi: '3.0.3',
        info: { title: 'Sinapsis Expenses API', version: '1.0.0', description: 'Expenses module endpoints.' },
        tags: [{ name: 'Expenses', description: 'Expense management endpoints' }],
        servers: [{ url: serverUrl }],
        paths: {
          '/api/expenses/meta': { get: { tags: ['Expenses'], summary: 'Get expenses metadata', responses: { '200': { description: 'Expenses metadata' } } } },
          '/api/expenses': { get: { tags: ['Expenses'], summary: 'List expenses', responses: { '200': { description: 'Expenses list' } } }, post: { tags: ['Expenses'], summary: 'Create expense', responses: { '201': { description: 'Expense created' } } } },
          '/api/expenses/{id}': { get: { tags: ['Expenses'], summary: 'Get expense by id', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Expense detail' } } }, put: { tags: ['Expenses'], summary: 'Update expense', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Expense updated' } } }, delete: { tags: ['Expenses'], summary: 'Delete expense', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Expense deleted' } } } },
          '/api/expenses/exchange-rates': { get: { tags: ['Expenses'], summary: 'List exchange rates', responses: { '200': { description: 'Rates list' } } }, post: { tags: ['Expenses'], summary: 'Create exchange rate', responses: { '201': { description: 'Rate created' } } } },
          '/api/expenses/exchange-rates/{id}': { put: { tags: ['Expenses'], summary: 'Update exchange rate', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Rate updated' } } }, delete: { tags: ['Expenses'], summary: 'Delete exchange rate', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Rate deleted' } } } },
          '/api/expenses/recurring': { get: { tags: ['Expenses'], summary: 'List recurring expenses', responses: { '200': { description: 'Recurring list' } } }, post: { tags: ['Expenses'], summary: 'Create recurring expense', responses: { '201': { description: 'Recurring created' } } } },
          '/api/expenses/recurring/{id}': { put: { tags: ['Expenses'], summary: 'Update recurring expense', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Recurring updated' } } }, delete: { tags: ['Expenses'], summary: 'Delete recurring expense', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Recurring deleted' } } } },
          '/api/expenses/recurring/{id}/run': { post: { tags: ['Expenses'], summary: 'Run recurring expense now', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Recurring run executed' } } } }
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to build Expenses OpenAPI document', details: error.message });
    }
  });

  router.get('/docs', async (req, res) => {
    if (!(await ensureActive())) return res.status(409).json({ error: 'Expenses module is not active.' });
    const html = `<!doctype html>
<html><head><meta charset="utf-8" /><title>Sinapsis Expenses API Docs</title><link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" /></head><body>
<div id="swagger-ui"></div><script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script><script>
window.ui = SwaggerUIBundle({ url: '/api/expenses/openapi.json', dom_id: '#swagger-ui', deepLinking: true });
</script></body></html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  });

  router.get('/meta', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Expenses module is not active.' });

      const companyId = norm(req.query.companyId);
      const userId = norm(req.query.userId);
      const baseCurrency = await getBaseCurrency(pool, companyId);

      const ctx = userId ? await resolveTenantAuthContext(pool, userId) : null;
      const organizationId = ctx?.organizationId || '';
      const companyCtx =
        ctx && companyId ? await resolveCompanyContextForRequest(pool, ctx, companyId) : null;

      const catMap = await fetchMergedItemsByCategoryCodes(pool, {
        codes: CATEGORY_CODES,
        organizationId,
        companyIdContext: companyCtx,
        activeOnly: true
      });

      const users = await pool.query(
        companyId
          ? 'SELECT id, name, "firstName", "lastName", email, avatar FROM "User" WHERE "companyId" = $1 ORDER BY "createdAt" ASC'
          : 'SELECT id, name, "firstName", "lastName", email, avatar FROM "User" ORDER BY "createdAt" ASC',
        companyId ? [companyId] : []
      );

      const rates = await pool.query(
        companyId
          ? `SELECT DISTINCT ON ("quoteCurrency") id, "baseCurrency", "quoteCurrency", rate, "effectiveDate", source, "companyId"
             FROM "ExpenseExchangeRate"
             WHERE "baseCurrency" = $1 AND ("companyId" = $2 OR "companyId" IS NULL)
             ORDER BY "quoteCurrency", CASE WHEN "companyId" = $2 THEN 0 ELSE 1 END, "effectiveDate" DESC, "createdAt" DESC`
          : `SELECT DISTINCT ON ("quoteCurrency") id, "baseCurrency", "quoteCurrency", rate, "effectiveDate", source, "companyId"
             FROM "ExpenseExchangeRate"
             WHERE "baseCurrency" = $1
             ORDER BY "quoteCurrency", "effectiveDate" DESC, "createdAt" DESC`,
        companyId ? [baseCurrency, companyId] : [baseCurrency]
      );

      const grouped = {
        expenseCategories: [] as any[],
        statuses: [] as any[],
        paymentMethods: [] as any[],
        currencies: [] as any[],
        recurrence: [] as any[]
      };

      grouped.expenseCategories = catMap.get('EXPENSE_CATEGORY') || [];
      grouped.statuses = catMap.get('EXPENSE_STATUS') || [];
      grouped.paymentMethods = catMap.get('EXPENSE_PAYMENT_METHOD') || [];
      grouped.currencies = catMap.get('EXPENSE_CURRENCY') || [];
      grouped.recurrence = catMap.get('EXPENSE_RECURRENCE') || [];

      if (!grouped.currencies.some((x) => x.name === baseCurrency)) {
        grouped.currencies.unshift({ id: `BASE-${baseCurrency}`, name: baseCurrency });
      }

      res.json({
        baseCurrency,
        categories: grouped,
        latestRates: rates.rows,
        users: users.rows.map((u: any) => ({ ...u, name: u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email }))
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to load expenses metadata', details: error.message });
    }
  });
  router.get('/exchange-rates', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Expenses module is not active.' });

      const companyId = norm(req.query.companyId);
      const baseCurrency = curr(req.query.baseCurrency || '', '');
      const quoteCurrency = curr(req.query.quoteCurrency || '', '');

      const where: string[] = [];
      const params: any[] = [];

      if (companyId) {
        params.push(companyId);
        where.push(`("companyId" = $${params.length} OR "companyId" IS NULL)`);
      }
      if (baseCurrency) {
        params.push(baseCurrency);
        where.push(`"baseCurrency" = $${params.length}`);
      }
      if (quoteCurrency) {
        params.push(quoteCurrency);
        where.push(`"quoteCurrency" = $${params.length}`);
      }

      const sql = `SELECT * FROM "ExpenseExchangeRate" ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY "effectiveDate" DESC, "createdAt" DESC`;
      const result = await pool.query(sql, params);
      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch exchange rates', details: error.message });
    }
  });

  router.post('/exchange-rates', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Expenses module is not active.' });

      const baseCurrency = curr(req.body?.baseCurrency || '', '');
      const quoteCurrency = curr(req.body?.quoteCurrency || '', '');
      const rate = toPos(req.body?.rate);
      if (!baseCurrency || !quoteCurrency || !rate) return res.status(400).json({ error: 'baseCurrency, quoteCurrency and positive rate are required.' });
      if (baseCurrency === quoteCurrency) return res.status(400).json({ error: 'baseCurrency and quoteCurrency must be different.' });

      const id = crypto.randomUUID();
      const companyId = norm(req.body?.companyId) || null;
      const effectiveDate = toIso(req.body?.effectiveDate) || new Date().toISOString();
      const source = norm(req.body?.source, 'Manual');
      const createdById = norm(req.body?.createdById) || null;

      await pool.query(
        'INSERT INTO "ExpenseExchangeRate" (id, "companyId", "baseCurrency", "quoteCurrency", rate, "effectiveDate", source, "createdById", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6::timestamp, $7, $8, NOW(), NOW())',
        [id, companyId, baseCurrency, quoteCurrency, rate, effectiveDate, source, createdById]
      );

      const created = await pool.query('SELECT * FROM "ExpenseExchangeRate" WHERE id = $1', [id]);
      res.status(201).json(created.rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to create exchange rate', details: error.message });
    }
  });

  router.put('/exchange-rates/:id', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Expenses module is not active.' });

      const existing = await pool.query('SELECT * FROM "ExpenseExchangeRate" WHERE id = $1 LIMIT 1', [req.params.id]);
      const row = existing.rows[0];
      if (!row) return res.status(404).json({ error: 'Exchange rate not found.' });

      const baseCurrency = curr(req.body?.baseCurrency || row.baseCurrency || '', '');
      const quoteCurrency = curr(req.body?.quoteCurrency || row.quoteCurrency || '', '');
      const rate = hasOwn(req.body, 'rate') ? toPos(req.body?.rate) : toPos(row.rate);
      if (!baseCurrency || !quoteCurrency || !rate) return res.status(400).json({ error: 'baseCurrency, quoteCurrency and positive rate are required.' });
      if (baseCurrency === quoteCurrency) return res.status(400).json({ error: 'baseCurrency and quoteCurrency must be different.' });

      const companyId = hasOwn(req.body, 'companyId') ? (norm(req.body?.companyId) || null) : row.companyId;
      const effectiveDate = hasOwn(req.body, 'effectiveDate') ? (toIso(req.body?.effectiveDate) || row.effectiveDate) : row.effectiveDate;
      const source = hasOwn(req.body, 'source') ? norm(req.body?.source, 'Manual') : row.source;

      await pool.query(
        'UPDATE "ExpenseExchangeRate" SET "companyId" = $1, "baseCurrency" = $2, "quoteCurrency" = $3, rate = $4, "effectiveDate" = $5::timestamp, source = $6, "updatedAt" = NOW() WHERE id = $7',
        [companyId, baseCurrency, quoteCurrency, rate, effectiveDate, source, req.params.id]
      );

      const updated = await pool.query('SELECT * FROM "ExpenseExchangeRate" WHERE id = $1', [req.params.id]);
      res.json(updated.rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update exchange rate', details: error.message });
    }
  });

  router.delete('/exchange-rates/:id', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Expenses module is not active.' });
      await pool.query('DELETE FROM "ExpenseExchangeRate" WHERE id = $1', [req.params.id]);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to delete exchange rate', details: error.message });
    }
  });

  router.get('/recurring', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Expenses module is not active.' });

      const companyId = norm(req.query.companyId);
      const status = norm(req.query.status);
      const search = norm(req.query.search);

      const where: string[] = [];
      const params: any[] = [];

      if (companyId) {
        params.push(companyId);
        where.push(`r."companyId" = $${params.length}`);
      }
      if (status) {
        params.push(status);
        where.push(`r.status = $${params.length}`);
      }
      if (search) {
        params.push(`%${search}%`);
        where.push(`(LOWER(r.title) LIKE LOWER($${params.length}) OR LOWER(COALESCE(r.description, '')) LIKE LOWER($${params.length}) OR LOWER(r.code) LIKE LOWER($${params.length}))`);
      }

      const result = await pool.query(
        `SELECT r.*, owner.name AS "ownerName", creator.name AS "creatorName"
         FROM "ExpenseRecurring" r
         JOIN "User" owner ON owner.id = r."ownerId"
         JOIN "User" creator ON creator.id = r."createdById"
         ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY r."nextRunAt" ASC NULLS LAST, r."createdAt" DESC`,
        params
      );

      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch recurring expenses', details: error.message });
    }
  });
  router.post('/recurring', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Expenses module is not active.' });

      const title = norm(req.body?.title);
      const companyId = norm(req.body?.companyId);
      const createdById = norm(req.body?.createdById);
      const ownerId = norm(req.body?.ownerId, createdById);
      const amount = toPos(req.body?.amount);
      const currency = curr(req.body?.currency || '', '');

      if (!title || !companyId || !createdById || !ownerId || !amount || !currency) {
        return res.status(400).json({ error: 'title, amount, currency, companyId, createdById and ownerId are required.' });
      }

      const frequency = normFreq(req.body?.frequency);
      const interval = Math.max(1, toNum(req.body?.interval, 1));
      const startDate = toIso(req.body?.startDate) || new Date().toISOString();
      const endDate = toIso(req.body?.endDate);
      const nextRunAt = toIso(req.body?.nextRunAt) || startDate;

      const id = crypto.randomUUID();
      const code = await nextCodeFactory(companyId)(REF_RECUR);

      await pool.query(
        `INSERT INTO "ExpenseRecurring" (id, code, title, description, vendor, amount, currency, frequency, "interval", "startDate", "endDate", "nextRunAt", "lastRunAt", status, category, "paymentMethod", notes, "companyId", "createdById", "ownerId", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::timestamp, $11::timestamp, $12::timestamp, NULL, $13, $14, $15, $16, $17, $18, $19, NOW(), NOW())`,
        [
          id,
          code,
          title,
          norm(req.body?.description) || null,
          norm(req.body?.vendor) || null,
          amount,
          currency,
          frequency,
          interval,
          startDate,
          endDate,
          nextRunAt,
          norm(req.body?.status, 'Active'),
          norm(req.body?.category) || null,
          norm(req.body?.paymentMethod) || null,
          norm(req.body?.notes) || null,
          companyId,
          createdById,
          ownerId
        ]
      );

      const created = await getRecurringById(id);
      res.status(201).json(created);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to create recurring expense', details: error.message });
    }
  });

  router.put('/recurring/:id', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Expenses module is not active.' });

      const row = await getRecurringById(req.params.id);
      if (!row) return res.status(404).json({ error: 'Recurring expense not found.' });

      const title = hasOwn(req.body, 'title') ? norm(req.body?.title) : norm(row.title);
      const amount = hasOwn(req.body, 'amount') ? toPos(req.body?.amount) : toPos(row.amount);
      const currency = hasOwn(req.body, 'currency') ? curr(req.body?.currency || '', '') : curr(row.currency || '', '');
      if (!title || !amount || !currency) return res.status(400).json({ error: 'title, amount and currency are required.' });

      const frequency = hasOwn(req.body, 'frequency') ? normFreq(req.body?.frequency) : normFreq(row.frequency);
      const interval = hasOwn(req.body, 'interval') ? Math.max(1, toNum(req.body?.interval, 1)) : Math.max(1, toNum(row.interval, 1));
      const startDate = hasOwn(req.body, 'startDate') ? (toIso(req.body?.startDate) || toIso(row.startDate) || new Date().toISOString()) : (toIso(row.startDate) || new Date().toISOString());
      const endDate = hasOwn(req.body, 'endDate') ? toIso(req.body?.endDate) : toIso(row.endDate);
      const nextRunAt = hasOwn(req.body, 'nextRunAt') ? toIso(req.body?.nextRunAt) : (toIso(row.nextRunAt) || startDate);

      await pool.query(
        `UPDATE "ExpenseRecurring"
         SET title = $1, description = $2, vendor = $3, amount = $4, currency = $5, frequency = $6, "interval" = $7,
             "startDate" = $8::timestamp, "endDate" = $9::timestamp, "nextRunAt" = $10::timestamp, status = $11,
             category = $12, "paymentMethod" = $13, notes = $14, "ownerId" = $15, "updatedAt" = NOW()
         WHERE id = $16`,
        [
          title,
          hasOwn(req.body, 'description') ? (norm(req.body?.description) || null) : (norm(row.description) || null),
          hasOwn(req.body, 'vendor') ? (norm(req.body?.vendor) || null) : (norm(row.vendor) || null),
          amount,
          currency,
          frequency,
          interval,
          startDate,
          endDate,
          nextRunAt,
          hasOwn(req.body, 'status') ? norm(req.body?.status, 'Active') : norm(row.status, 'Active'),
          hasOwn(req.body, 'category') ? (norm(req.body?.category) || null) : (norm(row.category) || null),
          hasOwn(req.body, 'paymentMethod') ? (norm(req.body?.paymentMethod) || null) : (norm(row.paymentMethod) || null),
          hasOwn(req.body, 'notes') ? (norm(req.body?.notes) || null) : (norm(row.notes) || null),
          hasOwn(req.body, 'ownerId') ? norm(req.body?.ownerId, row.ownerId) : row.ownerId,
          row.id
        ]
      );

      const updated = await getRecurringById(row.id);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update recurring expense', details: error.message });
    }
  });

  router.post('/recurring/:id/run', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Expenses module is not active.' });

      const recurring = await getRecurringById(req.params.id);
      if (!recurring) return res.status(404).json({ error: 'Recurring expense not found.' });
      if (norm(recurring.status) !== 'Active') return res.status(409).json({ error: 'Recurring expense must be Active to generate expenses.' });

      const runAt = toIso(req.body?.runAt) || new Date().toISOString();
      const currency = curr(recurring.currency || 'USD');
      const baseCurrency = await getBaseCurrency(pool, recurring.companyId);
      const rate = await getRate(pool, {
        companyId: recurring.companyId,
        baseCurrency,
        quoteCurrency: currency,
        effectiveAt: runAt,
        manual: hasOwn(req.body, 'exchangeRate') ? toPos(req.body?.exchangeRate) : null
      });

      if (!rate) {
        return res.status(400).json({ error: `No exchange rate found for ${currency} -> ${baseCurrency}.` });
      }

      const amount = toNum(recurring.amount, 0);
      const amountBase = roundMoney(amount * rate);
      const expenseId = crypto.randomUUID();
      const code = await nextCodeFactory(norm(recurring.companyId))(REF_EXPENSE);

      await pool.query(
        `INSERT INTO "Expense" (id, code, title, description, vendor, amount, currency, "exchangeRate", "baseCurrency", "amountBase", "expenseDate", status, category, "paymentMethod", notes, "recurringId", "isRecurringGenerated", "companyId", "createdById", "ownerId", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::timestamp, $12, $13, $14, $15, $16, TRUE, $17, $18, $19, NOW(), NOW())`,
        [
          expenseId,
          code,
          norm(recurring.title),
          norm(recurring.description) || null,
          norm(recurring.vendor) || null,
          amount,
          currency,
          rate,
          baseCurrency,
          amountBase,
          runAt,
          'Paid',
          norm(recurring.category) || null,
          norm(recurring.paymentMethod) || null,
          norm(recurring.notes) || null,
          recurring.id,
          norm(recurring.companyId),
          norm(recurring.createdById),
          norm(recurring.ownerId)
        ]
      );

      const nextRunAt = addStep(new Date(runAt), normFreq(recurring.frequency), Math.max(1, toNum(recurring.interval, 1)));
      await pool.query('UPDATE "ExpenseRecurring" SET "lastRunAt" = $1::timestamp, "nextRunAt" = $2::timestamp, "updatedAt" = NOW() WHERE id = $3', [runAt, nextRunAt, recurring.id]);

      const generated = await getExpenseById(expenseId);
      res.status(201).json(generated);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to generate expense', details: error.message });
    }
  });

  router.delete('/recurring/:id', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Expenses module is not active.' });
      await pool.query('DELETE FROM "ExpenseRecurring" WHERE id = $1', [req.params.id]);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to delete recurring expense', details: error.message });
    }
  });
  router.get('/', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Expenses module is not active.' });

      const companyId = norm(req.query.companyId);
      const viewerId = norm(req.query.viewerId);
      const mode = norm(req.query.mode, 'my').toLowerCase();
      const status = norm(req.query.status);
      const currency = curr(req.query.currency || '', '');
      const search = norm(req.query.search);
      const from = toIso(req.query.from);
      const to = toIso(req.query.to);

      const where: string[] = [];
      const params: any[] = [];

      if (companyId) {
        params.push(companyId);
        where.push(`e."companyId" = $${params.length}`);
      }
      if (status) {
        params.push(status);
        where.push(`e.status = $${params.length}`);
      }
      if (currency) {
        params.push(currency);
        where.push(`e.currency = $${params.length}`);
      }
      if (search) {
        params.push(`%${search}%`);
        where.push(`(LOWER(e.title) LIKE LOWER($${params.length}) OR LOWER(COALESCE(e.description, '')) LIKE LOWER($${params.length}) OR LOWER(e.code) LIKE LOWER($${params.length}))`);
      }
      if (from) {
        params.push(from);
        where.push(`e."expenseDate" >= $${params.length}::timestamp`);
      }
      if (to) {
        params.push(to);
        where.push(`e."expenseDate" <= $${params.length}::timestamp`);
      }
      if (viewerId && mode === 'my') {
        params.push(viewerId);
        where.push(`(e."ownerId" = $${params.length} OR e."createdById" = $${params.length})`);
      }

      const result = await pool.query(
        `SELECT e.*, owner.name AS "ownerName", creator.name AS "creatorName", r.title AS "recurringTitle"
         FROM "Expense" e
         JOIN "User" owner ON owner.id = e."ownerId"
         JOIN "User" creator ON creator.id = e."createdById"
         LEFT JOIN "ExpenseRecurring" r ON r.id = e."recurringId"
         ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY e."expenseDate" DESC, e."createdAt" DESC`,
        params
      );

      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch expenses', details: error.message });
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Expenses module is not active.' });
      const expense = await getExpenseById(req.params.id);
      if (!expense) return res.status(404).json({ error: 'Expense not found.' });
      res.json(expense);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch expense', details: error.message });
    }
  });

  router.post('/', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Expenses module is not active.' });

      const title = norm(req.body?.title);
      const companyId = norm(req.body?.companyId);
      const createdById = norm(req.body?.createdById);
      const ownerId = norm(req.body?.ownerId, createdById);
      const amount = toPos(req.body?.amount);
      const currency = curr(req.body?.currency || '', '');
      if (!title || !companyId || !createdById || !ownerId || !amount || !currency) {
        return res.status(400).json({ error: 'title, amount, currency, companyId, createdById and ownerId are required.' });
      }

      const expenseDate = toIso(req.body?.expenseDate) || new Date().toISOString();
      const baseCurrency = curr(req.body?.baseCurrency || await getBaseCurrency(pool, companyId));
      const rate = await getRate(pool, {
        companyId,
        baseCurrency,
        quoteCurrency: currency,
        effectiveAt: expenseDate,
        manual: hasOwn(req.body, 'exchangeRate') ? toPos(req.body?.exchangeRate) : null
      });

      if (!rate) {
        return res.status(400).json({ error: `No exchange rate found for ${currency} -> ${baseCurrency}. Provide exchangeRate or create it in exchange rates.` });
      }

      const id = crypto.randomUUID();
      const code = await nextCodeFactory(companyId)(REF_EXPENSE);
      const amountBase = roundMoney(amount * rate);

      await pool.query(
        `INSERT INTO "Expense" (id, code, title, description, vendor, amount, currency, "exchangeRate", "baseCurrency", "amountBase", "expenseDate", status, category, "paymentMethod", notes, "recurringId", "isRecurringGenerated", "companyId", "createdById", "ownerId", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::timestamp, $12, $13, $14, $15, $16, $17, $18, $19, $20, NOW(), NOW())`,
        [
          id,
          code,
          title,
          norm(req.body?.description) || null,
          norm(req.body?.vendor) || null,
          amount,
          currency,
          rate,
          baseCurrency,
          amountBase,
          expenseDate,
          norm(req.body?.status, 'Paid'),
          norm(req.body?.category) || null,
          norm(req.body?.paymentMethod) || null,
          norm(req.body?.notes) || null,
          norm(req.body?.recurringId) || null,
          Boolean(req.body?.isRecurringGenerated),
          companyId,
          createdById,
          ownerId
        ]
      );

      const created = await getExpenseById(id);
      res.status(201).json(created);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to create expense', details: error.message });
    }
  });

  router.put('/:id', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Expenses module is not active.' });

      const row = await getExpenseById(req.params.id);
      if (!row) return res.status(404).json({ error: 'Expense not found.' });

      const title = hasOwn(req.body, 'title') ? norm(req.body?.title) : norm(row.title);
      const amount = hasOwn(req.body, 'amount') ? toPos(req.body?.amount) : toPos(row.amount);
      const currency = hasOwn(req.body, 'currency') ? curr(req.body?.currency || '', '') : curr(row.currency || '', '');
      if (!title || !amount || !currency) return res.status(400).json({ error: 'title, amount and currency are required.' });

      const companyId = norm(row.companyId);
      const expenseDate = hasOwn(req.body, 'expenseDate') ? (toIso(req.body?.expenseDate) || toIso(row.expenseDate) || new Date().toISOString()) : (toIso(row.expenseDate) || new Date().toISOString());
      const baseCurrency = hasOwn(req.body, 'baseCurrency') ? curr(req.body?.baseCurrency || '', '') : curr(row.baseCurrency || await getBaseCurrency(pool, companyId));

      const changedCurrency = currency !== String(row.currency || '') || baseCurrency !== String(row.baseCurrency || '');
      let rate: number | null = null;
      if (currency === baseCurrency) rate = 1;
      else if (hasOwn(req.body, 'exchangeRate')) rate = toPos(req.body?.exchangeRate);
      else if (!changedCurrency && toPos(row.exchangeRate)) rate = toPos(row.exchangeRate);
      else rate = await getRate(pool, { companyId, baseCurrency, quoteCurrency: currency, effectiveAt: expenseDate, manual: null });

      if (!rate) {
        return res.status(400).json({ error: `No exchange rate found for ${currency} -> ${baseCurrency}. Provide exchangeRate or create it in exchange rates.` });
      }

      const amountBase = roundMoney(amount * rate);

      await pool.query(
        `UPDATE "Expense"
         SET title = $1, description = $2, vendor = $3, amount = $4, currency = $5, "exchangeRate" = $6, "baseCurrency" = $7, "amountBase" = $8,
             "expenseDate" = $9::timestamp, status = $10, category = $11, "paymentMethod" = $12, notes = $13, "ownerId" = $14, "recurringId" = $15,
             "isRecurringGenerated" = $16, "updatedAt" = NOW()
         WHERE id = $17`,
        [
          title,
          hasOwn(req.body, 'description') ? (norm(req.body?.description) || null) : (norm(row.description) || null),
          hasOwn(req.body, 'vendor') ? (norm(req.body?.vendor) || null) : (norm(row.vendor) || null),
          amount,
          currency,
          rate,
          baseCurrency,
          amountBase,
          expenseDate,
          hasOwn(req.body, 'status') ? norm(req.body?.status, 'Paid') : norm(row.status, 'Paid'),
          hasOwn(req.body, 'category') ? (norm(req.body?.category) || null) : (norm(row.category) || null),
          hasOwn(req.body, 'paymentMethod') ? (norm(req.body?.paymentMethod) || null) : (norm(row.paymentMethod) || null),
          hasOwn(req.body, 'notes') ? (norm(req.body?.notes) || null) : (norm(row.notes) || null),
          hasOwn(req.body, 'ownerId') ? norm(req.body?.ownerId, row.ownerId) : row.ownerId,
          hasOwn(req.body, 'recurringId') ? (norm(req.body?.recurringId) || null) : (norm(row.recurringId) || null),
          hasOwn(req.body, 'isRecurringGenerated') ? Boolean(req.body?.isRecurringGenerated) : Boolean(row.isRecurringGenerated),
          row.id
        ]
      );

      const updated = await getExpenseById(row.id);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update expense', details: error.message });
    }
  });

  router.delete('/:id', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Expenses module is not active.' });
      await pool.query('DELETE FROM "Expense" WHERE id = $1', [req.params.id]);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to delete expense', details: error.message });
    }
  });

  app.use('/api/expenses', router);

  return { basePath: '/api/expenses', openapiPath: '/api/expenses/openapi.json', docsPath: '/api/expenses/docs' };
}



