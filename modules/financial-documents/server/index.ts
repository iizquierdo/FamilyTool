import express from 'express';
import crypto from 'crypto';
import type { Pool } from 'pg';
import {
  fetchMergedCategoryItems,
  resolveCompanyContextForRequest,
  resolveTenantAuthContext
} from '@sinapsis/module-sdk-server';
import { reserveNextReference } from '@sinapsis/module-sdk-server';

interface FinancialDocumentsModuleContext {
  app: express.Express;
  pool: Pool;
}

const MODULE_CODE = 'FIN_DOCS';
const REFERENCE_MODULE = 'FIN_DOCS';

const TYPE_TO_REF_CODE: Record<string, { code: string; prefix: string }> = {
  Invoice: { code: 'INVOICE', prefix: 'INV-' },
  'Credit Memo': { code: 'CREDIT_MEMO', prefix: 'CRM-' },
  'Debit Memo': { code: 'DEBIT_MEMO', prefix: 'DBM-' },
  'Purchase Order': { code: 'PURCHASE_ORDER', prefix: 'PO-' },
  Receipt: { code: 'RECEIPT', prefix: 'RCP-' },
  'Delivery Note': { code: 'DELIVERY_NOTE', prefix: 'DLN-' }
};

const toNullableIsoDate = (value: any) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const toMoney = (value: any) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
};

const normalizeType = (value: any) => {
  const raw = String(value || '').trim();
  if (!raw) return 'Invoice';
  const byLower = Object.keys(TYPE_TO_REF_CODE).find((key) => key.toLowerCase() === raw.toLowerCase());
  return byLower || raw;
};

const normalizeItems = (value: any): Array<{ description: string; quantity: number; unitPrice: number; total: number; sortOrder: number }> => {
  if (!Array.isArray(value)) return [];

  const items: Array<{ description: string; quantity: number; unitPrice: number; total: number; sortOrder: number }> = [];
  for (let i = 0; i < value.length; i += 1) {
    const row = value[i] || {};
    const description = String(row.description || '').trim();
    if (!description) continue;

    const quantityRaw = Number(row.quantity);
    const quantity = Number.isFinite(quantityRaw) && quantityRaw > 0 ? quantityRaw : 1;

    const unitPriceRaw = Number(row.unitPrice);
    const unitPrice = Number.isFinite(unitPriceRaw) && unitPriceRaw >= 0 ? unitPriceRaw : 0;

    const totalRaw = Number(row.total);
    const total = Number.isFinite(totalRaw) && totalRaw >= 0 ? totalRaw : quantity * unitPrice;

    items.push({
      description,
      quantity: toMoney(quantity),
      unitPrice: toMoney(unitPrice),
      total: toMoney(total),
      sortOrder: i
    });
  }

  return items;
};

const parseCsvIds = (value: any): string[] => {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
};

const buildDocumentFetcher = (pool: Pool) => async (documentId: string) => {
  const docResult = await pool.query(
    `
      SELECT
        d.*,
        creator.name as "createdByName",
        creator.email as "createdByEmail",
        updater.name as "updatedByName",
        updater.email as "updatedByEmail"
      FROM "FinancialDocument" d
      JOIN "User" creator ON creator.id = d."createdById"
      JOIN "User" updater ON updater.id = d."updatedById"
      WHERE d.id = $1
      LIMIT 1
    `,
    [documentId]
  );

  const doc = docResult.rows[0];
  if (!doc) return null;

  const itemsResult = await pool.query(
    'SELECT * FROM "FinancialDocumentItem" WHERE "documentId" = $1 ORDER BY "sortOrder" ASC',
    [documentId]
  );

  return {
    ...doc,
    totalAmount: Number(doc.totalAmount || 0),
    items: itemsResult.rows.map((item: any) => ({
      ...item,
      quantity: Number(item.quantity || 0),
      unitPrice: Number(item.unitPrice || 0),
      total: Number(item.total || 0)
    }))
  };
};

const buildNextDocumentCode = (pool: Pool) => async (companyId: string, docType: string) => {
  const cid = String(companyId || '').trim();
  if (!cid) throw new Error('companyId is required to generate a document code');
  const reference = TYPE_TO_REF_CODE[docType] || {
    code: String(docType || 'DOCUMENT').replace(/[^a-z0-9]/gi, '_').toUpperCase(),
    prefix: 'DOC-'
  };
  return reserveNextReference(pool, { companyId: cid, module: REFERENCE_MODULE, code: reference.code });
};

const getAccessibleCompanyIds = async (pool: Pool, userId: string, selectedCompanyId?: string) => {
  if (selectedCompanyId) return [selectedCompanyId];
  if (!userId) return [];

  const userResult = await pool.query('SELECT "companyId", "accessCompanyIds" FROM "User" WHERE id = $1 LIMIT 1', [userId]);
  const row = userResult.rows[0];
  const fromAccess = parseCsvIds(row?.accessCompanyIds);
  const fromPrimary = row?.companyId ? [String(row.companyId)] : [];

  return Array.from(new Set([...fromPrimary, ...fromAccess]));
};

const getClientById = async (pool: Pool, clientId: string) => {
  if (!clientId) return null;
  try {
    const result = await pool.query(
      'SELECT id, name, email, "companyId" FROM "Client" WHERE id = $1 LIMIT 1',
      [clientId]
    );
    return result.rows[0] || null;
  } catch {
    return null;
  }
};

export default function registerFinancialDocumentsModule({ app, pool }: FinancialDocumentsModuleContext) {
  const router = express.Router();
  const getDocumentById = buildDocumentFetcher(pool);
  const nextDocumentCode = buildNextDocumentCode(pool);

  const ensureActive = async () => {
    const mod = await pool.query('SELECT status FROM "SystemModule" WHERE code = $1 LIMIT 1', [MODULE_CODE]);
    return String(mod.rows[0]?.status || '') === 'Active';
  };

  router.get('/meta', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Financial Documents module is not active.' });

      const selectedCompanyId = String(req.query.companyId || '').trim();
      const userId = String(req.query.userId || '').trim();
      const accessibleCompanyIds = await getAccessibleCompanyIds(pool, userId, selectedCompanyId || undefined);

      const ctx = userId ? await resolveTenantAuthContext(pool, userId) : null;
      const organizationId = ctx?.organizationId || '';
      const companyCtx =
        ctx && selectedCompanyId ? await resolveCompanyContextForRequest(pool, ctx, selectedCompanyId) : null;

      const catMeta = await pool.query(`SELECT id, code FROM "Category" WHERE code = ANY($1)`, [
        ['FIN_DOC_TYPE', 'FIN_DOC_STATUS', 'BASE_CURRENCY']
      ]);
      const codeToId = new Map<string, string>(
        catMeta.rows.map((r: { id: string; code: string }) => [String(r.code), String(r.id)])
      );

      const loadItems = async (code: string) => {
        const categoryId = codeToId.get(code);
        if (!categoryId) return [] as { id: string; name: string }[];
        const rows = await fetchMergedCategoryItems(pool, {
          categoryId,
          organizationId,
          companyIdContext: companyCtx,
          activeOnly: true
        });
        return rows.map((i) => ({ id: i.id, name: i.name }));
      };

      const [typeItems, statusItems, currencyItems] = await Promise.all([
        loadItems('FIN_DOC_TYPE'),
        loadItems('FIN_DOC_STATUS'),
        loadItems('BASE_CURRENCY')
      ]);

      const hasUserScope = Boolean(userId);
      const companyResult = await pool.query(
        accessibleCompanyIds.length > 0
          ? 'SELECT id, name, "baseCurrency" FROM "Company" WHERE id = ANY($1) AND status = $2 ORDER BY name ASC'
          : hasUserScope
            ? 'SELECT id, name, "baseCurrency" FROM "Company" WHERE 1 = 0'
            : 'SELECT id, name, "baseCurrency" FROM "Company" WHERE status = $1 ORDER BY name ASC',
        accessibleCompanyIds.length > 0 ? [accessibleCompanyIds, 'Active'] : hasUserScope ? [] : ['Active']
      );
      let clients: any[] = [];
      if (accessibleCompanyIds.length > 0) {
        try {
          const clientResult = await pool.query(
            `
              SELECT
                c.id,
                c.name,
                c.email,
                c."companyId",
                COALESCE(array_remove(array_agg(DISTINCT cc."companyId"), NULL), '{}') as "companyIds"
              FROM "Client" c
              LEFT JOIN "ClientCompany" cc ON cc."clientId" = c.id
              WHERE c."companyId" = ANY($1)
                 OR EXISTS (
                   SELECT 1 FROM "ClientCompany" cc1
                   WHERE cc1."clientId" = c.id AND cc1."companyId" = ANY($1)
                 )
              GROUP BY c.id
              ORDER BY c.name ASC
            `,
            [accessibleCompanyIds]
          );
          clients = clientResult.rows;
        } catch {
          clients = [];
        }
      }

      const categories = {
        types: typeItems,
        statuses: statusItems,
        currencies: currencyItems
      };

      const selectedCompany = selectedCompanyId
        ? companyResult.rows.find((c: any) => c.id === selectedCompanyId)
        : companyResult.rows[0] || null;

      res.json({
        categories,
        companies: companyResult.rows,
        clients,
        context: {
          selectedCompanyId: selectedCompany?.id || null,
          defaultCurrency: selectedCompany?.baseCurrency || categories.currencies[0]?.name || 'USD'
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to load financial documents metadata', details: error.message });
    }
  });

  router.get('/', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Financial Documents module is not active.' });

      const companyId = String(req.query.companyId || '').trim();
      const type = String(req.query.type || '').trim();
      const status = String(req.query.status || '').trim();
      const search = String(req.query.search || '').trim();

      const where: string[] = [];
      const params: any[] = [];

      if (companyId) {
        params.push(companyId);
        where.push(`d."companyId" = $${params.length}`);
      }
      if (type) {
        params.push(type);
        where.push(`d.type = $${params.length}`);
      }
      if (status) {
        params.push(status);
        where.push(`d.status = $${params.length}`);
      }
      if (search) {
        params.push(`%${search}%`);
        where.push(`(LOWER(d.title) LIKE LOWER($${params.length}) OR LOWER(d.code) LIKE LOWER($${params.length}) OR LOWER(COALESCE(d."partyName", '')) LIKE LOWER($${params.length}) OR LOWER(COALESCE(d."partyEmail", '')) LIKE LOWER($${params.length}))`);
      }

      const result = await pool.query(
        `
          SELECT
            d.*,
            creator.name as "createdByName",
            updater.name as "updatedByName",
            COUNT(i.id)::int as "itemCount"
          FROM "FinancialDocument" d
          JOIN "User" creator ON creator.id = d."createdById"
          JOIN "User" updater ON updater.id = d."updatedById"
          LEFT JOIN "FinancialDocumentItem" i ON i."documentId" = d.id
          ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
          GROUP BY d.id, creator.name, updater.name
          ORDER BY d."issueDate" DESC NULLS LAST, d."createdAt" DESC
        `,
        params
      );

      res.json(result.rows.map((row: any) => ({ ...row, totalAmount: Number(row.totalAmount || 0) })));
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch financial documents', details: error.message });
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Financial Documents module is not active.' });
      const doc = await getDocumentById(req.params.id);
      if (!doc) return res.status(404).json({ error: 'Document not found' });
      res.json(doc);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch financial document', details: error.message });
    }
  });

  router.post('/', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Financial Documents module is not active.' });

      const createdById = String(req.body?.createdById || '').trim();
      const companyId = String(req.body?.companyId || '').trim();
      const clientId = String(req.body?.clientId || '').trim();
      const docType = normalizeType(req.body?.type);

      if (!createdById || !companyId || !clientId) {
        return res.status(400).json({ error: 'createdById, companyId and clientId are required.' });
      }

      const client = await getClientById(pool, clientId);
      if (!client) return res.status(400).json({ error: 'Selected client was not found.' });

      const id = crypto.randomUUID();
      const code = await nextDocumentCode(companyId, docType);
      const items = normalizeItems(req.body?.items || []);
      const providedTotal = Number(req.body?.totalAmount);
      const totalFromItems = items.reduce((sum, item) => sum + item.total, 0);
      const totalAmount = toMoney(Number.isFinite(providedTotal) ? providedTotal : totalFromItems);

      const titleInput = String(req.body?.title || '').trim();
      const title = titleInput || `${docType} ${code}`;
      const updatedById = String(req.body?.updatedById || '').trim() || createdById;

      await pool.query(
        `
          INSERT INTO "FinancialDocument" (
            id, code, type, title, status, "issueDate", "dueDate", currency,
            "totalAmount", "partyName", "partyEmail", "clientId", notes,
            "companyId", "createdById", "updatedById", "createdAt", "updatedAt"
          ) VALUES (
            $1, $2, $3, $4, $5, $6::timestamp, $7::timestamp, $8,
            $9, $10, $11, $12, $13,
            $14, $15, $16, NOW(), NOW()
          )
        `,
        [
          id,
          code,
          docType,
          title,
          String(req.body?.status || 'Draft') || 'Draft',
          toNullableIsoDate(req.body?.issueDate),
          toNullableIsoDate(req.body?.dueDate),
          String(req.body?.currency || 'USD') || 'USD',
          totalAmount,
          String(client.name || '').trim(),
          String(client.email || '').trim() || null,
          clientId,
          String(req.body?.notes || '').trim() || null,
          companyId,
          createdById,
          updatedById
        ]
      );

      for (const item of items) {
        await pool.query(
          'INSERT INTO "FinancialDocumentItem" (id, "documentId", description, quantity, "unitPrice", total, "sortOrder", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())',
          [crypto.randomUUID(), id, item.description, item.quantity, item.unitPrice, item.total, item.sortOrder]
        );
      }

      const doc = await getDocumentById(id);
      res.status(201).json(doc);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to create financial document', details: error.message });
    }
  });

  router.put('/:id', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Financial Documents module is not active.' });

      const documentId = String(req.params.id || '').trim();
      const existing = await getDocumentById(documentId);
      if (!existing) return res.status(404).json({ error: 'Document not found' });

      const nextClientId = String(req.body?.clientId || existing.clientId || '').trim();
      const client = await getClientById(pool, nextClientId);
      if (!client) return res.status(400).json({ error: 'Selected client was not found.' });

      const items = normalizeItems(req.body?.items || []);
      const providedTotal = Number(req.body?.totalAmount);
      const totalFromItems = items.reduce((sum, item) => sum + item.total, 0);
      const totalAmount = toMoney(Number.isFinite(providedTotal) ? providedTotal : (items.length > 0 ? totalFromItems : Number(existing.totalAmount || 0)));

      const updatedById = String(req.body?.updatedById || '').trim() || String(existing.updatedById || existing.createdById || '');
      if (!updatedById) return res.status(400).json({ error: 'updatedById is required.' });

      await pool.query(
        `
          UPDATE "FinancialDocument"
          SET type = $1,
              title = $2,
              status = $3,
              "issueDate" = $4::timestamp,
              "dueDate" = $5::timestamp,
              currency = $6,
              "totalAmount" = $7,
              "partyName" = $8,
              "partyEmail" = $9,
              "clientId" = $10,
              notes = $11,
              "companyId" = $12,
              "updatedById" = $13,
              "updatedAt" = NOW()
          WHERE id = $14
        `,
        [
          normalizeType(req.body?.type || existing.type),
          String(req.body?.title || existing.title || '').trim() || existing.title,
          String(req.body?.status || existing.status || 'Draft'),
          toNullableIsoDate(req.body?.issueDate || existing.issueDate),
          toNullableIsoDate(req.body?.dueDate || existing.dueDate),
          String(req.body?.currency || existing.currency || 'USD'),
          totalAmount,
          String(client.name || '').trim(),
          String(client.email || '').trim() || null,
          nextClientId,
          String(req.body?.notes || existing.notes || '').trim() || null,
          String(req.body?.companyId || existing.companyId || '').trim() || existing.companyId,
          updatedById,
          documentId
        ]
      );

      if (Array.isArray(req.body?.items)) {
        await pool.query('DELETE FROM "FinancialDocumentItem" WHERE "documentId" = $1', [documentId]);
        for (const item of items) {
          await pool.query(
            'INSERT INTO "FinancialDocumentItem" (id, "documentId", description, quantity, "unitPrice", total, "sortOrder", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())',
            [crypto.randomUUID(), documentId, item.description, item.quantity, item.unitPrice, item.total, item.sortOrder]
          );
        }
      }

      const doc = await getDocumentById(documentId);
      res.json(doc);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update financial document', details: error.message });
    }
  });

  router.patch('/:id/status', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Financial Documents module is not active.' });

      const status = String(req.body?.status || '').trim();
      const updatedById = String(req.body?.updatedById || '').trim();
      if (!status) return res.status(400).json({ error: 'status is required.' });
      if (!updatedById) return res.status(400).json({ error: 'updatedById is required.' });

      await pool.query('UPDATE "FinancialDocument" SET status = $1, "updatedById" = $2, "updatedAt" = NOW() WHERE id = $3', [status, updatedById, req.params.id]);

      const doc = await getDocumentById(req.params.id);
      if (!doc) return res.status(404).json({ error: 'Document not found' });
      res.json(doc);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update document status', details: error.message });
    }
  });

  router.delete('/:id', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Financial Documents module is not active.' });
      await pool.query('DELETE FROM "FinancialDocument" WHERE id = $1', [req.params.id]);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to delete financial document', details: error.message });
    }
  });

  app.use('/api/financial-documents', router);
}

