import express from 'express';
import type pg from 'pg';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import {
  adminOnly,
  createAdminToken,
  isAdminCredentialValid,
  validateAdminEnv,
  verifyAdminToken
} from './auth';
import { propagateReferenceTemplateToAllCompanies } from '@sinapsis/module-sdk-server';
import { loadModuleAdminRoutes } from './loadModuleAdminRoutes';
import { isPlainObject, isValidEmail, mergeSmtpDraftOntoStored, normalizeSmtpConfig, sendTestEmailWithConfig } from '../smtpMail';
import { STORAGE_ROOT } from '../paths';

type PrismaLike = any;

interface CreateAdminRouterArgs {
  prisma: PrismaLike;
  pool: pg.Pool;
}

type TranslationRow = {
  id: string;
  locale: string;
  namespace: string | null;
  key: string;
  value: string;
  updatedAt: Date;
};

const LOGIN_WINDOW_MS = 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;
const loginAttempts = new Map<string, number[]>();

const PLATFORM_KEYS = new Set(['smtp', 'storage']);

const CORE_ID = 1;
const uploadMemory = multer({ storage: multer.memoryStorage() });

const defaultPublicCore = () => ({
  appName: 'Sinapsis CRM/ERP',
  logoUrl: null as string | null,
  faviconUrl: null as string | null,
  loginBackgroundUrl: null as string | null,
  primaryColor: '#eb4d4b',
  secondaryColor: '#f4f4f5',
  sidebarBackgroundColor: '#000000',
  sidebarLogoUrl: null as string | null,
  menuBarColor: '',
  dateFormat: 'YYYY/MM/DD',
  timeFormat: 'HH:mm',
  timezone: 'UTC',
  baseCurrency: 'USD' as string | null,
  moneyFormat: '1,234.56',
  currencyPosition: 'Prefix',
  defaultLanguage: 'es'
});

/** Subset safe for unauthenticated clients (branding + locale defaults). */
export const coreRowToPublic = (row: Record<string, unknown> | null | undefined) => {
  const d = defaultPublicCore();
  if (!row) return d;
  return {
    appName: String(row.appName ?? d.appName),
    logoUrl: row.logoUrl != null && String(row.logoUrl) !== '' ? String(row.logoUrl) : null,
    faviconUrl: row.faviconUrl != null && String(row.faviconUrl) !== '' ? String(row.faviconUrl) : null,
    loginBackgroundUrl:
      row.loginBackgroundUrl != null && String(row.loginBackgroundUrl) !== ''
        ? String(row.loginBackgroundUrl)
        : null,
    primaryColor: String(row.primaryColor ?? d.primaryColor),
    secondaryColor: String(row.secondaryColor ?? d.secondaryColor),
    sidebarBackgroundColor: String(row.sidebarBackgroundColor ?? d.sidebarBackgroundColor),
    sidebarLogoUrl:
      row.sidebarLogoUrl != null && String(row.sidebarLogoUrl) !== '' ? String(row.sidebarLogoUrl) : null,
    menuBarColor: String(row.menuBarColor ?? d.menuBarColor),
    dateFormat: String(row.dateFormat ?? d.dateFormat),
    timeFormat: String(row.timeFormat ?? d.timeFormat),
    timezone: String(row.timezone ?? d.timezone),
    baseCurrency: row.baseCurrency != null && String(row.baseCurrency) !== '' ? String(row.baseCurrency) : null,
    moneyFormat: String(row.moneyFormat ?? d.moneyFormat),
    currencyPosition: String(row.currencyPosition ?? d.currencyPosition),
    defaultLanguage: String(row.defaultLanguage ?? d.defaultLanguage)
  };
};

/** Idempotent DDL so Core works even if migrate was skipped or Prisma client is outdated. */
const ensureCoreTableWithPool = async (pool: pg.Pool) => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "Core" (
      "id" INTEGER NOT NULL DEFAULT 1,
      "appName" TEXT NOT NULL DEFAULT 'Sinapsis CRM/ERP',
      "logoUrl" TEXT,
      "faviconUrl" TEXT,
      "primaryColor" TEXT NOT NULL DEFAULT '#eb4d4b',
      "secondaryColor" TEXT NOT NULL DEFAULT '#f4f4f5',
      "sidebarBackgroundColor" TEXT NOT NULL DEFAULT '#000000',
      "sidebarLogoUrl" TEXT,
      "menuBarColor" TEXT NOT NULL DEFAULT '',
      "dateFormat" TEXT NOT NULL DEFAULT 'YYYY/MM/DD',
      "timeFormat" TEXT NOT NULL DEFAULT 'HH:mm',
      "timezone" TEXT NOT NULL DEFAULT 'UTC',
      "baseCurrency" TEXT DEFAULT 'USD',
      "moneyFormat" TEXT NOT NULL DEFAULT '1,234.56',
      "currencyPosition" TEXT NOT NULL DEFAULT 'Prefix',
      "defaultLanguage" TEXT NOT NULL DEFAULT 'es',
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Core_pkey" PRIMARY KEY ("id")
    )
  `);
  await pool.query(`INSERT INTO "Core" ("id") VALUES ($1) ON CONFLICT ("id") DO NOTHING`, [CORE_ID]);
  await pool.query(
    `ALTER TABLE "Core" ADD COLUMN IF NOT EXISTS "sidebarBackgroundColor" TEXT NOT NULL DEFAULT '#000000'`
  );
  await pool.query(`ALTER TABLE "Core" ADD COLUMN IF NOT EXISTS "sidebarLogoUrl" TEXT`);
  await pool.query(`ALTER TABLE "Core" ADD COLUMN IF NOT EXISTS "loginBackgroundUrl" TEXT`);
  await pool.query(`ALTER TABLE "Core" DROP COLUMN IF EXISTS "menuBarIcon"`);
};

const getCoreRow = async (pool: pg.Pool, prisma: PrismaLike) => {
  await ensureCoreTableWithPool(pool);
  if (prisma?.core?.upsert && prisma?.core?.findUnique) {
    try {
      await prisma.core.upsert({
        where: { id: CORE_ID },
        create: { id: CORE_ID },
        update: {}
      });
      const row = await prisma.core.findUnique({ where: { id: CORE_ID } });
      if (row) return row;
    } catch (e: unknown) {
      console.warn('[admin/core] Prisma Core failed, using SQL:', (e as Error)?.message || e);
    }
  }
  const r = await pool.query('SELECT * FROM "Core" WHERE id = $1', [CORE_ID]);
  if (!r.rows[0]) {
    throw new Error('Core row missing after bootstrap');
  }
  return r.rows[0];
};

const CORE_PATCH_KEYS = new Set([
  'appName',
  'logoUrl',
  'faviconUrl',
  'loginBackgroundUrl',
  'primaryColor',
  'secondaryColor',
  'sidebarBackgroundColor',
  'sidebarLogoUrl',
  'menuBarColor',
  'dateFormat',
  'timeFormat',
  'timezone',
  'baseCurrency',
  'moneyFormat',
  'currencyPosition',
  'defaultLanguage'
]);

const updateCoreRowWithPool = async (pool: pg.Pool, patch: Record<string, unknown>) => {
  const entries = Object.entries(patch).filter(([k, v]) => CORE_PATCH_KEYS.has(k) && v !== undefined);
  if (!entries.length) {
    throw new Error('No fields to update');
  }
  const setParts: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  for (const [key, val] of entries) {
    setParts.push(`"${key}" = $${i}`);
    vals.push(val);
    i += 1;
  }
  setParts.push(`"updatedAt" = NOW()`);
  vals.push(CORE_ID);
  const sql = `UPDATE "Core" SET ${setParts.join(', ')} WHERE id = $${i} RETURNING *`;
  const r = await pool.query(sql, vals);
  return r.rows[0];
};

export const loadPublicCorePayload = async (prisma: PrismaLike, pool: pg.Pool) => {
  try {
    const row = await getCoreRow(pool, prisma);
    return coreRowToPublic(row as Record<string, unknown>);
  } catch {
    return defaultPublicCore();
  }
};

const isLikelyColor = (s: string) => {
  const t = String(s || '').trim();
  if (!t) return true;
  if (/^transparent$/i.test(t)) return true;
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(t);
};

const pickOrganizationData = (body: Record<string, unknown>, mode: 'create' | 'update') => {
  const str = (v: unknown) => (v === undefined || v === null ? undefined : String(v));
  const json = (v: unknown) => {
    if (v === undefined) return undefined;
    if (v === null) return null;
    return v;
  };
  const data: Record<string, unknown> = {};
  if (mode === 'create') {
    const name = String(body?.name ?? '').trim();
    if (!name) {
      const err = new Error('Name is required');
      (err as any).status = 400;
      throw err;
    }
    data.name = name;
  } else if (body.name !== undefined) {
    const name = String(body.name ?? '').trim();
    if (!name) {
      const err = new Error('Name cannot be empty');
      (err as any).status = 400;
      throw err;
    }
    data.name = name;
  }
  const fields = [
    'currencyPosition',
    'dateFormat',
    'defaultLanguage',
    'moneyFormat',
    'timeFormat',
    'timezone',
    'baseCurrency',
    'address',
    'addressAdditional',
    'zipcode',
    'city',
    'state',
    'country',
    'email',
    'taxId',
    'website',
    'storageProvider'
  ] as const;
  for (const key of fields) {
    if (body[key] === undefined) continue;
    const v = str(body[key]);
    if (v !== undefined) data[key] = v;
  }
  if (body.subscriptionPlanId !== undefined) {
    const sid = str(body.subscriptionPlanId);
    if (sid) data.subscriptionPlanId = sid;
  }
  if (body.storageSettings !== undefined) data.storageSettings = json(body.storageSettings);
  return data;
};

const ensureAdminTables = async (pool: pg.Pool) => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "PlatformSetting" (
      "key" TEXT PRIMARY KEY,
      "value" JSONB NOT NULL,
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "TranslationOverride" (
      "id" TEXT PRIMARY KEY,
      "locale" TEXT NOT NULL,
      "namespace" TEXT,
      "key" TEXT NOT NULL,
      "value" TEXT NOT NULL,
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "TranslationOverride_locale_namespace_key_key"
    ON "TranslationOverride" ("locale", "namespace", "key")
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS "TranslationOverride_locale_idx"
    ON "TranslationOverride" ("locale")
  `);
};

const ensureRateLimit = (ip: string): boolean => {
  const now = Date.now();
  const bucket = (loginAttempts.get(ip) || []).filter((ts) => now - ts < LOGIN_WINDOW_MS);
  if (bucket.length >= LOGIN_MAX_ATTEMPTS) {
    loginAttempts.set(ip, bucket);
    return false;
  }
  bucket.push(now);
  loginAttempts.set(ip, bucket);
  return true;
};

const setDeepValue = (target: Record<string, unknown>, dottedKey: string, value: string) => {
  const parts = dottedKey.split('.').map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return;
  let current: Record<string, unknown> = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    if (typeof current[part] !== 'object' || current[part] === null || Array.isArray(current[part])) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
};

export const buildTranslationOverridesObject = (rows: TranslationRow[], locale: string) => {
  const translation: Record<string, unknown> = {};
  const normalizedLocale = String(locale || '').trim().toLowerCase();
  for (const row of rows) {
    if (String(row.locale || '').trim().toLowerCase() !== normalizedLocale) continue;
    const ns = String(row.namespace || '').trim();
    const fullKey = ns && ns !== 'translation' ? `${ns}.${row.key}` : row.key;
    setDeepValue(translation, fullKey, row.value);
  }
  return { translation };
};

const proxyToLegacyPath = (legacyBasePath: string): express.RequestHandler => {
  return (req, res) => {
    // Preserve method/body on redirects (POST/PUT/DELETE) when forwarding to legacy endpoints.
    const rest = req.url || '';
    const target = `${legacyBasePath}${rest}`;
    res.redirect(307, target);
  };
};

export const createAdminRouter = async ({ prisma, pool }: CreateAdminRouterArgs) => {
  const router = express.Router();

  router.post('/login', async (req, res) => {
    const ip = String(req.ip || req.socket?.remoteAddress || 'unknown');
    if (!ensureRateLimit(ip)) {
      return res.status(429).json({ error: 'Too many login attempts. Try again in one minute.' });
    }

    const envError = validateAdminEnv();
    if (envError) return res.status(500).json({ error: envError });

    const email = String(req.body?.email || '').trim();
    const password = String(req.body?.password || '');
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    if (!isAdminCredentialValid(email, password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = createAdminToken(email);
    return res.json({ token });
  });

  router.get('/session', (req, res) => {
    const auth = String(req.headers.authorization || '').trim();
    const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
    const payload = verifyAdminToken(token);
    if (!payload) return res.status(401).json({ error: 'Invalid admin session' });
    return res.json({ admin: true, email: payload.sub });
  });

  router.post('/logout', (_req, res) => {
    res.json({ success: true });
  });

  router.use(adminOnly);

  router.get('/organizations', async (_req, res) => {
    try {
      const organizations = await prisma.organization.findMany({
        orderBy: { createdAt: 'asc' },
        include: {
          _count: { select: { companies: true } },
          subscriptionPlan: { select: { id: true, code: true, name: true, status: true } }
        }
      });
      const userCounts = await pool.query(
        `
        SELECT c."organizationId" AS "organizationId", COUNT(u.id)::int AS "usersCount"
        FROM "Company" c
        LEFT JOIN "User" u ON u."companyId" = c.id
        GROUP BY c."organizationId"
      `
      );
      const usersByOrg = new Map<string, number>(
        userCounts.rows.map((row: { organizationId: string; usersCount: number }) => [row.organizationId, Number(row.usersCount || 0)])
      );
      return res.json(
        organizations.map((org: any) => ({
          ...org,
          usersCount: usersByOrg.get(org.id) || 0
        }))
      );
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to fetch organizations', details: error?.message || String(error) });
    }
  });

  router.post('/organizations', async (req, res) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const data = pickOrganizationData(body, 'create');
      const adminEmailRequested = String(body.adminEmail ?? '').trim().toLowerCase();
      const adminPasswordRequested = String(body.adminPassword ?? '').trim();
      const adminFirstName = String(body.adminFirstName ?? '').trim() || 'Admin';
      const adminLastName = String(body.adminLastName ?? '').trim();

      const created = await prisma.$transaction(async (tx: PrismaLike) => {
        let createData = { ...data } as Record<string, unknown>;
        if (!createData.subscriptionPlanId) {
          const free = await tx.subscriptionPlan.findUnique({ where: { code: 'FREE' } });
          if (!free) {
            const err = new Error('Default FREE subscription plan is missing. Run database migrations.');
            (err as any).status = 500;
            throw err;
          }
          createData = { ...createData, subscriptionPlanId: free.id };
        } else {
          const plan = await tx.subscriptionPlan.findUnique({
            where: { id: String(createData.subscriptionPlanId) }
          });
          if (!plan) {
            const err = new Error('subscriptionPlanId does not reference a valid plan.');
            (err as any).status = 400;
            throw err;
          }
        }

        const org = await tx.organization.create({ data: createData as any });
        const company = await tx.company.create({
          data: {
            name: org.name,
            organizationId: org.id,
            dateFormat: org.dateFormat,
            timeFormat: org.timeFormat,
            timezone: org.timezone,
            moneyFormat: org.moneyFormat,
            currencyPosition: org.currencyPosition,
            defaultLanguage: org.defaultLanguage,
            baseCurrency: org.baseCurrency ?? undefined
          }
        });

        const adminRole = await tx.role.findUnique({ where: { name: 'Administrator' } });

        let adminEmail = adminEmailRequested;
        if (!adminEmail || !isValidEmail(adminEmail)) {
          const orgEmail = String(org.email ?? '')
            .trim()
            .toLowerCase();
          if (orgEmail && isValidEmail(orgEmail)) adminEmail = orgEmail;
        }
        if (!adminEmail || !isValidEmail(adminEmail)) {
          adminEmail = `admin.${String(org.id).replace(/-/g, '').slice(0, 12)}@tenant.invalid`;
        }

        let finalEmail = adminEmail;
        for (let attempt = 0; attempt < 50; attempt += 1) {
          const clash = await tx.user.findUnique({ where: { email: finalEmail } });
          if (!clash) break;
          const at = adminEmail.lastIndexOf('@');
          const local = at > 0 ? adminEmail.slice(0, at) : 'admin';
          const domain = at > 0 ? adminEmail.slice(at + 1) : 'tenant.invalid';
          finalEmail = `${local}+${attempt + 1}@${domain}`;
        }

        const passwordWasGenerated = !adminPasswordRequested;
        const password = adminPasswordRequested || crypto.randomBytes(10).toString('hex');
        const lastName = adminLastName || String(org.name || 'User').slice(0, 80);
        const displayName = [adminFirstName, lastName].filter(Boolean).join(' ').trim() || 'Administrator';

        const user = await tx.user.create({
          data: {
            email: finalEmail,
            firstName: adminFirstName,
            lastName,
            name: displayName,
            password,
            role: 'Administrator',
            roleId: adminRole?.id ?? null,
            companyId: company.id
          }
        });

        const bootstrap: { adminEmail: string; temporaryPassword?: string } = { adminEmail: finalEmail };
        if (passwordWasGenerated) bootstrap.temporaryPassword = password;

        return { org, company, user, bootstrap };
      });

      return res.status(201).json({
        ...created.org,
        defaultCompany: created.company,
        defaultAdmin: { id: created.user.id, email: created.user.email },
        bootstrap: created.bootstrap
      });
    } catch (error: any) {
      const status = error?.status || 500;
      return res.status(status).json({ error: error?.message || 'Failed to create organization', details: error?.message });
    }
  });

  router.put('/organizations/:id', async (req, res) => {
    try {
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id is required' });
      const data = pickOrganizationData(req.body || {}, 'update');
      if (Object.keys(data).length === 0) return res.status(400).json({ error: 'No fields to update' });
      const org = await prisma.organization.update({ where: { id }, data });
      return res.json(org);
    } catch (error: any) {
      if (error?.code === 'P2025') return res.status(404).json({ error: 'Organization not found' });
      const status = error?.status || 500;
      return res.status(status).json({ error: error?.message || 'Failed to update organization', details: error?.message });
    }
  });

  router.delete('/organizations/:id', async (req, res) => {
    try {
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id is required' });
      const org = await prisma.organization.findUnique({
        where: { id },
        include: { _count: { select: { companies: true } } }
      });
      if (!org) return res.status(404).json({ error: 'Organization not found' });
      const userCounts = await pool.query(
        `SELECT COUNT(u.id)::int AS "usersCount"
         FROM "Company" c
         LEFT JOIN "User" u ON u."companyId" = c.id
         WHERE c."organizationId" = $1`,
        [id]
      );
      const usersCount = Number(userCounts.rows[0]?.usersCount || 0);
      if (org._count.companies > 0 || usersCount > 0) {
        return res.status(409).json({
          error: 'Cannot delete organization while it has companies or users. Remove them first.'
        });
      }
      await prisma.organization.delete({ where: { id } });
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to delete organization', details: error?.message || String(error) });
    }
  });

  router.get('/core', async (_req, res) => {
    try {
      const row = await getCoreRow(pool, prisma);
      return res.json(row);
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to read core settings', details: error?.message || String(error) });
    }
  });

  router.put('/core', async (req, res) => {
    try {
      await ensureCoreTableWithPool(pool);
      const body = req.body || {};
      const data: Record<string, unknown> = {};
      const assignStr = (key: string, maxLen = 500) => {
        if (body[key] === undefined) return;
        const v = String(body[key] ?? '').trim();
        data[key] = v.slice(0, maxLen);
      };
      if (body.appName !== undefined) {
        const v = String(body.appName ?? '').trim();
        if (!v) return res.status(400).json({ error: 'appName cannot be empty' });
        data.appName = v.slice(0, 200);
      }
      if (body.logoUrl !== undefined) {
        const v = String(body.logoUrl ?? '').trim();
        data.logoUrl = v ? v.slice(0, 2000) : null;
      }
      if (body.faviconUrl !== undefined) {
        const v = String(body.faviconUrl ?? '').trim();
        data.faviconUrl = v ? v.slice(0, 2000) : null;
      }
      if (body.loginBackgroundUrl !== undefined) {
        const v = String(body.loginBackgroundUrl ?? '').trim();
        data.loginBackgroundUrl = v ? v.slice(0, 2000) : null;
      }
      if (body.primaryColor !== undefined) {
        const v = String(body.primaryColor ?? '').trim();
        if (!isLikelyColor(v)) return res.status(400).json({ error: 'Invalid primaryColor' });
        data.primaryColor = v || '#eb4d4b';
      }
      if (body.secondaryColor !== undefined) {
        const v = String(body.secondaryColor ?? '').trim();
        if (!isLikelyColor(v)) return res.status(400).json({ error: 'Invalid secondaryColor' });
        data.secondaryColor = v || '#f4f4f5';
      }
      if (body.sidebarBackgroundColor !== undefined) {
        const v = String(body.sidebarBackgroundColor ?? '').trim();
        if (v && !isLikelyColor(v)) return res.status(400).json({ error: 'Invalid sidebarBackgroundColor' });
        data.sidebarBackgroundColor = v || '#000000';
      }
      if (body.sidebarLogoUrl !== undefined) {
        const v = String(body.sidebarLogoUrl ?? '').trim();
        data.sidebarLogoUrl = v ? v.slice(0, 2000) : null;
      }
      if (body.menuBarColor !== undefined) {
        const v = String(body.menuBarColor ?? '').trim();
        if (v && !isLikelyColor(v)) return res.status(400).json({ error: 'Invalid menuBarColor' });
        data.menuBarColor = v;
      }
      assignStr('dateFormat', 80);
      assignStr('timeFormat', 80);
      assignStr('timezone', 120);
      assignStr('baseCurrency', 16);
      assignStr('moneyFormat', 80);
      assignStr('currencyPosition', 80);
      assignStr('defaultLanguage', 32);
      if (Object.keys(data).length === 0) return res.status(400).json({ error: 'No fields to update' });
      let row: Record<string, unknown> | undefined;
      if (prisma?.core?.update) {
        try {
          row = (await prisma.core.update({ where: { id: CORE_ID }, data })) as Record<string, unknown>;
        } catch (e: unknown) {
          console.warn('[admin/core] Prisma update failed, using SQL:', (e as Error)?.message || e);
        }
      }
      if (!row) {
        row = (await updateCoreRowWithPool(pool, data)) as Record<string, unknown>;
      }
      return res.json(row);
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to update core settings', details: error?.message || String(error) });
    }
  });

  router.post('/core/upload', uploadMemory.single('file'), async (req, res) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ error: 'No file uploaded' });
      const type = String(req.body?.type || '').trim().toLowerCase();
      if (type !== 'logo' && type !== 'favicon' && type !== 'sidebarlogo' && type !== 'loginbackground') {
        return res.status(400).json({ error: 'type must be logo, favicon, sidebarLogo, or loginBackground' });
      }
      const orgResult = await pool.query('SELECT "storageProvider" FROM "Organization" LIMIT 1');
      const provider = String(orgResult.rows[0]?.storageProvider || 'Local');
      if (provider !== 'Local') {
        return res.status(501).json({ error: `Storage provider ${provider} is not supported for platform uploads yet. Use Local storage.` });
      }
      const storagePath = STORAGE_ROOT;
      const dir = path.join(storagePath, 'platform');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const ext = path.extname(file.originalname) || (type === 'favicon' ? '.ico' : '.png');
      const filePrefix =
        type === 'sidebarlogo' ? 'sidebar_logo' : type === 'loginbackground' ? 'login_background' : type;
      const filename = `${filePrefix}_${Date.now()}${ext}`;
      const finalPath = path.join(dir, filename);
      fs.writeFileSync(finalPath, file.buffer);
      const url = `/storage/platform/${filename}`;
      await ensureCoreTableWithPool(pool);
      const update =
        type === 'logo'
          ? { logoUrl: url }
          : type === 'favicon'
            ? { faviconUrl: url }
            : type === 'loginbackground'
              ? { loginBackgroundUrl: url }
              : { sidebarLogoUrl: url };
      if (prisma?.core?.update) {
        try {
          await prisma.core.update({ where: { id: CORE_ID }, data: update });
        } catch (e: unknown) {
          console.warn('[admin/core] Prisma upload update failed, using SQL:', (e as Error)?.message || e);
          await updateCoreRowWithPool(pool, update);
        }
      } else {
        await updateCoreRowWithPool(pool, update);
      }
      return res.json({ success: true, url, type });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to upload file', details: error?.message || String(error) });
    }
  });

  router.get('/settings/:key', async (req, res) => {
    try {
      await ensureAdminTables(pool);
      const key = String(req.params.key || '').trim().toLowerCase();
      if (!PLATFORM_KEYS.has(key)) return res.status(400).json({ error: 'Invalid setting key' });
      const result = await pool.query('SELECT value FROM "PlatformSetting" WHERE "key" = $1 LIMIT 1', [key]);
      return res.json({ key, value: result.rows[0]?.value || {} });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to read platform setting', details: error?.message || String(error) });
    }
  });

  router.put('/settings/:key', async (req, res) => {
    try {
      await ensureAdminTables(pool);
      const key = String(req.params.key || '').trim().toLowerCase();
      if (!PLATFORM_KEYS.has(key)) return res.status(400).json({ error: 'Invalid setting key' });
      const value = req.body?.value ?? {};
      await pool.query(
        `INSERT INTO "PlatformSetting" ("key", value, "updatedAt")
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT ("key")
         DO UPDATE SET value = EXCLUDED.value, "updatedAt" = NOW()`,
        [key, JSON.stringify(value || {})]
      );

      return res.json({ key, value: value || {} });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to update platform setting', details: error?.message || String(error) });
    }
  });

  router.post('/settings/:key/test', async (req, res) => {
    try {
      const key = String(req.params.key || '').trim().toLowerCase();
      if (key !== 'smtp' || !PLATFORM_KEYS.has(key)) {
        return res.status(400).json({ error: 'Test is only available for the smtp platform setting.' });
      }
      await ensureAdminTables(pool);

      let body: Record<string, unknown> = isPlainObject(req.body) ? (req.body as Record<string, unknown>) : {};
      if (typeof req.body === 'string') {
        try {
          const parsed: unknown = JSON.parse(req.body);
          if (isPlainObject(parsed)) body = parsed;
        } catch {
          body = {};
        }
      }

      const toEmail = String(body.toEmail || '').trim();
      if (!toEmail || !isValidEmail(toEmail)) {
        return res.status(400).json({ error: 'Valid toEmail is required.' });
      }

      const storedResult = await pool.query('SELECT value FROM "PlatformSetting" WHERE "key" = $1 LIMIT 1', [key]);
      const storedValue = (storedResult.rows[0]?.value as Record<string, unknown>) || {};
      const storedProvider = storedValue?.provider === 'SES' ? 'SES' : 'SMTP';
      const baseStored: Record<string, unknown> = isPlainObject(storedValue.config)
        ? (storedValue.config as Record<string, unknown>)
        : {};

      const draft = isPlainObject(body.value) ? (body.value as Record<string, unknown>) : undefined;
      const baseProvider =
        draft?.provider === 'SES' ? 'SES' : draft?.provider === 'SMTP' ? 'SMTP' : storedProvider;

      const draftConfig = isPlainObject(draft?.config) ? (draft!.config as Record<string, unknown>) : undefined;
      const hasDraftConfig = Boolean(draft && Object.prototype.hasOwnProperty.call(draft, 'config'));
      const incomingConfig =
        hasDraftConfig && draftConfig ? mergeSmtpDraftOntoStored(baseStored, draftConfig) : baseStored;

      const normalized = normalizeSmtpConfig(baseProvider, incomingConfig, baseStored);

      const smtpHost = String(normalized.host || '').trim();
      const smtpUser = String(normalized.user || '').trim();
      const smtpFrom = String(normalized.fromEmail || '').trim();
      if (baseProvider === 'SMTP' && !smtpHost) {
        return res.status(400).json({
          error: 'SMTP configuration is incomplete.',
          details:
            'Missing host (and no usable saved settings). Fill Host / Port in the form, or save SMTP settings first. If the request body did not include the form data, try saving and testing again.'
        });
      }
      if (baseProvider === 'SMTP' && !smtpFrom && !smtpUser) {
        return res.status(400).json({
          error: 'SMTP configuration is incomplete.',
          details: 'Set "From email" or a SMTP user that is a valid email address.'
        });
      }

      if (baseProvider === 'SES' && !isValidEmail(String(normalized.fromEmail || ''))) {
        return res.status(400).json({ error: 'SES fromEmail must be a valid email.' });
      }
      if (baseProvider === 'SMTP' && normalized.fromEmail && !isValidEmail(String(normalized.fromEmail))) {
        return res.status(400).json({ error: 'SMTP fromEmail must be a valid email.' });
      }

      await sendTestEmailWithConfig(baseProvider, normalized, toEmail);
      return res.json({
        success: true,
        message: `Test email sent to ${toEmail} using ${baseProvider}.`
      });
    } catch (error: unknown) {
      console.error('[admin] SMTP test failed:', error);
      const details = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ error: 'Failed to send test email', details });
    }
  });

  router.get('/translations', async (req, res) => {
    try {
      await ensureAdminTables(pool);
      const locale = String(req.query.locale || '').trim().toLowerCase();
      const rowsResult = locale
        ? await pool.query(
            `SELECT id, locale, namespace, key, value, "updatedAt"
             FROM "TranslationOverride"
             WHERE locale = $1
             ORDER BY locale ASC, namespace ASC NULLS FIRST, key ASC`,
            [locale]
          )
        : await pool.query(
            `SELECT id, locale, namespace, key, value, "updatedAt"
             FROM "TranslationOverride"
             ORDER BY locale ASC, namespace ASC NULLS FIRST, key ASC`
          );
      const rows = rowsResult.rows;
      return res.json(rows);
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to fetch translation overrides', details: error?.message || String(error) });
    }
  });

  router.put('/translations', async (req, res) => {
    try {
      await ensureAdminTables(pool);
      const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];
      if (!entries.length) return res.json({ success: true, saved: 0 });

      let saved = 0;
      for (const entry of entries) {
        const locale = String(entry?.locale || '').trim().toLowerCase();
        const namespaceRaw = entry?.namespace;
        const namespace = namespaceRaw === null || namespaceRaw === undefined || String(namespaceRaw).trim() === '' ? null : String(namespaceRaw).trim();
        const key = String(entry?.key || '').trim();
        const value = String(entry?.value ?? '');
        if (!locale || !key) continue;

        await pool.query(
          `INSERT INTO "TranslationOverride" (id, locale, namespace, key, value, "updatedAt")
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (locale, namespace, key)
           DO UPDATE SET value = EXCLUDED.value, "updatedAt" = NOW()`,
          [crypto.randomUUID(), locale, namespace, key, value]
        );
        saved += 1;
      }
      return res.json({ success: true, saved });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to save translation overrides', details: error?.message || String(error) });
    }
  });

  router.delete('/translations/:id', async (req, res) => {
    try {
      await ensureAdminTables(pool);
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id is required' });
      await pool.query('DELETE FROM "TranslationOverride" WHERE id = $1', [id]);
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to delete translation override', details: error?.message || String(error) });
    }
  });

  const isSystemCategoryItemRow = (row: { organizationId?: string | null; companyId?: string | null }) =>
    row.organizationId == null && row.companyId == null;

  router.get('/categories', async (_req, res) => {
    try {
      const categories = await prisma.category.findMany({ orderBy: { name: 'asc' } });
      const ids = categories.map((c: { id: string }) => c.id);
      const counts =
        ids.length === 0
          ? []
          : await Promise.all(
              ids.map((categoryId: string) =>
                prisma.categoryItem.count({
                  where: { categoryId, organizationId: null, companyId: null }
                })
              )
            );
      const countMap = new Map<string, number>(ids.map((id: string, i: number) => [id, counts[i] ?? 0]));
      return res.json(
        categories.map((c: { id: string }) => ({
          ...c,
          _count: { items: countMap.get(c.id) || 0 }
        }))
      );
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to fetch categories', details: error?.message || String(error) });
    }
  });

  router.get('/categories/:id', async (req, res) => {
    try {
      const id = String(req.params.id || '').trim();
      const category = await prisma.category.findUnique({
        where: { id },
        include: {
          items: { where: { organizationId: null, companyId: null }, orderBy: { sortOrder: 'asc' } }
        }
      });
      if (!category) return res.status(404).json({ error: 'Category not found' });
      const { items: rawItems, ...rest } = category as { items: any[] } & Record<string, unknown>;
      const items = (rawItems || []).map((row: any) => ({
        ...row,
        isSystem: isSystemCategoryItemRow(row)
      }));
      return res.json({ ...rest, items });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to fetch category', details: error?.message || String(error) });
    }
  });

  router.post('/categories', async (req, res) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const category = await prisma.category.create({
        data: {
          code: body.code != null ? String(body.code).trim() || null : null,
          name: String(body.name || '').trim() || 'Unnamed',
          description: body.description != null ? String(body.description) : null,
          module: String(body.module || '').trim() || 'General',
          status: String(body.status || 'Active'),
          sortingRule: String(body.sortingRule || 'Manual')
        }
      });
      return res.json(category);
    } catch (error: any) {
      if (error?.code === 'P2002') return res.status(400).json({ error: 'Category code must be unique.' });
      return res.status(500).json({ error: 'Failed to create category', details: error?.message || String(error) });
    }
  });

  router.put('/categories/:id', async (req, res) => {
    try {
      const id = String(req.params.id || '').trim();
      const body = (req.body || {}) as Record<string, unknown>;
      const category = await prisma.category.update({
        where: { id },
        data: {
          code: body.code !== undefined ? (body.code != null ? String(body.code).trim() || null : null) : undefined,
          name: body.name !== undefined ? String(body.name || '').trim() || 'Unnamed' : undefined,
          description: body.description !== undefined ? (body.description != null ? String(body.description) : null) : undefined,
          module: body.module !== undefined ? String(body.module || '').trim() || 'General' : undefined,
          status: body.status !== undefined ? String(body.status || 'Active') : undefined,
          sortingRule: body.sortingRule !== undefined ? String(body.sortingRule || 'Manual') : undefined
        }
      });
      return res.json(category);
    } catch (error: any) {
      if (error?.code === 'P2025') return res.status(404).json({ error: 'Category not found' });
      if (error?.code === 'P2002') return res.status(400).json({ error: 'Category code must be unique.' });
      return res.status(500).json({ error: 'Failed to update category', details: error?.message || String(error) });
    }
  });

  router.delete('/categories/:id', async (req, res) => {
    try {
      const id = String(req.params.id || '').trim();
      await prisma.category.delete({ where: { id } });
      return res.json({ success: true });
    } catch (error: any) {
      if (error?.code === 'P2025') return res.status(404).json({ error: 'Category not found' });
      return res.status(500).json({ error: 'Failed to delete category', details: error?.message || String(error) });
    }
  });

  router.post('/category-items', async (req, res) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const categoryId = String(body.categoryId || '').trim();
      if (!categoryId) return res.status(400).json({ error: 'categoryId is required' });
      const codeRaw = body.code != null ? String(body.code).trim() : '';
      if (!codeRaw) return res.status(400).json({ error: 'Item code is required.' });
      const item = await prisma.categoryItem.create({
        data: {
          categoryId,
          code: codeRaw,
          name: String(body.name || '').trim() || 'Unnamed',
          description: body.description != null ? String(body.description) : null,
          status: String(body.status || 'Active'),
          sortOrder: body.sortOrder != null ? Number(body.sortOrder) || 0 : 0,
          organizationId: null,
          companyId: null
        }
      });
      return res.json({ ...item, isSystem: true });
    } catch (error: any) {
      if (error?.code === 'P2002') return res.status(400).json({ error: 'Item code must be globally unique.' });
      return res.status(500).json({ error: 'Failed to create item', details: error?.message || String(error) });
    }
  });

  router.put('/category-items/:id', async (req, res) => {
    try {
      const id = String(req.params.id || '').trim();
      const existing = await prisma.categoryItem.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: 'Not found' });
      if (!isSystemCategoryItemRow(existing)) {
        return res.status(403).json({ error: 'Only system catalog items can be edited here.' });
      }
      const body = (req.body || {}) as Record<string, unknown>;
      const codeRaw = body.code !== undefined ? String(body.code || '').trim() : String(existing.code || '').trim();
      if (!codeRaw) return res.status(400).json({ error: 'Item code is required.' });
      const item = await prisma.categoryItem.update({
        where: { id },
        data: {
          code: codeRaw,
          name: body.name !== undefined ? String(body.name || '').trim() || 'Unnamed' : existing.name,
          description: body.description !== undefined ? (body.description != null ? String(body.description) : null) : existing.description,
          status: body.status !== undefined ? String(body.status || 'Active') : existing.status,
          sortOrder: body.sortOrder !== undefined ? Number(body.sortOrder) || 0 : existing.sortOrder
        }
      });
      return res.json({ ...item, isSystem: true });
    } catch (error: any) {
      if (error?.code === 'P2002') return res.status(400).json({ error: 'Item code must be globally unique.' });
      return res.status(500).json({ error: 'Failed to update item', details: error?.message || String(error) });
    }
  });

  router.delete('/category-items/:id', async (req, res) => {
    try {
      const id = String(req.params.id || '').trim();
      const existing = await prisma.categoryItem.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: 'Not found' });
      if (!isSystemCategoryItemRow(existing)) {
        return res.status(403).json({ error: 'Only system catalog items can be deleted here.' });
      }
      await prisma.categoryItem.delete({ where: { id } });
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to delete item', details: error?.message || String(error) });
    }
  });

  router.put('/category-items/reorder', async (req, res) => {
    try {
      const { items } = req.body || {};
      if (!Array.isArray(items)) return res.status(400).json({ error: 'items array required' });
      for (const row of items) {
        const id = String(row?.id || '').trim();
        if (!id) continue;
        const existing = await prisma.categoryItem.findUnique({ where: { id } });
        if (!existing || !isSystemCategoryItemRow(existing)) continue;
        await prisma.categoryItem.update({
          where: { id },
          data: { sortOrder: Number(row.sortOrder) || 0 }
        });
      }
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to reorder', details: error?.message || String(error) });
    }
  });

  router.get('/references', async (_req, res) => {
    try {
      const references = await prisma.reference.findMany({
        where: { companyId: null },
        orderBy: { module: 'asc' }
      });
      return res.json(references);
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to fetch references', details: error?.message || String(error) });
    }
  });

  router.post('/references', async (req, res) => {
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const module = String(body.module || '').trim();
      const code = String(body.code || '').trim();
      if (!module || !code) return res.status(400).json({ error: 'module and code are required for core templates.' });

      const reference = await prisma.reference.create({
        data: {
          companyId: null,
          module,
          code,
          reference: body.reference != null ? Number(body.reference) || 0 : 0,
          prefix: body.prefix != null ? String(body.prefix) : null,
          sufix: body.sufix != null ? String(body.sufix) : null,
          digits: body.digits != null ? Number(body.digits) || 4 : 4,
          clone: body.clone != null ? Number(body.clone) || 0 : 0
        }
      });
      await propagateReferenceTemplateToAllCompanies(pool, module, code);
      return res.json(reference);
    } catch (error: any) {
      if (error?.code === 'P2002') {
        return res.status(400).json({ error: 'A core template with this module/code already exists.' });
      }
      return res.status(500).json({ error: 'Failed to create reference', details: error?.message || String(error) });
    }
  });

  router.put('/references/:id', async (req, res) => {
    try {
      const id = String(req.params.id || '').trim();
      const existing = await prisma.reference.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: 'Not found' });
      if (existing.companyId != null) {
        return res.status(403).json({ error: 'Only core templates can be updated here.' });
      }
      const body = (req.body || {}) as Record<string, unknown>;
      const reference = await prisma.reference.update({
        where: { id },
        data: {
          module: body.module !== undefined ? String(body.module || '').trim() : undefined,
          code: body.code !== undefined ? String(body.code || '').trim() || null : undefined,
          reference: body.reference !== undefined ? Number(body.reference) || 0 : undefined,
          prefix: body.prefix !== undefined ? (body.prefix != null ? String(body.prefix) : null) : undefined,
          sufix: body.sufix !== undefined ? (body.sufix != null ? String(body.sufix) : null) : undefined,
          digits: body.digits !== undefined ? Number(body.digits) || 4 : undefined,
          clone: body.clone !== undefined ? Number(body.clone) || 0 : undefined
        }
      });
      return res.json(reference);
    } catch (error: any) {
      if (error?.code === 'P2025') return res.status(404).json({ error: 'Not found' });
      return res.status(500).json({ error: 'Failed to update reference', details: error?.message || String(error) });
    }
  });

  router.delete('/references/:id', async (req, res) => {
    try {
      const id = String(req.params.id || '').trim();
      const existing = await prisma.reference.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: 'Not found' });
      if (existing.companyId != null) {
        return res.status(403).json({ error: 'Only core templates can be deleted here.' });
      }
      const module = String(existing.module || '').trim();
      const code = String(existing.code || '').trim();
      await pool.query(
        `DELETE FROM "Reference" WHERE module = $1 AND COALESCE(code, '') = COALESCE($2::text, '')`,
        [module, code]
      );
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ error: 'Failed to delete reference', details: error?.message || String(error) });
    }
  });

  await loadModuleAdminRoutes(router, prisma, pool, uploadMemory);

  router.use('/modules', proxyToLegacyPath('/api/modules'));
  router.use('/menu-config', proxyToLegacyPath('/api/menu-config'));

  return router;
};

export const ensureAdminSupportTables = ensureAdminTables;
