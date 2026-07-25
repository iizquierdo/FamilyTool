import express from 'express';
import crypto from 'crypto';
import type { Pool } from 'pg';
import {
  fetchMergedItemsByCategoryCodes,
  resolveCompanyContextForRequest,
  resolveTenantAuthContext
} from '@sinapsis/module-sdk-server';
import { reserveNextReference } from '@sinapsis/module-sdk-server';
import path from 'path';
import fs from 'fs';
import multer from 'multer';

const storage = multer.memoryStorage();
const upload = multer({ storage });


interface ClientsModuleContext {
  app: express.Express;
  pool: Pool;
}

const MODULE_CODE = 'CLIENTS';
const REFERENCE_MODULE = 'CLIENTS';
const REFERENCE_CODE = 'CLIENTS';
const FILES_SOURCE_MODULE = 'CLIENTS';
const NOTES_SOURCE_MODULE = 'CLIENTS';
const SOCIAL_CATEGORY_CODES = ['SOCIAL_NETWORK', 'CLIENT_SOCIAL_NETWORK'];
const DEFAULT_SOCIAL_CATEGORY_CODE = 'SOCIAL_NETWORK';
const DEFAULT_SOCIAL_NETWORKS = ['Instagram', 'Facebook', 'LinkedIn', 'X', 'YouTube', 'TikTok', 'Website'];

const normalizeCompanyIds = (value: any): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const raw of value) {
    const id = String(raw || '').trim();
    if (id) seen.add(id);
  }
  return Array.from(seen);
};

const buildClientFetcher = (pool: Pool) => async (clientId: string) => {
  const result = await pool.query(
    `
      SELECT
        c.*,
        creator.name as "createdByName",
        creator.email as "createdByEmail",
        updater.name as "updatedByName",
        updater.email as "updatedByEmail",
        COALESCE(array_remove(array_agg(DISTINCT cc."companyId"), NULL), '{}') as "companyIds",
        COALESCE(array_remove(array_agg(DISTINCT cmp.name), NULL), '{}') as "companyNames"
      FROM "Client" c
      JOIN "User" creator ON creator.id = c."createdById"
      JOIN "User" updater ON updater.id = c."updatedById"
      LEFT JOIN "ClientCompany" cc ON cc."clientId" = c.id
      LEFT JOIN "Company" cmp ON cmp.id = cc."companyId" OR cmp.id = c."companyId"
      WHERE c.id = $1
      GROUP BY c.id, creator.name, creator.email, updater.name, updater.email
      LIMIT 1
    `,
    [clientId]
  );

  return result.rows[0] || null;
};

const nextClientCodeForCompany = (pool: Pool) => (companyId: string) =>
  reserveNextReference(pool, { companyId, module: REFERENCE_MODULE, code: REFERENCE_CODE });

export default function registerClientsModule({ app, pool }: ClientsModuleContext) {
  const router = express.Router();
  const getClientById = buildClientFetcher(pool);
  const nextClientCode = nextClientCodeForCompany(pool);

  let schemaReady = false;
  const ensureSocialCategory = async () => {
    const existingCategory = await pool.query(
      'SELECT id, code FROM "Category" WHERE code = ANY($1) ORDER BY CASE WHEN code = $2 THEN 0 ELSE 1 END, "createdAt" ASC LIMIT 1',
      [SOCIAL_CATEGORY_CODES, DEFAULT_SOCIAL_CATEGORY_CODE]
    );

    let categoryId = existingCategory.rows[0]?.id as string | undefined;

    if (!categoryId) {
      const insertedCategory = await pool.query(
        'INSERT INTO "Category" (id, code, name, description, module, status, "sortOrder", "sortingRule", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, 0, $7, NOW(), NOW()) RETURNING id',
        [crypto.randomUUID(), DEFAULT_SOCIAL_CATEGORY_CODE, 'Social Networks', 'Social networks catalog for clients', 'Clients', 'Active', 'Manual']
      );
      categoryId = insertedCategory.rows[0]?.id;
    }

    for (let i = 0; i < DEFAULT_SOCIAL_NETWORKS.length; i += 1) {
      const name = DEFAULT_SOCIAL_NETWORKS[i];
      const code = name.replace(/[^a-z0-9]/gi, '_').toUpperCase();

      const existingItem = await pool.query(
        'SELECT id FROM "CategoryItem" WHERE "categoryId" = $1 AND (name = $2 OR code = $3) LIMIT 1',
        [categoryId, name, code]
      );

      if (!existingItem.rows[0]) {
        await pool.query(
          'INSERT INTO "CategoryItem" (id, code, name, description, status, "sortOrder", "categoryId", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())',
          [crypto.randomUUID(), code, name, `Client social network: ${name}`, 'Active', i, categoryId]
        );
      }
    }
  };

  const ensureSchema = async () => {
    if (schemaReady) return;

    await pool.query(`
      ALTER TABLE "Client"
      ADD COLUMN IF NOT EXISTS "state" TEXT,
      ADD COLUMN IF NOT EXISTS "zipcode" TEXT,
      ADD COLUMN IF NOT EXISTS "logoUrl" TEXT
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "ClientCompany" (
          "id" TEXT NOT NULL,
          "clientId" TEXT NOT NULL,
          "companyId" TEXT NOT NULL,
          "isPrimary" BOOLEAN NOT NULL DEFAULT false,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "ClientCompany_pkey" PRIMARY KEY ("id")
      )
    `);

    await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS "ClientCompany_clientId_companyId_key" ON "ClientCompany"("clientId", "companyId")');
    await pool.query('CREATE INDEX IF NOT EXISTS "ClientCompany_companyId_idx" ON "ClientCompany"("companyId")');
    await pool.query('CREATE INDEX IF NOT EXISTS "ClientCompany_clientId_idx" ON "ClientCompany"("clientId")');

    await pool.query(`
      DO $$
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ClientCompany_clientId_fkey') THEN
              ALTER TABLE "ClientCompany" ADD CONSTRAINT "ClientCompany_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
          END IF;

          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ClientCompany_companyId_fkey') THEN
              ALTER TABLE "ClientCompany" ADD CONSTRAINT "ClientCompany_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
          END IF;
      END $$;
    `);

    await pool.query(`
      INSERT INTO "ClientCompany" ("id", "clientId", "companyId", "isPrimary", "createdAt")
      SELECT gen_random_uuid()::text, c.id, c."companyId", true, NOW()
      FROM "Client" c
      WHERE c."companyId" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "ClientCompany" cc WHERE cc."clientId" = c.id AND cc."companyId" = c."companyId"
        )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "EntitySocialLink" (
        "id" TEXT NOT NULL,
        "entityType" TEXT NOT NULL,
        "entityId" TEXT NOT NULL,
        "categoryItemId" TEXT NOT NULL,
        "url" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'Active',
        "sortOrder" INTEGER NOT NULL DEFAULT 0,
        "createdById" TEXT NOT NULL,
        "updatedById" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "EntitySocialLink_pkey" PRIMARY KEY ("id")
      )
    `);

    await pool.query('CREATE INDEX IF NOT EXISTS "EntitySocialLink_entity_idx" ON "EntitySocialLink"("entityType", "entityId", "status")');
    await pool.query('CREATE INDEX IF NOT EXISTS "EntitySocialLink_categoryItem_idx" ON "EntitySocialLink"("categoryItemId")');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "EntityFile" (
        "id" TEXT NOT NULL,
        "sourceModule" TEXT NOT NULL,
        "sourceId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "originalName" TEXT NOT NULL,
        "fileUrl" TEXT NOT NULL,
        "filePath" TEXT,
        "mimeType" TEXT,
        "fileExt" TEXT,
        "sizeBytes" BIGINT NOT NULL DEFAULT 0,
        "status" TEXT NOT NULL DEFAULT 'Active',
        "createdById" TEXT NOT NULL,
        "updatedById" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "EntityFile_pkey" PRIMARY KEY ("id")
      )
    `);

    await pool.query('CREATE INDEX IF NOT EXISTS "EntityFile_source_idx" ON "EntityFile"("sourceModule", "sourceId", "status")');
    await pool.query('CREATE INDEX IF NOT EXISTS "EntityFile_createdAt_idx" ON "EntityFile"("createdAt")');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS "EntityNote" (
        "id" TEXT NOT NULL,
        "sourceModule" TEXT NOT NULL,
        "sourceId" TEXT NOT NULL,
        "note" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'Active',
        "createdById" TEXT NOT NULL,
        "updatedById" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "EntityNote_pkey" PRIMARY KEY ("id")
      )
    `);

    await pool.query('CREATE INDEX IF NOT EXISTS "EntityNote_source_idx" ON "EntityNote"("sourceModule", "sourceId", "status")');
    await pool.query('CREATE INDEX IF NOT EXISTS "EntityNote_createdAt_idx" ON "EntityNote"("createdAt")');

    await pool.query(`
      DO $$
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EntitySocialLink_categoryItemId_fkey') THEN
              ALTER TABLE "EntitySocialLink" ADD CONSTRAINT "EntitySocialLink_categoryItemId_fkey" FOREIGN KEY ("categoryItemId") REFERENCES "CategoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
          END IF;

          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EntitySocialLink_createdById_fkey') THEN
              ALTER TABLE "EntitySocialLink" ADD CONSTRAINT "EntitySocialLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
          END IF;

          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EntitySocialLink_updatedById_fkey') THEN
              ALTER TABLE "EntitySocialLink" ADD CONSTRAINT "EntitySocialLink_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
          END IF;

          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EntityFile_createdById_fkey') THEN
              ALTER TABLE "EntityFile" ADD CONSTRAINT "EntityFile_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
          END IF;

          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EntityFile_updatedById_fkey') THEN
              ALTER TABLE "EntityFile" ADD CONSTRAINT "EntityFile_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
          END IF;

          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EntityNote_createdById_fkey') THEN
              ALTER TABLE "EntityNote" ADD CONSTRAINT "EntityNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
          END IF;

          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EntityNote_updatedById_fkey') THEN
              ALTER TABLE "EntityNote" ADD CONSTRAINT "EntityNote_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
          END IF;
      END $$;
    `);

    await ensureSocialCategory();

    schemaReady = true;
  };

  const ensureActive = async () => {
    const mod = await pool.query('SELECT status FROM "SystemModule" WHERE code = $1 LIMIT 1', [MODULE_CODE]);
    return String(mod.rows[0]?.status || '') === 'Active';
  };

  const ensureClientExists = async (clientId: string) => {
    const found = await pool.query('SELECT id FROM "Client" WHERE id = $1 LIMIT 1', [clientId]);
    return Boolean(found.rows[0]?.id);
  };


  router.get('/openapi.json', async (req, res) => {
    try {
      await ensureSchema();
      if (!(await ensureActive())) return res.status(409).json({ error: 'Clients module is not active.' });
      const serverUrl = `${req.protocol}://${req.get('host')}`;
      res.json({
        openapi: '3.0.3',
        info: { title: 'Sinapsis Clients API', version: '1.0.0', description: 'Clients module endpoints.' },
        tags: [{ name: 'Clients', description: 'Clients management endpoints' }],
        servers: [{ url: serverUrl }],
        paths: {
          '/api/clients/meta': { get: { tags: ['Clients'], summary: 'Get clients metadata', responses: { '200': { description: 'Clients metadata' } } } },
          '/api/clients': {
            get: { tags: ['Clients'], summary: 'List clients', responses: { '200': { description: 'Clients list' } } },
            post: { tags: ['Clients'], summary: 'Create client', responses: { '201': { description: 'Client created' } } }
          },
          '/api/clients/{id}': {
            get: { tags: ['Clients'], summary: 'Get client by id', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Client detail' } } },
            put: { tags: ['Clients'], summary: 'Update client', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Client updated' } } },
            delete: { tags: ['Clients'], summary: 'Deactivate client', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Client deactivated' } } }
          },
          '/api/clients/{id}/status': { patch: { tags: ['Clients'], summary: 'Update client status', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Client status updated' } } } },
          '/api/clients/files': { get: { tags: ['Clients'], summary: 'List files by source', responses: { '200': { description: 'Files list' } } } },
          '/api/clients/files/upload': { post: { tags: ['Clients'], summary: 'Upload client file', responses: { '201': { description: 'File uploaded' } } } },
          '/api/clients/files/{fileId}': {
            put: { tags: ['Clients'], summary: 'Rename file', parameters: [{ name: 'fileId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'File updated' } } },
            delete: { tags: ['Clients'], summary: 'Delete file', parameters: [{ name: 'fileId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'File deleted' } } }
          },
          '/api/clients/notes': {
            get: { tags: ['Clients'], summary: 'List notes by source', responses: { '200': { description: 'Notes list' } } },
            post: { tags: ['Clients'], summary: 'Create source note', responses: { '201': { description: 'Note created' } } }
          },
          '/api/clients/notes/{noteId}': {
            put: { tags: ['Clients'], summary: 'Update source note', parameters: [{ name: 'noteId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Note updated' } } },
            delete: { tags: ['Clients'], summary: 'Delete source note', parameters: [{ name: 'noteId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Note deleted' } } }
          },
          '/api/clients/{id}/notes': {
            get: { tags: ['Clients'], summary: 'List client notes', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Client notes' } } },
            post: { tags: ['Clients'], summary: 'Create client note', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '201': { description: 'Client note created' } } }
          },
          '/api/clients/{id}/notes/{noteId}': {
            put: { tags: ['Clients'], summary: 'Update client note', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }, { name: 'noteId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Client note updated' } } },
            delete: { tags: ['Clients'], summary: 'Delete client note', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }, { name: 'noteId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Client note deleted' } } }
          },
          '/api/clients/social-links/{id}': {
            get: { tags: ['Clients'], summary: 'List client social links', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Social links list' } } },
            post: { tags: ['Clients'], summary: 'Create client social link', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '201': { description: 'Social link created' } } }
          },
          '/api/clients/social-links/{id}/{linkId}': {
            put: { tags: ['Clients'], summary: 'Update client social link', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }, { name: 'linkId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Social link updated' } } },
            delete: { tags: ['Clients'], summary: 'Delete client social link', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }, { name: 'linkId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Social link deleted' } } }
          },
          '/api/clients/{id}/logo': { post: { tags: ['Clients'], summary: 'Upload client logo', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Logo uploaded' } } } }
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to build Clients OpenAPI document', details: error.message });
    }
  });

  router.get('/docs', async (req, res) => {
    await ensureSchema();
    if (!(await ensureActive())) return res.status(409).json({ error: 'Clients module is not active.' });
    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Sinapsis Clients API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: '/api/clients/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true
      });
    </script>
  </body>
</html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  });

  router.get('/meta', async (req, res) => {
    try {
      await ensureSchema();
      if (!(await ensureActive())) return res.status(409).json({ error: 'Clients module is not active.' });

      const userId = String(req.query.userId || '').trim();
      const companyId = String(req.query.companyId || '').trim();
      const ctx = userId ? await resolveTenantAuthContext(pool, userId) : null;
      const organizationId = ctx?.organizationId || '';
      const companyCtx =
        ctx && companyId ? await resolveCompanyContextForRequest(pool, ctx, companyId) : null;

      const metaCodes = ['CLIENT_TYPE', 'CLIENT_STATUS', ...SOCIAL_CATEGORY_CODES];
      const catMap = await fetchMergedItemsByCategoryCodes(pool, {
        codes: metaCodes,
        organizationId,
        companyIdContext: companyCtx,
        activeOnly: true
      });

      const categories = { types: [] as any[], statuses: [] as any[], socialNetworks: [] as any[] };
      categories.types = catMap.get('CLIENT_TYPE') || [];
      categories.statuses = catMap.get('CLIENT_STATUS') || [];
      for (const code of SOCIAL_CATEGORY_CODES) {
        const list = catMap.get(code) || [];
        for (const it of list) categories.socialNetworks.push(it);
      }

      res.json({ categories });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to load clients metadata', details: error.message });
    }
  });

  router.get('/', async (req, res) => {
    try {
      await ensureSchema();
      if (!(await ensureActive())) return res.status(409).json({ error: 'Clients module is not active.' });

      const companyId = String(req.query.companyId || '').trim();
      const type = String(req.query.type || '').trim();
      const status = String(req.query.status || '').trim();
      const search = String(req.query.search || '').trim();

      const where: string[] = [];
      const params: any[] = [];

      if (companyId) {
        params.push(companyId);
        const idx = params.length;
        where.push(`(EXISTS (SELECT 1 FROM "ClientCompany" cc1 WHERE cc1."clientId" = c.id AND cc1."companyId" = $${idx}) OR c."companyId" = $${idx})`);
      }

      if (type) {
        params.push(type);
        where.push(`c.type = $${params.length}`);
      }

      if (status) {
        params.push(status);
        where.push(`c.status = $${params.length}`);
      }

      if (search) {
        params.push(`%${search}%`);
        where.push(`(LOWER(c.name) LIKE LOWER($${params.length}) OR LOWER(COALESCE(c.email, '')) LIKE LOWER($${params.length}) OR LOWER(c.code) LIKE LOWER($${params.length}) OR LOWER(COALESCE(c.phone, '')) LIKE LOWER($${params.length}))`);
      }

      const result = await pool.query(
        `
          SELECT
            c.*,
            creator.name as "createdByName",
            updater.name as "updatedByName",
            COALESCE(array_remove(array_agg(DISTINCT cc."companyId"), NULL), '{}') as "companyIds",
            COALESCE(array_remove(array_agg(DISTINCT cmp.name), NULL), '{}') as "companyNames"
          FROM "Client" c
          JOIN "User" creator ON creator.id = c."createdById"
          JOIN "User" updater ON updater.id = c."updatedById"
          LEFT JOIN "ClientCompany" cc ON cc."clientId" = c.id
          LEFT JOIN "Company" cmp ON cmp.id = cc."companyId" OR cmp.id = c."companyId"
          ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
          GROUP BY c.id, creator.name, updater.name
          ORDER BY c.name ASC
        `,
        params
      );

      res.json(result.rows);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch clients', details: error.message });
    }
  });

  router.get('/files', async (req, res) => {
    try {
      await ensureSchema();
      if (!(await ensureActive())) return res.status(409).json({ error: 'Clients module is not active.' });

      const sourceModule = String(req.query.sourceModule || '').trim().toUpperCase();
      const sourceId = String(req.query.sourceId || '').trim();

      if (!sourceModule || !sourceId) return res.status(400).json({ error: 'sourceModule and sourceId are required.' });
      if (sourceModule !== FILES_SOURCE_MODULE) return res.status(400).json({ error: 'Unsupported sourceModule for clients endpoint.' });

      if (!(await ensureClientExists(sourceId))) return res.status(404).json({ error: 'Client not found' });

      const files = await pool.query(
        `
          SELECT id, "sourceModule", "sourceId", name, "originalName", "fileUrl", "mimeType", "fileExt", "sizeBytes", status, "createdAt", "updatedAt"
          FROM "EntityFile"
          WHERE "sourceModule" = $1 AND "sourceId" = $2 AND status = 'Active'
          ORDER BY "createdAt" DESC
        `,
        [sourceModule, sourceId]
      );

      res.json(files.rows);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to load files', details: error.message });
    }
  });

  router.get('/notes', async (req, res) => {
    try {
      await ensureSchema();
      if (!(await ensureActive())) return res.status(409).json({ error: 'Clients module is not active.' });

      const sourceModule = String(req.query.sourceModule || '').trim().toUpperCase();
      const sourceId = String(req.query.sourceId || '').trim();

      if (!sourceModule || !sourceId) return res.status(400).json({ error: 'sourceModule and sourceId are required.' });
      if (sourceModule !== NOTES_SOURCE_MODULE) return res.status(400).json({ error: 'Unsupported sourceModule for clients notes endpoint.' });
      if (!(await ensureClientExists(sourceId))) return res.status(404).json({ error: 'Client not found' });

      const notes = await pool.query(
        `
          SELECT id, "sourceModule", "sourceId", note, status, "createdById", "updatedById", "createdAt", "updatedAt"
          FROM "EntityNote"
          WHERE "sourceModule" = $1 AND "sourceId" = $2 AND status = 'Active'
          ORDER BY "createdAt" DESC
        `,
        [sourceModule, sourceId]
      );

      res.json(notes.rows);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to load notes', details: error.message });
    }
  });

  router.post('/notes', async (req, res) => {
    try {
      await ensureSchema();
      if (!(await ensureActive())) return res.status(409).json({ error: 'Clients module is not active.' });

      const sourceModule = String(req.body?.sourceModule || '').trim().toUpperCase();
      const sourceId = String(req.body?.sourceId || '').trim();
      const note = String(req.body?.note || '').trim();
      const createdById = String(req.body?.createdById || '').trim();
      const updatedById = String(req.body?.updatedById || '').trim() || createdById;

      if (!sourceModule || !sourceId || !note || !createdById) {
        return res.status(400).json({ error: 'sourceModule, sourceId, note and createdById are required.' });
      }
      if (sourceModule !== NOTES_SOURCE_MODULE) return res.status(400).json({ error: 'Unsupported sourceModule for clients notes endpoint.' });
      if (!(await ensureClientExists(sourceId))) return res.status(404).json({ error: 'Client not found' });

      const id = crypto.randomUUID();
      await pool.query(
        `
          INSERT INTO "EntityNote" (
            id, "sourceModule", "sourceId", note, status, "createdById", "updatedById", "createdAt", "updatedAt"
          ) VALUES (
            $1, $2, $3, $4, 'Active', $5, $6, NOW(), NOW()
          )
        `,
        [id, sourceModule, sourceId, note, createdById, updatedById]
      );

      const created = await pool.query(
        `
          SELECT id, "sourceModule", "sourceId", note, status, "createdById", "updatedById", "createdAt", "updatedAt"
          FROM "EntityNote"
          WHERE id = $1
          LIMIT 1
        `,
        [id]
      );
      res.status(201).json(created.rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to create note', details: error.message });
    }
  });

  router.put('/notes/:noteId', async (req, res) => {
    try {
      await ensureSchema();
      if (!(await ensureActive())) return res.status(409).json({ error: 'Clients module is not active.' });

      const noteId = String(req.params.noteId || '').trim();
      const note = String(req.body?.note || '').trim();
      const updatedById = String(req.body?.updatedById || '').trim();

      if (!noteId || !note || !updatedById) return res.status(400).json({ error: 'noteId, note and updatedById are required.' });

      const existing = await pool.query(
        'SELECT id FROM "EntityNote" WHERE id = $1 AND "sourceModule" = $2 AND status = $3 LIMIT 1',
        [noteId, NOTES_SOURCE_MODULE, 'Active']
      );
      if (!existing.rows[0]) return res.status(404).json({ error: 'Note not found' });

      await pool.query(
        'UPDATE "EntityNote" SET note = $1, "updatedById" = $2, "updatedAt" = NOW() WHERE id = $3',
        [note, updatedById, noteId]
      );

      const updated = await pool.query(
        `
          SELECT id, "sourceModule", "sourceId", note, status, "createdById", "updatedById", "createdAt", "updatedAt"
          FROM "EntityNote"
          WHERE id = $1
          LIMIT 1
        `,
        [noteId]
      );
      res.json(updated.rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update note', details: error.message });
    }
  });

  router.delete('/notes/:noteId', async (req, res) => {
    try {
      await ensureSchema();
      if (!(await ensureActive())) return res.status(409).json({ error: 'Clients module is not active.' });

      const noteId = String(req.params.noteId || '').trim();
      const updatedById = String(req.body?.updatedById || '').trim();

      if (!noteId || !updatedById) return res.status(400).json({ error: 'noteId and updatedById are required.' });

      const existing = await pool.query(
        'SELECT id FROM "EntityNote" WHERE id = $1 AND "sourceModule" = $2 AND status = $3 LIMIT 1',
        [noteId, NOTES_SOURCE_MODULE, 'Active']
      );
      if (!existing.rows[0]) return res.status(404).json({ error: 'Note not found' });

      await pool.query(
        'UPDATE "EntityNote" SET status = $1, "updatedById" = $2, "updatedAt" = NOW() WHERE id = $3',
        ['Inactive', updatedById, noteId]
      );

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to delete note', details: error.message });
    }
  });

  router.get('/:id/notes', async (req, res) => {
    try {
      await ensureSchema();
      if (!(await ensureActive())) return res.status(409).json({ error: 'Clients module is not active.' });
      const sourceId = String(req.params.id || '').trim();
      if (!(await ensureClientExists(sourceId))) return res.status(404).json({ error: 'Client not found' });

      const notes = await pool.query(
        `
          SELECT id, "sourceModule", "sourceId", note, status, "createdById", "updatedById", "createdAt", "updatedAt"
          FROM "EntityNote"
          WHERE "sourceModule" = $1 AND "sourceId" = $2 AND status = 'Active'
          ORDER BY "createdAt" DESC
        `,
        [NOTES_SOURCE_MODULE, sourceId]
      );
      res.json(notes.rows);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to load notes', details: error.message });
    }
  });

  router.post('/:id/notes', async (req, res) => {
    try {
      await ensureSchema();
      if (!(await ensureActive())) return res.status(409).json({ error: 'Clients module is not active.' });
      const sourceId = String(req.params.id || '').trim();
      const note = String(req.body?.note || '').trim();
      const createdById = String(req.body?.createdById || '').trim();
      const updatedById = String(req.body?.updatedById || '').trim() || createdById;
      if (!(await ensureClientExists(sourceId))) return res.status(404).json({ error: 'Client not found' });
      if (!note || !createdById) return res.status(400).json({ error: 'note and createdById are required.' });

      const id = crypto.randomUUID();
      await pool.query(
        `
          INSERT INTO "EntityNote" (
            id, "sourceModule", "sourceId", note, status, "createdById", "updatedById", "createdAt", "updatedAt"
          ) VALUES (
            $1, $2, $3, $4, 'Active', $5, $6, NOW(), NOW()
          )
        `,
        [id, NOTES_SOURCE_MODULE, sourceId, note, createdById, updatedById]
      );

      const created = await pool.query(
        `SELECT id, "sourceModule", "sourceId", note, status, "createdById", "updatedById", "createdAt", "updatedAt" FROM "EntityNote" WHERE id = $1 LIMIT 1`,
        [id]
      );
      res.status(201).json(created.rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to create note', details: error.message });
    }
  });

  router.put('/:id/notes/:noteId', async (req, res) => {
    try {
      await ensureSchema();
      if (!(await ensureActive())) return res.status(409).json({ error: 'Clients module is not active.' });
      const sourceId = String(req.params.id || '').trim();
      const noteId = String(req.params.noteId || '').trim();
      const note = String(req.body?.note || '').trim();
      const updatedById = String(req.body?.updatedById || '').trim();
      if (!(await ensureClientExists(sourceId))) return res.status(404).json({ error: 'Client not found' });
      if (!note || !updatedById) return res.status(400).json({ error: 'note and updatedById are required.' });

      const existing = await pool.query(
        'SELECT id FROM "EntityNote" WHERE id = $1 AND "sourceModule" = $2 AND "sourceId" = $3 AND status = $4 LIMIT 1',
        [noteId, NOTES_SOURCE_MODULE, sourceId, 'Active']
      );
      if (!existing.rows[0]) return res.status(404).json({ error: 'Note not found' });

      await pool.query(
        'UPDATE "EntityNote" SET note = $1, "updatedById" = $2, "updatedAt" = NOW() WHERE id = $3',
        [note, updatedById, noteId]
      );

      const updated = await pool.query(
        `SELECT id, "sourceModule", "sourceId", note, status, "createdById", "updatedById", "createdAt", "updatedAt" FROM "EntityNote" WHERE id = $1 LIMIT 1`,
        [noteId]
      );
      res.json(updated.rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update note', details: error.message });
    }
  });

  router.delete('/:id/notes/:noteId', async (req, res) => {
    try {
      await ensureSchema();
      if (!(await ensureActive())) return res.status(409).json({ error: 'Clients module is not active.' });
      const sourceId = String(req.params.id || '').trim();
      const noteId = String(req.params.noteId || '').trim();
      const updatedById = String(req.body?.updatedById || '').trim();
      if (!(await ensureClientExists(sourceId))) return res.status(404).json({ error: 'Client not found' });
      if (!updatedById) return res.status(400).json({ error: 'updatedById is required.' });

      const existing = await pool.query(
        'SELECT id FROM "EntityNote" WHERE id = $1 AND "sourceModule" = $2 AND "sourceId" = $3 AND status = $4 LIMIT 1',
        [noteId, NOTES_SOURCE_MODULE, sourceId, 'Active']
      );
      if (!existing.rows[0]) return res.status(404).json({ error: 'Note not found' });

      await pool.query(
        'UPDATE "EntityNote" SET status = $1, "updatedById" = $2, "updatedAt" = NOW() WHERE id = $3',
        ['Inactive', updatedById, noteId]
      );

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to delete note', details: error.message });
    }
  });

  router.post('/files/upload', upload.single('file'), async (req, res) => {
    try {
      await ensureSchema();
      if (!(await ensureActive())) return res.status(409).json({ error: 'Clients module is not active.' });

      const sourceModule = String(req.body?.sourceModule || '').trim().toUpperCase();
      const sourceId = String(req.body?.sourceId || '').trim();
      const createdById = String(req.body?.createdById || '').trim();
      const updatedById = String(req.body?.updatedById || '').trim() || createdById;
      const customName = String(req.body?.name || '').trim();
      const file = req.file;

      if (!sourceModule || !sourceId || !createdById || !file) {
        return res.status(400).json({ error: 'sourceModule, sourceId, createdById and file are required.' });
      }
      if (sourceModule !== FILES_SOURCE_MODULE) return res.status(400).json({ error: 'Unsupported sourceModule for clients endpoint.' });

      if (!(await ensureClientExists(sourceId))) return res.status(404).json({ error: 'Client not found' });

      const orgResult = await pool.query('SELECT * FROM "Organization" LIMIT 1');
      const org = orgResult.rows[0] || { name: 'org', id: '1' };
      const provider = org?.storageProvider || 'Local';
      if (provider !== 'Local') {
        return res.status(501).json({ error: `Storage provider ${provider} not fully implemented yet in the API. Please use Local for now.` });
      }

      const ext = path.extname(file.originalname || '').toLowerCase();
      const baseName = customName || path.basename(file.originalname || 'file', ext) || 'file';
      const safeBaseName = baseName.replace(/[^\w\-\. ]/g, '_').trim() || 'file';
      const filename = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}${ext}`;

      const storagePath = path.resolve(process.cwd(), 'storage');
      const orgFolderName = org.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '_' + org.id.split('-')[0];
      const relativePath = path.join(orgFolderName, 'files', sourceModule.toLowerCase(), sourceId, filename);
      const finalPath = path.join(storagePath, relativePath);
      const finalDir = path.dirname(finalPath);

      if (!fs.existsSync(finalDir)) fs.mkdirSync(finalDir, { recursive: true });
      fs.writeFileSync(finalPath, file.buffer);

      const id = crypto.randomUUID();
      const fileUrl = `/storage/${relativePath.replace(/\\/g, '/')}`;

      await pool.query(
        `
          INSERT INTO "EntityFile" (
            id, "sourceModule", "sourceId", name, "originalName", "fileUrl", "filePath", "mimeType", "fileExt", "sizeBytes", status, "createdById", "updatedById", "createdAt", "updatedAt"
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Active', $11, $12, NOW(), NOW()
          )
        `,
        [
          id,
          sourceModule,
          sourceId,
          safeBaseName,
          file.originalname || safeBaseName,
          fileUrl,
          finalPath,
          file.mimetype || null,
          ext || null,
          Number(file.size || 0),
          createdById,
          updatedById
        ]
      );

      const created = await pool.query(
        `
          SELECT id, "sourceModule", "sourceId", name, "originalName", "fileUrl", "mimeType", "fileExt", "sizeBytes", status, "createdAt", "updatedAt"
          FROM "EntityFile"
          WHERE id = $1
          LIMIT 1
        `,
        [id]
      );

      res.status(201).json(created.rows[0]);
    } catch (error: any) {
      console.error('Error uploading file:', error);
      res.status(500).json({ error: 'Failed to upload file', details: error.message });
    }
  });

  router.put('/files/:fileId', async (req, res) => {
    try {
      await ensureSchema();
      if (!(await ensureActive())) return res.status(409).json({ error: 'Clients module is not active.' });

      const fileId = String(req.params.fileId || '').trim();
      const name = String(req.body?.name || '').trim();
      const updatedById = String(req.body?.updatedById || '').trim();

      if (!fileId || !name || !updatedById) return res.status(400).json({ error: 'fileId, name and updatedById are required.' });

      const existing = await pool.query(
        'SELECT id FROM "EntityFile" WHERE id = $1 AND "sourceModule" = $2 AND status = $3 LIMIT 1',
        [fileId, FILES_SOURCE_MODULE, 'Active']
      );
      if (!existing.rows[0]) return res.status(404).json({ error: 'File not found' });

      await pool.query(
        'UPDATE "EntityFile" SET name = $1, "updatedById" = $2, "updatedAt" = NOW() WHERE id = $3',
        [name, updatedById, fileId]
      );

      const updated = await pool.query(
        `
          SELECT id, "sourceModule", "sourceId", name, "originalName", "fileUrl", "mimeType", "fileExt", "sizeBytes", status, "createdAt", "updatedAt"
          FROM "EntityFile"
          WHERE id = $1
          LIMIT 1
        `,
        [fileId]
      );
      res.json(updated.rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update file', details: error.message });
    }
  });

  router.delete('/files/:fileId', async (req, res) => {
    try {
      await ensureSchema();
      if (!(await ensureActive())) return res.status(409).json({ error: 'Clients module is not active.' });

      const fileId = String(req.params.fileId || '').trim();
      const updatedById = String(req.body?.updatedById || '').trim();
      if (!fileId || !updatedById) return res.status(400).json({ error: 'fileId and updatedById are required.' });

      const existingResult = await pool.query(
        'SELECT id, "filePath" FROM "EntityFile" WHERE id = $1 AND "sourceModule" = $2 AND status = $3 LIMIT 1',
        [fileId, FILES_SOURCE_MODULE, 'Active']
      );
      const existing = existingResult.rows[0];
      if (!existing) return res.status(404).json({ error: 'File not found' });

      await pool.query(
        'UPDATE "EntityFile" SET status = $1, "updatedById" = $2, "updatedAt" = NOW() WHERE id = $3',
        ['Inactive', updatedById, fileId]
      );

      const filePath = String(existing.filePath || '').trim();
      if (filePath && fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (err) {
          console.warn('Could not delete physical file:', err);
        }
      }

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to delete file', details: error.message });
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      await ensureSchema();
      if (!(await ensureActive())) return res.status(409).json({ error: 'Clients module is not active.' });

      const client = await getClientById(req.params.id);
      if (!client) return res.status(404).json({ error: 'Client not found' });

      res.json(client);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch client', details: error.message });
    }
  });

  router.get('/social-links/:id', async (req, res) => {
    try {
      await ensureSchema();
      if (!(await ensureActive())) return res.status(409).json({ error: 'Clients module is not active.' });

      const clientId = String(req.params.id || '').trim();
      if (!(await ensureClientExists(clientId))) return res.status(404).json({ error: 'Client not found' });

      const socialLinks = await pool.query(
        `
          SELECT
            sl.id,
            sl."categoryItemId",
            ci.name as "categoryItemName",
            sl.url,
            sl.status,
            sl."sortOrder",
            sl."createdAt",
            sl."updatedAt"
          FROM "EntitySocialLink" sl
          JOIN "CategoryItem" ci ON ci.id = sl."categoryItemId"
          JOIN "Category" c ON c.id = ci."categoryId" AND c.code = ANY($1)
          WHERE sl."entityType" = 'Client' AND sl."entityId" = $2 AND sl.status = 'Active'
          ORDER BY sl."sortOrder" ASC, sl."createdAt" ASC
        `,
        [SOCIAL_CATEGORY_CODES, clientId]
      );

      res.json(socialLinks.rows);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to fetch social links', details: error.message });
    }
  });

  router.post('/social-links/:id', async (req, res) => {
    try {
      await ensureSchema();
      if (!(await ensureActive())) return res.status(409).json({ error: 'Clients module is not active.' });

      const clientId = String(req.params.id || '').trim();
      if (!(await ensureClientExists(clientId))) return res.status(404).json({ error: 'Client not found' });

      const categoryItemId = String(req.body?.categoryItemId || '').trim();
      const url = String(req.body?.url || '').trim();
      const sortOrder = Number(req.body?.sortOrder || 0);
      const createdById = String(req.body?.createdById || '').trim();
      const updatedById = String(req.body?.updatedById || '').trim() || createdById;

      if (!categoryItemId || !url || !createdById) {
        return res.status(400).json({ error: 'categoryItemId, url and createdById are required.' });
      }

      const itemResult = await pool.query(
        `
          SELECT ci.id
          FROM "CategoryItem" ci
          JOIN "Category" c ON c.id = ci."categoryId"
          WHERE ci.id = $1 AND c.code = ANY($2)
          LIMIT 1
        `,
        [categoryItemId, SOCIAL_CATEGORY_CODES]
      );
      if (!itemResult.rows[0]) {
        return res.status(400).json({ error: 'Invalid social network category item.' });
      }

      const id = crypto.randomUUID();
      await pool.query(
        `
          INSERT INTO "EntitySocialLink" (
            id, "entityType", "entityId", "categoryItemId", url, status, "sortOrder", "createdById", "updatedById", "createdAt", "updatedAt"
          ) VALUES (
            $1, 'Client', $2, $3, $4, 'Active', $5, $6, $7, NOW(), NOW()
          )
        `,
        [id, clientId, categoryItemId, url, Number.isFinite(sortOrder) ? sortOrder : 0, createdById, updatedById]
      );

      const created = await pool.query(
        `
          SELECT sl.id, sl."categoryItemId", ci.name as "categoryItemName", sl.url, sl.status, sl."sortOrder", sl."createdAt", sl."updatedAt"
          FROM "EntitySocialLink" sl
          JOIN "CategoryItem" ci ON ci.id = sl."categoryItemId"
          WHERE sl.id = $1
          LIMIT 1
        `,
        [id]
      );

      res.status(201).json(created.rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to create social link', details: error.message });
    }
  });

  router.put('/social-links/:id/:linkId', async (req, res) => {
    try {
      await ensureSchema();
      if (!(await ensureActive())) return res.status(409).json({ error: 'Clients module is not active.' });

      const clientId = String(req.params.id || '').trim();
      const linkId = String(req.params.linkId || '').trim();
      if (!(await ensureClientExists(clientId))) return res.status(404).json({ error: 'Client not found' });

      const existing = await pool.query(
        'SELECT id FROM "EntitySocialLink" WHERE id = $1 AND "entityType" = $2 AND "entityId" = $3 LIMIT 1',
        [linkId, 'Client', clientId]
      );
      if (!existing.rows[0]) return res.status(404).json({ error: 'Social link not found' });

      const categoryItemId = String(req.body?.categoryItemId || '').trim();
      const url = String(req.body?.url || '').trim();
      const sortOrder = Number(req.body?.sortOrder || 0);
      const updatedById = String(req.body?.updatedById || '').trim();

      if (!categoryItemId || !url || !updatedById) {
        return res.status(400).json({ error: 'categoryItemId, url and updatedById are required.' });
      }

      const itemResult = await pool.query(
        `
          SELECT ci.id
          FROM "CategoryItem" ci
          JOIN "Category" c ON c.id = ci."categoryId"
          WHERE ci.id = $1 AND c.code = ANY($2)
          LIMIT 1
        `,
        [categoryItemId, SOCIAL_CATEGORY_CODES]
      );
      if (!itemResult.rows[0]) {
        return res.status(400).json({ error: 'Invalid social network category item.' });
      }

      await pool.query(
        `
          UPDATE "EntitySocialLink"
          SET "categoryItemId" = $1,
              url = $2,
              "sortOrder" = $3,
              "updatedById" = $4,
              "updatedAt" = NOW()
          WHERE id = $5
        `,
        [categoryItemId, url, Number.isFinite(sortOrder) ? sortOrder : 0, updatedById, linkId]
      );

      const updated = await pool.query(
        `
          SELECT sl.id, sl."categoryItemId", ci.name as "categoryItemName", sl.url, sl.status, sl."sortOrder", sl."createdAt", sl."updatedAt"
          FROM "EntitySocialLink" sl
          JOIN "CategoryItem" ci ON ci.id = sl."categoryItemId"
          WHERE sl.id = $1
          LIMIT 1
        `,
        [linkId]
      );

      res.json(updated.rows[0]);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update social link', details: error.message });
    }
  });

  router.delete('/social-links/:id/:linkId', async (req, res) => {
    try {
      await ensureSchema();
      if (!(await ensureActive())) return res.status(409).json({ error: 'Clients module is not active.' });

      const clientId = String(req.params.id || '').trim();
      const linkId = String(req.params.linkId || '').trim();
      const updatedById = String(req.body?.updatedById || '').trim();
      if (!updatedById) return res.status(400).json({ error: 'updatedById is required.' });

      const existing = await pool.query(
        'SELECT id FROM "EntitySocialLink" WHERE id = $1 AND "entityType" = $2 AND "entityId" = $3 AND status = $4 LIMIT 1',
        [linkId, 'Client', clientId, 'Active']
      );
      if (!existing.rows[0]) return res.status(404).json({ error: 'Social link not found' });

      await pool.query(
        'UPDATE "EntitySocialLink" SET status = $1, "updatedById" = $2, "updatedAt" = NOW() WHERE id = $3',
        ['Inactive', updatedById, linkId]
      );

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to delete social link', details: error.message });
    }
  });

  router.post('/', async (req, res) => {
    try {
      await ensureSchema();
      if (!(await ensureActive())) return res.status(409).json({ error: 'Clients module is not active.' });

      const name = String(req.body?.name || '').trim();
      const oneCompany = String(req.body?.companyId || '').trim();
      const manyCompanies = normalizeCompanyIds(req.body?.companyIds || []);
      const createdById = String(req.body?.createdById || '').trim();
      const updatedById = String(req.body?.updatedById || '').trim() || createdById;

      const companyIds = Array.from(new Set([...(oneCompany ? [oneCompany] : []), ...manyCompanies]));
      const primaryCompanyId = oneCompany || companyIds[0] || '';

      if (!name || !primaryCompanyId || companyIds.length === 0 || !createdById) {
        return res.status(400).json({ error: 'name, companyIds and createdById are required.' });
      }

      const id = crypto.randomUUID();
      const code = await nextClientCode(primaryCompanyId);

      await pool.query(
        `
          INSERT INTO "Client" (
            id, code, name, email, phone, "taxId", type, status,
            address, city, state, zipcode, country, notes,
            "companyId", "createdById", "updatedById", "createdAt", "updatedAt"
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8,
            $9, $10, $11, $12, $13, $14,
            $15, $16, $17, NOW(), NOW()
          )
        `,
        [
          id,
          code,
          name,
          String(req.body?.email || '').trim() || null,
          String(req.body?.phone || '').trim() || null,
          String(req.body?.taxId || '').trim() || null,
          String(req.body?.type || 'Customer').trim() || 'Customer',
          String(req.body?.status || 'Lead').trim() || 'Lead',
          String(req.body?.address || '').trim() || null,
          String(req.body?.city || '').trim() || null,
          String(req.body?.state || '').trim() || null,
          String(req.body?.zipcode || '').trim() || null,
          String(req.body?.country || '').trim() || null,
          String(req.body?.notes || '').trim() || null,
          primaryCompanyId,
          createdById,
          updatedById
        ]
      );

      for (const cid of companyIds) {
        await pool.query(
          'INSERT INTO "ClientCompany" (id, "clientId", "companyId", "isPrimary", "createdAt") VALUES ($1, $2, $3, $4, NOW()) ON CONFLICT ("clientId", "companyId") DO NOTHING',
          [crypto.randomUUID(), id, cid, cid === primaryCompanyId]
        );
      }

      const client = await getClientById(id);
      res.status(201).json(client);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to create client', details: error.message });
    }
  });

  router.put('/:id', async (req, res) => {
    try {
      await ensureSchema();
      if (!(await ensureActive())) return res.status(409).json({ error: 'Clients module is not active.' });

      const clientId = String(req.params.id || '').trim();
      const existing = await getClientById(clientId);
      if (!existing) return res.status(404).json({ error: 'Client not found' });

      const name = String(req.body?.name || existing.name || '').trim();
      const updatedById = String(req.body?.updatedById || existing.updatedById || '').trim();

      const oneCompany = String(req.body?.companyId || '').trim();
      const manyCompanies = normalizeCompanyIds(req.body?.companyIds || []);
      const existingCompanyIds = Array.isArray(existing.companyIds) && existing.companyIds.length > 0
        ? existing.companyIds
        : (existing.companyId ? [existing.companyId] : []);

      const nextCompanyIds = manyCompanies.length > 0 || oneCompany
        ? Array.from(new Set([...(oneCompany ? [oneCompany] : []), ...manyCompanies]))
        : existingCompanyIds;

      const primaryCompanyId = oneCompany || nextCompanyIds[0] || existing.companyId || '';

      if (!name || !updatedById || !primaryCompanyId || nextCompanyIds.length === 0) {
        return res.status(400).json({ error: 'name, companyIds and updatedById are required.' });
      }

      await pool.query(
        `
          UPDATE "Client"
          SET name = $1,
              email = $2,
              phone = $3,
              "taxId" = $4,
              type = $5,
              status = $6,
              address = $7,
              city = $8,
              country = $9,
              "state" = $10,
              "zipcode" = $11,
              notes = $12,
              "companyId" = $13,
              "updatedById" = $14,
              "updatedAt" = NOW()
          WHERE id = $15
        `,
        [
          name,
          String(req.body?.email || existing.email || '').trim() || null,
          String(req.body?.phone || existing.phone || '').trim() || null,
          String(req.body?.taxId || existing.taxId || '').trim() || null,
          String(req.body?.type || existing.type || 'Customer').trim() || 'Customer',
          String(req.body?.status || existing.status || 'Lead').trim() || 'Lead',
          String(req.body?.address || existing.address || '').trim() || null,
          String(req.body?.city || existing.city || '').trim() || null,
          String(req.body?.country || existing.country || '').trim() || null,
          String(req.body?.state || existing.state || '').trim() || null,
          String(req.body?.zipcode || existing.zipcode || '').trim() || null,
          String(req.body?.notes || existing.notes || '').trim() || null,
          primaryCompanyId,
          updatedById,
          clientId
        ]
      );

      await pool.query('DELETE FROM "ClientCompany" WHERE "clientId" = $1', [clientId]);
      for (const cid of nextCompanyIds) {
        await pool.query(
          'INSERT INTO "ClientCompany" (id, "clientId", "companyId", "isPrimary", "createdAt") VALUES ($1, $2, $3, $4, NOW()) ON CONFLICT ("clientId", "companyId") DO NOTHING',
          [crypto.randomUUID(), clientId, cid, cid === primaryCompanyId]
        );
      }

      const client = await getClientById(clientId);
      res.json(client);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update client', details: error.message });
    }
  });

  router.patch('/:id/status', async (req, res) => {
    try {
      await ensureSchema();
      if (!(await ensureActive())) return res.status(409).json({ error: 'Clients module is not active.' });

      const status = String(req.body?.status || '').trim();
      const updatedById = String(req.body?.updatedById || '').trim();

      if (!status) return res.status(400).json({ error: 'status is required.' });
      if (!updatedById) return res.status(400).json({ error: 'updatedById is required.' });

      await pool.query(
        'UPDATE "Client" SET status = $1, "updatedById" = $2, "updatedAt" = NOW() WHERE id = $3',
        [status, updatedById, req.params.id]
      );

      const client = await getClientById(req.params.id);
      if (!client) return res.status(404).json({ error: 'Client not found' });

      res.json(client);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to update client status', details: error.message });
    }
  });  router.delete('/:id', async (req, res) => {
    try {
      await ensureSchema();
      if (!(await ensureActive())) return res.status(409).json({ error: 'Clients module is not active.' });

      const updatedById = String(req.body?.updatedById || '').trim();
      if (!updatedById) return res.status(400).json({ error: 'updatedById is required.' });

      await pool.query(
        'UPDATE "Client" SET status = $1, "updatedById" = $2, "updatedAt" = NOW() WHERE id = $3',
        ['Inactive', updatedById, req.params.id]
      );

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to deactivate client', details: error.message });
    }
  });

  router.post('/:id/logo', upload.single('logo'), async (req, res) => {
    try {
      await ensureSchema();
      if (!(await ensureActive())) return res.status(409).json({ error: 'Clients module is not active.' });

      const { id } = req.params;
      const file = req.file;
      if (!file) return res.status(400).json({ error: 'No file uploaded' });

      const orgResult = await pool.query('SELECT * FROM "Organization" LIMIT 1');
      const org = orgResult.rows[0] || { name: 'org', id: '1' };
      const provider = org?.storageProvider || 'Local';

      let logoUrl = '';

      if (provider === 'Local') {
          const storagePath = path.resolve(process.cwd(), 'storage');
          const orgFolderName = org.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '_' + org.id.split('-')[0];
          const logoFilename = `client_logo_${Date.now()}${path.extname(file.originalname)}`;
          const finalPath = path.join(storagePath, orgFolderName, 'clients', logoFilename);
          
          if (!fs.existsSync(path.dirname(finalPath))) {
              fs.mkdirSync(path.dirname(finalPath), { recursive: true });
          }
          
          fs.writeFileSync(finalPath, file.buffer);
          logoUrl = `/storage/${orgFolderName}/clients/${logoFilename}`;
      } else {
          return res.status(501).json({ error: `Storage provider ${provider} not fully implemented yet in the API. Please use Local for now.` });
      }

      await pool.query('UPDATE "Client" SET "logoUrl" = $1, "updatedAt" = NOW() WHERE id = $2', [logoUrl, id]);
      
      const client = await getClientById(id);
      res.json({ success: true, logoUrl, client });
    } catch (error: any) {
      console.error('Error uploading client logo:', error);
      res.status(500).json({ error: 'Failed to upload client logo', details: error.message });
    }
  });

  app.use('/api/clients', router);

  return { basePath: '/api/clients', openapiPath: '/api/clients/openapi.json', docsPath: '/api/clients/docs' };
}






