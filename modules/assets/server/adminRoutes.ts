import type express from 'express';
import type pg from 'pg';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { assertCompanyBelongsToOrg } from '@sinapsis/module-sdk-server';
import { reserveNextReference } from '@sinapsis/module-sdk-server';

type PrismaLike = any;

const REF_MODULE = 'ASSETS';
const REF_ASSET = 'ASSET';

const norm = (v: unknown, fallback = '') => String(v ?? '').trim() || fallback;

const parseMetadata = (raw: unknown): Record<string, unknown> => {
  if (raw == null) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const p = JSON.parse(raw) as unknown;
      return typeof p === 'object' && p != null && !Array.isArray(p) ? (p as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return {};
};

const orgStorageFolder = (org: { name?: string | null; id: string }) => {
  const safe = String(org.name || 'org')
    .replace(/[^a-z0-9]/gi, '_')
    .toLowerCase();
  return `${safe}_${String(org.id).split('-')[0]}`;
};

export const registerModuleAdminRoutes = (
  router: express.Router,
  prisma: PrismaLike,
  pool: pg.Pool,
  uploadMemory: multer.Multer
) => {
  router.get('/organizations/:orgId/companies', async (req, res) => {
    try {
      const orgId = norm(req.params.orgId);
      if (!orgId) return res.status(400).json({ error: 'organizationId is required' });
      const companies = await prisma.company.findMany({
        where: { organizationId: orgId },
        orderBy: { name: 'asc' }
      });
      return res.json(companies);
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to fetch companies', details: error?.message || String(error) });
    }
  });

  router.get('/asset-products', async (req, res) => {
    try {
      const organizationId = norm(req.query.organizationId);
      if (!organizationId) return res.status(400).json({ error: 'organizationId query is required' });

      const result = await pool.query(
        `
        SELECT p.*, ci.name AS "typeCategoryItemName"
        FROM "AssetProduct" p
        LEFT JOIN "CategoryItem" ci ON ci.id = p."typeCategoryItemId"
        WHERE p."organizationId" = $1
        ORDER BY p.name ASC
        `,
        [organizationId]
      );
      return res.json(result.rows);
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to list asset products', details: error?.message || String(error) });
    }
  });

  router.post('/asset-products', async (req, res) => {
    try {
      const organizationId = norm(req.body?.organizationId);
      const name = norm(req.body?.name);
      if (!organizationId || !name) return res.status(400).json({ error: 'organizationId and name are required' });

      const org = await prisma.organization.findUnique({ where: { id: organizationId } });
      if (!org) return res.status(404).json({ error: 'Organization not found' });

      const typeCategoryItemId = norm(req.body?.typeCategoryItemId) || null;
      const sku = norm(req.body?.sku) || null;
      if (sku) {
        const clash = await pool.query(
          'SELECT id FROM "AssetProduct" WHERE "organizationId" = $1 AND "sku" = $2 LIMIT 1',
          [organizationId, sku]
        );
        if (clash.rows[0]) return res.status(400).json({ error: 'SKU already exists for this organization.' });
      }

      const id = crypto.randomUUID();
      const metadata = parseMetadata(req.body?.metadata);

      await pool.query(
        `
        INSERT INTO "AssetProduct" (
          id, "organizationId", name, description, "typeCategoryItemId", sku, manufacturer, model, metadata, status, "createdAt", "updatedAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, NOW(), NOW())
        `,
        [
          id,
          organizationId,
          name,
          norm(req.body?.description) || null,
          typeCategoryItemId,
          sku,
          norm(req.body?.manufacturer) || null,
          norm(req.body?.model) || null,
          JSON.stringify(metadata),
          norm(req.body?.status, 'Active') || 'Active'
        ]
      );

      const created = await pool.query('SELECT * FROM "AssetProduct" WHERE id = $1', [id]);
      return res.status(201).json(created.rows[0]);
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to create asset product', details: error?.message || String(error) });
    }
  });

  router.put('/asset-products/:id', async (req, res) => {
    try {
      const id = norm(req.params.id);
      const existing = await pool.query('SELECT * FROM "AssetProduct" WHERE id = $1 LIMIT 1', [id]);
      const row = existing.rows[0];
      if (!row) return res.status(404).json({ error: 'Product not found' });

      const name = req.body?.name !== undefined ? norm(req.body?.name) : row.name;
      if (!name) return res.status(400).json({ error: 'name cannot be empty' });

      const sku = req.body?.sku !== undefined ? norm(req.body?.sku) || null : row.sku;
      if (sku && sku !== row.sku) {
        const clash = await pool.query(
          'SELECT id FROM "AssetProduct" WHERE "organizationId" = $1 AND "sku" = $2 AND id <> $3 LIMIT 1',
          [row.organizationId, sku, id]
        );
        if (clash.rows[0]) return res.status(400).json({ error: 'SKU already exists for this organization.' });
      }

      const metadata = req.body?.metadata !== undefined ? parseMetadata(req.body?.metadata) : parseMetadata(row.metadata);

      await pool.query(
        `
        UPDATE "AssetProduct" SET
          name = $1,
          description = $2,
          "typeCategoryItemId" = $3,
          sku = $4,
          manufacturer = $5,
          model = $6,
          metadata = $7::jsonb,
          status = $8,
          "updatedAt" = NOW()
        WHERE id = $9
        `,
        [
          name,
          req.body?.description !== undefined ? norm(req.body?.description) || null : row.description,
          req.body?.typeCategoryItemId !== undefined ? norm(req.body?.typeCategoryItemId) || null : row.typeCategoryItemId,
          sku,
          req.body?.manufacturer !== undefined ? norm(req.body?.manufacturer) || null : row.manufacturer,
          req.body?.model !== undefined ? norm(req.body?.model) || null : row.model,
          JSON.stringify(metadata),
          req.body?.status !== undefined ? norm(req.body?.status, 'Active') : row.status,
          id
        ]
      );

      const updated = await pool.query('SELECT * FROM "AssetProduct" WHERE id = $1', [id]);
      return res.json(updated.rows[0]);
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to update asset product', details: error?.message || String(error) });
    }
  });

  router.delete('/asset-products/:id', async (req, res) => {
    try {
      const id = norm(req.params.id);
      const assets = await pool.query('SELECT id FROM "Asset" WHERE "productId" = $1 LIMIT 1', [id]);
      if (assets.rows[0]) {
        return res.status(409).json({ error: 'Cannot delete product while asset instances exist.' });
      }
      await pool.query('DELETE FROM "AssetProductFile" WHERE "productId" = $1', [id]);
      await pool.query('DELETE FROM "AssetProduct" WHERE id = $1', [id]);
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to delete asset product', details: error?.message || String(error) });
    }
  });

  router.get('/asset-products/:id/files', async (req, res) => {
    try {
      const productId = norm(req.params.id);
      const result = await pool.query(
        `SELECT id, "productId", kind, name, "originalName", "fileUrl", "mimeType", "fileExt", "sizeBytes", status, "uploadedByAdminEmail", "createdAt", "updatedAt"
         FROM "AssetProductFile" WHERE "productId" = $1 AND status = 'Active' ORDER BY "createdAt" DESC`,
        [productId]
      );
      return res.json(result.rows);
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to list product files', details: error?.message || String(error) });
    }
  });

  router.post('/asset-products/:id/files', uploadMemory.single('file'), async (req, res) => {
    try {
      const productId = norm(req.params.id);
      const file = req.file;
      if (!file) return res.status(400).json({ error: 'file is required' });

      const prod = await pool.query('SELECT id, "organizationId" FROM "AssetProduct" WHERE id = $1 LIMIT 1', [productId]);
      if (!prod.rows[0]) return res.status(404).json({ error: 'Product not found' });

      const orgRow = await pool.query('SELECT id, name FROM "Organization" WHERE id = $1 LIMIT 1', [prod.rows[0].organizationId]);
      const org = orgRow.rows[0];
      if (!org) return res.status(404).json({ error: 'Organization not found' });

      const adminEmail = norm((req as express.Request & { adminEmail?: string }).adminEmail) || 'admin';

      const ext = path.extname(file.originalname || '').toLowerCase();
      const baseName = path.basename(file.originalname || 'file', ext) || 'file';
      const safeBase = baseName.replace(/[^\w\-\. ]/g, '_').trim() || 'file';
      const filename = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}${ext}`;
      const orgFolder = orgStorageFolder(org);
      const relativePath = path.join(orgFolder, 'files', 'asset-products', productId, filename);
      const storageRoot = path.resolve(process.cwd(), 'storage');
      const finalPath = path.join(storageRoot, relativePath);
      fs.mkdirSync(path.dirname(finalPath), { recursive: true });
      fs.writeFileSync(finalPath, file.buffer);
      const fileUrl = `/storage/${relativePath.replace(/\\/g, '/')}`;

      const id = crypto.randomUUID();
      const kind = norm(req.body?.kind, 'manual') || 'manual';

      await pool.query(
        `
        INSERT INTO "AssetProductFile" (
          id, "productId", kind, name, "originalName", "fileUrl", "filePath", "mimeType", "fileExt", "sizeBytes", status, "uploadedByAdminEmail", "createdAt", "updatedAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Active', $11, NOW(), NOW())
        `,
        [
          id,
          productId,
          kind,
          safeBase,
          file.originalname || safeBase,
          fileUrl,
          finalPath,
          file.mimetype || null,
          ext || null,
          Number(file.size || 0),
          adminEmail
        ]
      );

      const created = await pool.query('SELECT * FROM "AssetProductFile" WHERE id = $1', [id]);
      return res.status(201).json(created.rows[0]);
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to upload file', details: error?.message || String(error) });
    }
  });

  router.delete('/asset-product-files/:fileId', async (req, res) => {
    try {
      const fileId = norm(req.params.fileId);
      const r = await pool.query('SELECT * FROM "AssetProductFile" WHERE id = $1 LIMIT 1', [fileId]);
      const row = r.rows[0];
      if (!row) return res.status(404).json({ error: 'File not found' });
      const fp = row.filePath ? String(row.filePath) : '';
      if (fp && fs.existsSync(fp)) {
        try {
          fs.unlinkSync(fp);
        } catch {
          /* ignore */
        }
      }
      await pool.query('DELETE FROM "AssetProductFile" WHERE id = $1', [fileId]);
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to delete file', details: error?.message || String(error) });
    }
  });

  router.get('/assets', async (req, res) => {
    try {
      const organizationId = norm(req.query.organizationId);
      if (!organizationId) return res.status(400).json({ error: 'organizationId query is required' });

      const companyId = norm(req.query.companyId);
      const search = norm(req.query.search);

      const params: unknown[] = [organizationId];
      let where = 'WHERE a."organizationId" = $1';

      if (companyId) {
        params.push(companyId);
        where += ` AND EXISTS (SELECT 1 FROM "AssetCompany" ac WHERE ac."assetId" = a.id AND ac."companyId" = $${params.length})`;
      }

      if (search) {
        params.push(`%${search.toLowerCase()}%`);
        where += ` AND (
          LOWER(a.code) LIKE $${params.length}
          OR LOWER(COALESCE(a."serialNumber", '')) LIKE $${params.length}
          OR LOWER(COALESCE(a."assetTag", '')) LIKE $${params.length}
          OR LOWER(COALESCE(p.name, '')) LIKE $${params.length}
        )`;
      }

      const result = await pool.query(
        `
        SELECT
          a.*,
          p.name AS "productName",
          ci.name AS "typeCategoryItemName",
          st.name AS "statusCategoryItemName",
          COALESCE(
            (SELECT array_agg(cmp.name ORDER BY cmp.name) FROM "AssetCompany" ac JOIN "Company" cmp ON cmp.id = ac."companyId" WHERE ac."assetId" = a.id),
            '{}'
          ) AS "companyNames",
          COALESCE(
            (SELECT array_agg(ac."companyId" ORDER BY ac."companyId") FROM "AssetCompany" ac WHERE ac."assetId" = a.id),
            '{}'
          ) AS "companyIds"
        FROM "Asset" a
        JOIN "AssetProduct" p ON p.id = a."productId"
        LEFT JOIN "CategoryItem" ci ON ci.id = p."typeCategoryItemId"
        LEFT JOIN "CategoryItem" st ON st.id = a."statusCategoryItemId"
        ${where}
        ORDER BY a."updatedAt" DESC
        `,
        params
      );
      return res.json(result.rows);
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to list assets', details: error?.message || String(error) });
    }
  });

  router.get('/assets/:id', async (req, res) => {
    try {
      const id = norm(req.params.id);
      const result = await pool.query(
        `
        SELECT
          a.*,
          p.name AS "productName",
          ci.name AS "typeCategoryItemName",
          st.name AS "statusCategoryItemName",
          COALESCE(
            (SELECT array_agg(ac."companyId" ORDER BY ac."companyId") FROM "AssetCompany" ac WHERE ac."assetId" = a.id),
            '{}'
          ) AS "companyIds"
        FROM "Asset" a
        JOIN "AssetProduct" p ON p.id = a."productId"
        LEFT JOIN "CategoryItem" ci ON ci.id = p."typeCategoryItemId"
        LEFT JOIN "CategoryItem" st ON st.id = a."statusCategoryItemId"
        WHERE a.id = $1
        LIMIT 1
        `,
        [id]
      );
      const row = result.rows[0];
      if (!row) return res.status(404).json({ error: 'Asset not found' });
      return res.json(row);
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to load asset', details: error?.message || String(error) });
    }
  });

  router.post('/assets', async (req, res) => {
    const client = await pool.connect();
    try {
      const organizationId = norm(req.body?.organizationId);
      const productId = norm(req.body?.productId);
      const referenceCompanyId = norm(req.body?.referenceCompanyId);
      const companyIdsRaw = req.body?.companyIds;
      const companyIds = Array.isArray(companyIdsRaw)
        ? [...new Set(companyIdsRaw.map((x: unknown) => norm(x)).filter(Boolean))]
        : [];

      if (!organizationId || !productId || !referenceCompanyId || companyIds.length === 0) {
        return res.status(400).json({ error: 'organizationId, productId, referenceCompanyId and companyIds are required.' });
      }
      if (!companyIds.includes(referenceCompanyId)) {
        return res.status(400).json({ error: 'referenceCompanyId must be included in companyIds.' });
      }

      for (const cid of companyIds) {
        const ok = await assertCompanyBelongsToOrg(pool, organizationId, cid);
        if (!ok) return res.status(400).json({ error: `Company ${cid} does not belong to organization.` });
      }

      const prod = await pool.query(
        'SELECT id FROM "AssetProduct" WHERE id = $1 AND "organizationId" = $2 LIMIT 1',
        [productId, organizationId]
      );
      if (!prod.rows[0]) return res.status(404).json({ error: 'Product not found in organization.' });

      const code = await reserveNextReference(pool, { companyId: referenceCompanyId, module: REF_MODULE, code: REF_ASSET });
      const id = crypto.randomUUID();
      const metadata = parseMetadata(req.body?.metadata);

      await client.query('BEGIN');

      await client.query(
        `
        INSERT INTO "Asset" (
          id, "organizationId", "productId", code, "referenceCompanyId", "serialNumber", "assetTag", notes, "statusCategoryItemId", metadata, "createdAt", "updatedAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, NOW(), NOW())
        `,
        [
          id,
          organizationId,
          productId,
          code,
          referenceCompanyId,
          norm(req.body?.serialNumber) || null,
          norm(req.body?.assetTag) || null,
          norm(req.body?.notes) || null,
          norm(req.body?.statusCategoryItemId) || null,
          JSON.stringify(metadata)
        ]
      );

      for (const cid of companyIds) {
        await client.query('INSERT INTO "AssetCompany" ("assetId", "companyId", "assignedAt") VALUES ($1, $2, NOW())', [id, cid]);
      }

      await client.query('COMMIT');

      const created = await pool.query(
        `
        SELECT a.*, p.name AS "productName",
          COALESCE((SELECT array_agg(ac."companyId" ORDER BY ac."companyId") FROM "AssetCompany" ac WHERE ac."assetId" = a.id), '{}') AS "companyIds"
        FROM "Asset" a JOIN "AssetProduct" p ON p.id = a."productId" WHERE a.id = $1
        `,
        [id]
      );
      return res.status(201).json(created.rows[0]);
    } catch (error: any) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      return res.status(500).json({ error: 'Failed to create asset', details: error?.message || String(error) });
    } finally {
      client.release();
    }
  });

  router.put('/assets/:id', async (req, res) => {
    const client = await pool.connect();
    try {
      const id = norm(req.params.id);
      const existing = await pool.query('SELECT * FROM "Asset" WHERE id = $1 LIMIT 1', [id]);
      const row = existing.rows[0];
      if (!row) return res.status(404).json({ error: 'Asset not found' });

      const organizationId = String(row.organizationId);
      const companyIdsRaw = req.body?.companyIds;
      const companyIds =
        companyIdsRaw !== undefined
          ? [...new Set((Array.isArray(companyIdsRaw) ? companyIdsRaw : []).map((x: unknown) => norm(x)).filter(Boolean))]
          : null;

      if (companyIds) {
        if (!companyIds.length) return res.status(400).json({ error: 'companyIds cannot be empty.' });
        for (const cid of companyIds) {
          const ok = await assertCompanyBelongsToOrg(pool, organizationId, cid);
          if (!ok) return res.status(400).json({ error: `Company ${cid} does not belong to organization.` });
        }
      }

      const productId = req.body?.productId !== undefined ? norm(req.body?.productId) : row.productId;
      if (productId !== row.productId) {
        const prod = await pool.query(
          'SELECT id FROM "AssetProduct" WHERE id = $1 AND "organizationId" = $2 LIMIT 1',
          [productId, organizationId]
        );
        if (!prod.rows[0]) return res.status(404).json({ error: 'Product not found in organization.' });
      }

      const metadata = req.body?.metadata !== undefined ? parseMetadata(req.body?.metadata) : parseMetadata(row.metadata);

      await client.query('BEGIN');

      await client.query(
        `
        UPDATE "Asset" SET
          "productId" = $1,
          "serialNumber" = $2,
          "assetTag" = $3,
          notes = $4,
          "statusCategoryItemId" = $5,
          metadata = $6::jsonb,
          "updatedAt" = NOW()
        WHERE id = $7
        `,
        [
          productId,
          req.body?.serialNumber !== undefined ? norm(req.body?.serialNumber) || null : row.serialNumber,
          req.body?.assetTag !== undefined ? norm(req.body?.assetTag) || null : row.assetTag,
          req.body?.notes !== undefined ? norm(req.body?.notes) || null : row.notes,
          req.body?.statusCategoryItemId !== undefined ? norm(req.body?.statusCategoryItemId) || null : row.statusCategoryItemId,
          JSON.stringify(metadata),
          id
        ]
      );

      if (companyIds) {
        await client.query('DELETE FROM "AssetCompany" WHERE "assetId" = $1', [id]);
        for (const cid of companyIds) {
          await client.query('INSERT INTO "AssetCompany" ("assetId", "companyId", "assignedAt") VALUES ($1, $2, NOW())', [id, cid]);
        }
      }

      await client.query('COMMIT');

      const updated = await pool.query(
        `
        SELECT a.*, p.name AS "productName",
          COALESCE((SELECT array_agg(ac."companyId" ORDER BY ac."companyId") FROM "AssetCompany" ac WHERE ac."assetId" = a.id), '{}') AS "companyIds"
        FROM "Asset" a JOIN "AssetProduct" p ON p.id = a."productId" WHERE a.id = $1
        `,
        [id]
      );
      return res.json(updated.rows[0]);
    } catch (error: any) {
      await client.query('ROLLBACK');
      return res.status(500).json({ error: 'Failed to update asset', details: error?.message || String(error) });
    } finally {
      client.release();
    }
  });

  router.delete('/assets/:id', async (req, res) => {
    try {
      const id = norm(req.params.id);
      await pool.query('DELETE FROM "Asset" WHERE id = $1', [id]);
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to delete asset', details: error?.message || String(error) });
    }
  });
};
