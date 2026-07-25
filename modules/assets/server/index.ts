import express from 'express';
import type { Pool } from 'pg';
import {
  fetchMergedItemsByCategoryCodes,
  resolveCompanyContextForRequest,
  resolveTenantAuthContext,
  resolveUserIdFromSessionToken,
  type TenantAuthContext
} from '@sinapsis/module-sdk-server';

interface AssetsModuleContext {
  app: express.Express;
  pool: Pool;
}

const MODULE_CODE = 'ASSETS';
const CATEGORY_CODES = ['ASSET_TYPE', 'ASSET_STATUS', 'ASSET_DOCUMENT_TYPE'];

const norm = (v: unknown, fallback = '') => String(v ?? '').trim() || fallback;

const getTokenFromRequest = (req: express.Request) => {
  const auth = String(req.headers.authorization || '');
  if (!auth.toLowerCase().startsWith('bearer ')) return '';
  return auth.slice(7).trim();
};

const accessibleCompanyIdsForUser = (ctx: TenantAuthContext): string[] => {
  const raw = [ctx.primaryCompanyId, ...ctx.accessCompanyIds].map((x) => String(x || '').trim()).filter(Boolean);
  return [...new Set(raw)];
};

const loadCtx = async (req: express.Request, res: express.Response, pool: Pool) => {
  const token = getTokenFromRequest(req);
  const userId = await resolveUserIdFromSessionToken(pool, token);
  if (!userId) {
    res.status(401).json({ error: 'Bearer token is required.' });
    return null;
  }
  const ctx = await resolveTenantAuthContext(pool, userId);
  if (!ctx) {
    res.status(403).json({ error: 'Unable to resolve tenant organization for user.' });
    return null;
  }
  return ctx;
};

export default function registerAssetsModule({ app, pool }: AssetsModuleContext) {
  const router = express.Router();

  const ensureActive = async () => {
    const mod = await pool.query('SELECT status FROM "SystemModule" WHERE code = $1 LIMIT 1', [MODULE_CODE]);
    return String(mod.rows[0]?.status || '') === 'Active';
  };

  router.get('/meta', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Assets module is not active.' });

      const companyId = norm(req.query.companyId);
      const ctx = await loadCtx(req, res, pool);
      if (!ctx) return;

      const companyCtx = companyId ? await resolveCompanyContextForRequest(pool, ctx, companyId) : null;

      const catMap = await fetchMergedItemsByCategoryCodes(pool, {
        codes: CATEGORY_CODES,
        organizationId: ctx.organizationId,
        companyIdContext: companyCtx,
        activeOnly: true
      });

      res.json({
        types: catMap.get('ASSET_TYPE') || [],
        statuses: catMap.get('ASSET_STATUS') || [],
        documentTypes: catMap.get('ASSET_DOCUMENT_TYPE') || []
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to load assets metadata', details: error.message });
    }
  });

  router.get('/openapi.json', (_req, res) => {
    res.json({
      openapi: '3.0.3',
      info: { title: 'Sinapsis Assets API', version: '1.0.0' },
      paths: { '/api/assets/meta': { get: { summary: 'Metadata' } }, '/api/assets': { get: { summary: 'List' } } }
    });
  });

  router.get('/', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Assets module is not active.' });

      const ctx = await loadCtx(req, res, pool);
      if (!ctx) return;

      const accessible = accessibleCompanyIdsForUser(ctx);
      if (!accessible.length) return res.json([]);

      const filterCompanyId = norm(req.query.companyId);
      if (filterCompanyId && !accessible.includes(filterCompanyId)) {
        return res.status(403).json({ error: 'Not allowed to access this company.' });
      }

      const search = norm(req.query.search);
      const params: unknown[] = [ctx.organizationId];
      let companyClause = `EXISTS (
        SELECT 1 FROM "AssetCompany" ac
        WHERE ac."assetId" = a.id AND ac."companyId" = ANY($2::text[])
      )`;
      params.push(accessible);

      if (filterCompanyId) {
        companyClause = `EXISTS (
          SELECT 1 FROM "AssetCompany" ac
          WHERE ac."assetId" = a.id AND ac."companyId" = $2
        )`;
        params.length = 1;
        params.push(filterCompanyId);
      }

      let searchClause = '';
      if (search) {
        const n = params.length + 1;
        params.push(`%${search.toLowerCase()}%`);
        searchClause = `AND (
          LOWER(a.code) LIKE $${n}
          OR LOWER(COALESCE(a."serialNumber", '')) LIKE $${n}
          OR LOWER(COALESCE(a."assetTag", '')) LIKE $${n}
          OR LOWER(COALESCE(p.name, '')) LIKE $${n}
        )`;
      }

      const result = await pool.query(
        `
        SELECT
          a.*,
          p.name AS "productName",
          p."typeCategoryItemId" AS "productTypeCategoryItemId",
          COALESCE(
            (SELECT array_agg(ac."companyId" ORDER BY ac."companyId") FROM "AssetCompany" ac WHERE ac."assetId" = a.id),
            '{}'
          ) AS "companyIds"
        FROM "Asset" a
        JOIN "AssetProduct" p ON p.id = a."productId"
        WHERE a."organizationId" = $1
          AND ${companyClause}
          ${searchClause}
        ORDER BY a."updatedAt" DESC
        `,
        params
      );

      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to list assets', details: error.message });
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      if (!(await ensureActive())) return res.status(409).json({ error: 'Assets module is not active.' });

      const ctx = await loadCtx(req, res, pool);
      if (!ctx) return;

      const accessible = accessibleCompanyIdsForUser(ctx);
      const result = await pool.query(
        `
        SELECT
          a.*,
          p.name AS "productName",
          p."typeCategoryItemId" AS "productTypeCategoryItemId",
          COALESCE(
            (SELECT array_agg(ac."companyId" ORDER BY ac."companyId") FROM "AssetCompany" ac WHERE ac."assetId" = a.id),
            '{}'
          ) AS "companyIds"
        FROM "Asset" a
        JOIN "AssetProduct" p ON p.id = a."productId"
        WHERE a.id = $1 AND a."organizationId" = $2
        LIMIT 1
        `,
        [req.params.id, ctx.organizationId]
      );
      const row = result.rows[0];
      if (!row) return res.status(404).json({ error: 'Asset not found.' });

      const companyIds: string[] = Array.isArray(row.companyIds) ? row.companyIds : [];
      const overlap = companyIds.some((cid) => accessible.includes(cid));
      if (!overlap) return res.status(403).json({ error: 'Not allowed to view this asset.' });

      res.json(row);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to load asset', details: error.message });
    }
  });

  app.use('/api/assets', router);

  return { basePath: '/api/assets', openapiPath: '/api/assets/openapi.json', docsPath: '/api/assets/docs' };
}
