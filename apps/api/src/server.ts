// Production-ready server with SystemModule support
// NOTE: env loading is performed by main.ts before importing this module.
import express from 'express';
import cors from 'cors';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'url';
import crypto from 'crypto';
import multer from 'multer';
import { jsPDF } from 'jspdf';
import { hashPassword, verifyPassword, isHashed } from './password';

// Prisma 7 ships `@prisma/client` as CJS. Static ESM `import { PrismaClient } from '@prisma/client'`
// works on Node 24 but throws on Node 20 ("does not provide an export named 'PrismaClient'").
// Loading via createRequire sidesteps the ESM analysis and works on every Node version.
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
import {
  createAdminRouter,
  buildTranslationOverridesObject,
  ensureAdminSupportTables,
  loadPublicCorePayload
} from './admin/router';
import {
  resolveUserIdFromSessionToken,
  resolveTenantAuthContext,
  resolveCompanyContextForRequest,
  assertCompanyBelongsToOrg,
  fetchMergedCategoryItems,
  countMergedCategoryItems,
  isSystemCategoryItem,
  userCanAccessCompany,
  cloneAllCoreReferencesToCompany,
  reserveNextReference,
  type TenantAuthContext
} from '@sinapsis/module-sdk-server';
import {
  isPlainObject,
  isValidEmail,
  normalizeSmtpConfig,
  parseReadyPlatformSmtp,
  platformSmtpPayloadReady,
  sanitizeSmtpConfigForResponse,
  sendEmailWithConfig,
  sendTestEmailWithConfig
} from './smtpMail';
import { getDiskModules, findDiskModule, buildModuleRouteCodeMap, type ModuleManifest } from './diskModules';
import { API_ROOT, MODULES_ROOT, STORAGE_ROOT, resolveManifestPath } from './paths';

const logFile = path.resolve(API_ROOT, 'server-errors.txt');

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const app = express();
app.use(express.json());
app.use(cors());
app.use('/storage', express.static(STORAGE_ROOT));

app.get('/api/public/core', async (_req, res) => {
  try {
    const payload = await loadPublicCorePayload(prisma, pool);
    res.json(payload);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to read public core settings', details: error?.message || String(error) });
  }
});

app.use('/api/admin', await createAdminRouter({ prisma, pool }));

interface ModuleApiRegistration {
    basePath?: string;
    openapiPath?: string;
    docsPath?: string;
}

interface LoadedModuleApiInfo {
    code: string;
    name: string;
    folder: string;
    version?: string;
    description?: string;
    basePath: string;
    openapiPath?: string;
    docsPath?: string;
    status: 'loaded' | 'error';
    error?: string;
}

type MenuTargetType = 'STATIC_VIEW' | 'MODULE_VIEW' | 'EXTERNAL_URL';
type MenuStatus = 'Active' | 'Inactive';

type MenuPlacement = 'sidebar' | 'header' | 'footer';

type MenuDisplayMode = 'icon_only' | 'text_only' | 'icon_and_text';

interface MenuGroupRow {
    id: string;
    key: string;
    label: string;
    icon: string;
    status: MenuStatus;
    sortOrder: number;
    placement: MenuPlacement;
    displayMode: MenuDisplayMode;
}

interface MenuItemRow {
    id: string;
    groupId: string;
    label: string;
    icon: string;
    targetType: MenuTargetType;
    viewKey: string;
    moduleCode: string | null;
    linkUrl: string | null;
    openInNewTab: boolean;
    status: MenuStatus;
    sortOrder: number;
    displayMode: MenuDisplayMode;
}

const normalizeMenuItemTargetType = (value: unknown): MenuTargetType => {
    const s = String(value || '').toUpperCase().replace(/-/g, '_');
    if (s === 'MODULE_VIEW') return 'MODULE_VIEW';
    if (s === 'EXTERNAL_URL' || s === 'EXTERNAL') return 'EXTERNAL_URL';
    return 'STATIC_VIEW';
};

const assertSafeMenuLinkUrl = (raw: unknown): string | null => {
    const t = String(raw ?? '').trim();
    if (!t) return null;
    if (t.startsWith('/')) {
        if (t.startsWith('//')) return null;
        return t;
    }
    try {
        const u = new URL(t);
        if (['http:', 'https:', 'mailto:', 'tel:'].includes(u.protocol)) {
            return u.toString();
        }
    } catch {
        /* ignore */
    }
    return null;
};

const normalizeDisplayMode = (value: unknown): MenuDisplayMode => {
    const v = String(value || '')
        .toLowerCase()
        .trim()
        .replace(/-/g, '_');
    if (v === 'icon_only' || v === 'icononly') return 'icon_only';
    if (v === 'text_only' || v === 'textonly') return 'text_only';
    if (
        v === 'icon_and_text' ||
        v === 'iconandtext' ||
        v === 'both' ||
        v === 'text_and_icon'
    ) {
        return 'icon_and_text';
    }
    return 'icon_and_text';
};

const DEFAULT_MENU_GROUPS: Array<Pick<MenuGroupRow, 'key' | 'label' | 'icon' | 'sortOrder'>> = [
    { key: 'dashboard', label: 'Dashboard', icon: 'fa-chart-line', sortOrder: 10 },
    { key: 'settings', label: 'Settings', icon: 'fa-gear', sortOrder: 90 }
];

const DEFAULT_MENU_ITEMS: Array<{
    groupKey: string;
    label: string;
    icon: string;
    targetType: MenuTargetType;
    viewKey: string;
    moduleCode?: string | null;
    sortOrder: number;
}> = [
        { groupKey: 'dashboard', label: 'Dashboard', icon: 'fa-chart-pie', targetType: 'STATIC_VIEW', viewKey: 'Dashboard', sortOrder: 10 },
        { groupKey: 'settings', label: 'Organization', icon: 'fa-sitemap', targetType: 'STATIC_VIEW', viewKey: 'OrganizationSettings', sortOrder: 10 },
        { groupKey: 'settings', label: 'Mi plan', icon: 'fa-rectangle-list', targetType: 'STATIC_VIEW', viewKey: 'MyPlanSettings', sortOrder: 15 },
        { groupKey: 'settings', label: 'Companies', icon: 'fa-building-shield', targetType: 'STATIC_VIEW', viewKey: 'CompanySettings', sortOrder: 20 },
        { groupKey: 'settings', label: 'Users', icon: 'fa-user-gear', targetType: 'STATIC_VIEW', viewKey: 'UserSettings', sortOrder: 30 },
        { groupKey: 'settings', label: 'Roles', icon: 'fa-user-shield', targetType: 'STATIC_VIEW', viewKey: 'RoleSettings', sortOrder: 40 },
        { groupKey: 'settings', label: 'Modules', icon: 'fa-cubes', targetType: 'STATIC_VIEW', viewKey: 'ModuleSettings', sortOrder: 50 },
        { groupKey: 'settings', label: 'SMTP', icon: 'fa-at', targetType: 'STATIC_VIEW', viewKey: 'SMTPSettings', sortOrder: 60 },
        { groupKey: 'settings', label: 'Translations', icon: 'fa-language', targetType: 'STATIC_VIEW', viewKey: 'LanguageSettings', sortOrder: 70 },
        { groupKey: 'settings', label: 'Storage', icon: 'fa-database', targetType: 'STATIC_VIEW', viewKey: 'StorageSettings', sortOrder: 80 },
        { groupKey: 'settings', label: 'Categories', icon: 'fa-tags', targetType: 'STATIC_VIEW', viewKey: 'CategorySettings', sortOrder: 90 },
        { groupKey: 'settings', label: 'References', icon: 'fa-hashtag', targetType: 'STATIC_VIEW', viewKey: 'ReferenceSettings', sortOrder: 100 },
        { groupKey: 'settings', label: 'Menus', icon: 'fa-bars-staggered', targetType: 'STATIC_VIEW', viewKey: 'MenuSettings', sortOrder: 110 }
    ];

const normalizeMenuPlacement = (value: unknown): MenuPlacement => {
    const raw = String(value || '').toLowerCase();
    if (raw === 'header' || raw === 'footer') return raw;
    return 'sidebar';
};

const ensureMenuConfigTables = async () => {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS "MenuGroup" (
            id TEXT PRIMARY KEY,
            key TEXT NOT NULL,
            label TEXT NOT NULL,
            icon TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'Active',
            "sortOrder" INTEGER NOT NULL DEFAULT 0,
            placement TEXT NOT NULL DEFAULT 'sidebar',
            "displayMode" TEXT NOT NULL DEFAULT 'icon_and_text',
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS "MenuItem" (
            id TEXT PRIMARY KEY,
            "groupId" TEXT NOT NULL REFERENCES "MenuGroup"(id) ON DELETE CASCADE,
            label TEXT NOT NULL,
            icon TEXT NOT NULL,
            "targetType" TEXT NOT NULL,
            "viewKey" TEXT NOT NULL,
            "moduleCode" TEXT,
            status TEXT NOT NULL DEFAULT 'Active',
            "sortOrder" INTEGER NOT NULL DEFAULT 0,
            "displayMode" TEXT NOT NULL DEFAULT 'icon_and_text',
            "linkUrl" TEXT,
            "openInNewTab" BOOLEAN NOT NULL DEFAULT false,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS "MenuItem_group_idx" ON "MenuItem"("groupId", "sortOrder")');
    await pool.query('CREATE INDEX IF NOT EXISTS "MenuItem_view_idx" ON "MenuItem"("viewKey")');
    await pool.query('ALTER TABLE "MenuGroup" ADD COLUMN IF NOT EXISTS placement TEXT NOT NULL DEFAULT \'sidebar\'');
    await pool.query('ALTER TABLE "MenuGroup" DROP CONSTRAINT IF EXISTS "MenuGroup_key_key"');
    await pool.query(
        'CREATE UNIQUE INDEX IF NOT EXISTS "MenuGroup_key_placement_key" ON "MenuGroup"(key, placement)'
    );
    await pool.query(
        'ALTER TABLE "MenuGroup" ADD COLUMN IF NOT EXISTS "displayMode" TEXT NOT NULL DEFAULT \'icon_and_text\''
    );
    await pool.query(
        'ALTER TABLE "MenuItem" ADD COLUMN IF NOT EXISTS "displayMode" TEXT NOT NULL DEFAULT \'icon_and_text\''
    );
    await pool.query('ALTER TABLE "MenuItem" ADD COLUMN IF NOT EXISTS "linkUrl" TEXT');
    await pool.query(
        'ALTER TABLE "MenuItem" ADD COLUMN IF NOT EXISTS "openInNewTab" BOOLEAN NOT NULL DEFAULT false'
    );
    await pool.query(`
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'MenuGroup' AND column_name = 'showLabel'
            ) THEN
                UPDATE "MenuGroup" SET "displayMode" = 'icon_only' WHERE "showLabel" = false;
                UPDATE "MenuItem" SET "displayMode" = 'icon_only' WHERE "showLabel" = false;
                ALTER TABLE "MenuGroup" DROP COLUMN "showLabel";
                ALTER TABLE "MenuItem" DROP COLUMN "showLabel";
            END IF;
        END $$;
    `);
};

const ensureDefaultMenuConfig = async () => {
    await ensureMenuConfigTables();
    const existing = await pool.query('SELECT id FROM "MenuGroup" LIMIT 1');
    if (existing.rows[0]) return;

    const keyToId = new Map<string, string>();
    for (const group of DEFAULT_MENU_GROUPS) {
        const id = crypto.randomUUID();
        keyToId.set(group.key, id);
        await pool.query(
            `INSERT INTO "MenuGroup" (id, key, label, icon, status, "sortOrder", placement, "displayMode", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, 'Active', $5, 'sidebar', 'icon_and_text', NOW(), NOW())`,
            [id, group.key, group.label, group.icon, group.sortOrder]
        );
    }

    for (const item of DEFAULT_MENU_ITEMS) {
        const groupId = keyToId.get(item.groupKey);
        if (!groupId) continue;
        await pool.query(
            `INSERT INTO "MenuItem" (id, "groupId", label, icon, "targetType", "viewKey", "moduleCode", "linkUrl", "openInNewTab", status, "sortOrder", "displayMode", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, false, 'Active', $8, 'icon_and_text', NOW(), NOW())`,
            [crypto.randomUUID(), groupId, item.label, item.icon, item.targetType, item.viewKey, item.moduleCode || null, item.sortOrder]
        );
    }
};

const ensureMyPlanMenuItem = async () => {
    await ensureMenuConfigTables();
    const g = await pool.query(
        `SELECT id FROM "MenuGroup" WHERE key = 'settings' AND placement = 'sidebar' ORDER BY "sortOrder" ASC, "createdAt" ASC LIMIT 1`
    );
    const gid = g.rows[0]?.id as string | undefined;
    if (!gid) return;

    const dup = await pool.query(
        `SELECT 1 FROM "MenuItem" mi JOIN "MenuGroup" mg ON mg.id = mi."groupId" WHERE mi."viewKey" = 'MyPlanSettings' AND mg.placement = 'sidebar' LIMIT 1`
    );
    if (dup.rows[0]) return;

    await pool.query(
        `INSERT INTO "MenuItem" (id, "groupId", label, icon, "targetType", "viewKey", "moduleCode", "linkUrl", "openInNewTab", status, "sortOrder", "displayMode", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, 'STATIC_VIEW', 'MyPlanSettings', NULL, NULL, false, 'Active', 15, 'icon_and_text', NOW(), NOW())`,
        [crypto.randomUUID(), gid, 'Mi plan', 'fa-rectangle-list']
    );
};

const ensureModuleMigrationsTable = async () => {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS "_module_migrations" (
            id TEXT NOT NULL,
            module_code TEXT NOT NULL,
            migration_file TEXT NOT NULL,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT "_module_migrations_pkey" PRIMARY KEY (id),
            CONSTRAINT "_module_migrations_module_file_key" UNIQUE (module_code, migration_file)
        )
    `);
};

const executeModuleMigrations = async (moduleDir: string, manifest: ModuleManifest) => {
    const migrations = manifest.migrations || [];
    for (const relPath of migrations) {
        const migrationFile = path.join(moduleDir, relPath);
        if (!fs.existsSync(migrationFile)) {
            throw new Error(`Migration file not found: ${migrationFile}`);
        }

        const alreadyApplied = await pool.query(
            'SELECT 1 FROM "_module_migrations" WHERE module_code = $1 AND migration_file = $2 LIMIT 1',
            [manifest.code, relPath]
        );
        if (alreadyApplied.rows[0]) continue;

        const sql = fs.readFileSync(migrationFile, 'utf-8');
        await pool.query('BEGIN');
        try {
            await pool.query(sql);
            await pool.query(
                'INSERT INTO "_module_migrations" (id, module_code, migration_file, applied_at) VALUES ($1, $2, $3, NOW())',
                [crypto.randomUUID(), manifest.code, relPath]
            );
            await pool.query('COMMIT');
        } catch (error) {
            await pool.query('ROLLBACK');
            throw error;
        }
    }
};

const maybeRunModuleHook = async (moduleDir: string, hook: 'install' | 'uninstall', payload: Record<string, unknown>) => {
    const file = path.join(moduleDir, `${hook}.ts`);
    if (!fs.existsSync(file)) return;

    const imported = await import(pathToFileURL(file).href);
    const fn = imported?.default;
    if (typeof fn !== 'function') {
        throw new Error(`${hook}.ts must export default function`);
    }
    await fn(payload);
};
const loadedModuleApis: LoadedModuleApiInfo[] = [];

const normalizePath = (value?: string) => {
    const pathValue = String(value || '').trim();
    if (!pathValue) return '';
    return pathValue.startsWith('/') ? pathValue : `/${pathValue}`;
};

const loadServerModules = async () => {
    const diskModules = getDiskModules();
    for (const { dir: moduleDir, folder, manifest } of diskModules) {
        const fallbackBasePath = `/api/${folder}`;
        try {
            const defaultEntry = path.join(moduleDir, 'server', 'index.ts');
            const configuredEntry = manifest?.entry?.api ? resolveManifestPath(String(manifest.entry.api)) : defaultEntry;
            const serverEntry = fs.existsSync(configuredEntry) ? configuredEntry : defaultEntry;
            if (!fs.existsSync(serverEntry)) continue;

            const imported = await import(pathToFileURL(serverEntry).href);
            const register = imported?.default;
            if (typeof register !== 'function') continue;

            const registration = (await register({ app, pool, prisma }) || {}) as ModuleApiRegistration;

            const basePath = normalizePath(registration?.basePath) || normalizePath(manifest?.api?.basePath) || fallbackBasePath;
            const openapiPath = normalizePath(registration?.openapiPath) || normalizePath(manifest?.api?.openapiPath);
            const docsPath = normalizePath(registration?.docsPath) || normalizePath(manifest?.api?.docsPath);

            loadedModuleApis.push({
                code: manifest.code,
                name: manifest.name,
                folder,
                version: manifest.version,
                description: manifest.description,
                basePath,
                openapiPath: openapiPath || undefined,
                docsPath: docsPath || undefined,
                status: 'loaded'
            });

            console.log(`[MODULE] Loaded server module: ${path.basename(moduleDir)} (${manifest.code})`);
        } catch (error: any) {
            loadedModuleApis.push({
                code: manifest.code,
                name: manifest.name,
                folder,
                version: manifest.version,
                description: manifest.description,
                basePath: normalizePath(manifest?.api?.basePath) || fallbackBasePath,
                openapiPath: normalizePath(manifest?.api?.openapiPath) || undefined,
                docsPath: normalizePath(manifest?.api?.docsPath) || undefined,
                status: 'error',
                error: error?.message || String(error)
            });
            console.error(`[MODULE] Failed loading module ${path.basename(moduleDir)}:`, error);
        }
    }
};

app.get('/api/system/module-apis', (req, res) => {
    res.json(loadedModuleApis);
});

app.get('/api/system/module-apis/openapi-index', (req, res) => {
    const serverUrl = `${req.protocol}://${req.get('host')}`;
    const docs = loadedModuleApis
        .filter((m) => m.status === 'loaded' && (m.openapiPath || m.docsPath))
        .map((m) => ({
            code: m.code,
            name: m.name,
            openapiPath: m.openapiPath || null,
            docsPath: m.docsPath || null,
            openapiUrl: m.openapiPath ? `${serverUrl}${m.openapiPath}` : null,
            docsUrl: m.docsPath ? `${serverUrl}${m.docsPath}` : null
        }));
    res.json(docs);
});
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const ensureCompanyZipcodeColumn = async () => {
    await pool.query('ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "zipcode" TEXT');
    await pool.query('ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "dateFormat" TEXT');
    await pool.query('ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "timeFormat" TEXT');
    await pool.query('ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "timezone" TEXT');
    await pool.query('ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "baseCurrency" TEXT');
    await pool.query('ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "moneyFormat" TEXT');
    await pool.query('ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "currencyPosition" TEXT');
    await pool.query('ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "defaultLanguage" TEXT');
};

const stripOrganizationSmtpFields = (body: unknown): Record<string, unknown> => {
    const data = isPlainObject(body) ? { ...body } : {};
    delete data.smtpProvider;
    delete data.smtpSettings;
    delete data.subscriptionPlanId;
    return data;
};

const ensureOrganizationColumns = async () => {
    await pool.query('ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "addressAdditional" TEXT');
    await pool.query('ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "zipcode" TEXT');
    await pool.query('ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "city" TEXT');
    await pool.query('ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "state" TEXT');
    await pool.query('ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "country" TEXT');
    await pool.query('ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "baseCurrency" TEXT');

    try {
        await ensureAdminSupportTables(pool);
        const colCheck = await pool.query(
            `SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'Organization' AND column_name = 'smtpSettings'
             LIMIT 1`
        );
        if (colCheck.rows.length > 0) {
            const platResult = await pool.query('SELECT value FROM "PlatformSetting" WHERE "key" = $1 LIMIT 1', ['smtp']);
            const platVal = platResult.rows[0]?.value;
            if (!platformSmtpPayloadReady(platVal)) {
                const orgResult = await pool.query(
                    'SELECT "smtpProvider", "smtpSettings" FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1'
                );
                const org = orgResult.rows[0];
                if (isPlainObject(org?.smtpSettings)) {
                    const op = org?.smtpProvider === 'SES' ? 'SES' : 'SMTP';
                    const os = org.smtpSettings as Record<string, unknown>;
                    const normalizedOrg = normalizeSmtpConfig(op, os, os);
                    const legacyReady =
                        op === 'SES'
                            ? Boolean(
                                  normalizedOrg.region &&
                                      normalizedOrg.accessKeyId &&
                                      normalizedOrg.secretAccessKey &&
                                      normalizedOrg.fromEmail
                              )
                            : Boolean(normalizedOrg.host && (normalizedOrg.fromEmail || normalizedOrg.user));
                    if (legacyReady) {
                        await pool.query(
                            `INSERT INTO "PlatformSetting" ("key", value, "updatedAt")
                             VALUES ($1, $2::jsonb, NOW())
                             ON CONFLICT ("key") DO UPDATE SET value = EXCLUDED.value, "updatedAt" = NOW()`,
                            ['smtp', JSON.stringify({ provider: op, config: normalizedOrg })]
                        );
                    }
                }
            }
            await pool.query('ALTER TABLE "Organization" DROP COLUMN IF EXISTS "smtpProvider"');
            await pool.query('ALTER TABLE "Organization" DROP COLUMN IF EXISTS "smtpSettings"');
        }
    } catch (e: unknown) {
        console.warn('[Organization] Legacy SMTP migration/drop:', (e as Error)?.message || e);
    }
};

/** Outbound mail: only PlatformSetting key `smtp` (admin). Organization no longer stores SMTP. */
const loadCanonicalOutboundMailConfig = async (): Promise<{ provider: string; config: Record<string, unknown> }> => {
    await ensureAdminSupportTables(pool);
    const r = await pool.query('SELECT value FROM "PlatformSetting" WHERE "key" = $1 LIMIT 1', ['smtp']);
    const row = parseReadyPlatformSmtp(r.rows[0]?.value);
    if (!row) {
        throw new Error(
            'Mail is not configured. Save SMTP in Admin → Settings → SMTP. On first boot after upgrade, Organization SMTP (if any) is copied to platform settings and removed from Organization.'
        );
    }
    return {
        provider: row.provider,
        config: normalizeSmtpConfig(row.provider, row.config, row.config)
    };
};

const ensureUserColumns = async () => {
    await pool.query('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "language" TEXT');
    await pool.query('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "accessCompanyIds" TEXT');
    await pool.query('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sessionToken" TEXT');
    await pool.query('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sessionTokenExpiresAt" TIMESTAMPTZ');
    await pool.query('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordResetToken" TEXT');
    await pool.query('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordResetExpiresAt" TIMESTAMPTZ');
};

const createSessionToken = () => crypto.randomBytes(48).toString('hex');
// TTL de la sesión (deslizante): se renueva en cada validación en /api/auth/session.
const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS || 30);
const sessionExpiry = () => new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
const createResetToken = () => crypto.randomBytes(32).toString('hex');

const parseAccessCompanyIds = (value: any): string[] => {
    if (!value) return [];
    return String(value).split(',').map((x: string) => x.trim()).filter(Boolean);
};

const getNormalizedUserById = async (id: string) => {
    const user = await prisma.user.findUnique({
        where: { id },
        include: {
            company: true,
            roleRef: {
                include: {
                    permissions: {
                        include: {
                            module: true
                        }
                    }
                }
            }
        }
    });
    if (!user) return null;

    const extraResult = await pool.query(
        'SELECT "language", "accessCompanyIds" FROM "User" WHERE id = $1 LIMIT 1',
        [id]
    );
    const extra = extraResult.rows[0];

    return {
        ...user,
        language: extra?.language || null,
        accessCompanyIds: parseAccessCompanyIds(extra?.accessCompanyIds)
    };
};

const getTokenFromRequest = (req: express.Request) => {
    const auth = String(req.headers.authorization || '');
    if (!auth.toLowerCase().startsWith('bearer ')) return '';
    return auth.slice(7).trim();
};

const loadTenantAuthContext = async (req: express.Request, res: express.Response) => {
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

const accessibleCompanyIdsForUser = (ctx: TenantAuthContext): string[] => {
    const raw = [ctx.primaryCompanyId, ...ctx.accessCompanyIds].map((x) => String(x || '').trim()).filter(Boolean);
    return [...new Set(raw)];
};

const assertCompanyInTenantScope = async (pool: pg.Pool, ctx: TenantAuthContext, companyId: string) => {
    const id = String(companyId || '').trim();
    if (!id) return false;
    if (!userCanAccessCompany(ctx, id)) return false;
    return assertCompanyBelongsToOrg(pool, ctx.organizationId, id);
};

const MODULE_PERMISSION_BY_METHOD: Record<string, 'canRead' | 'canCreate' | 'canWrite' | 'canDelete' | null> = {
    GET: 'canRead',
    POST: 'canCreate',
    PUT: 'canWrite',
    PATCH: 'canWrite',
    DELETE: 'canDelete'
};

const MODULE_ROUTE_CODE_MAP: Record<string, string> = buildModuleRouteCodeMap();

const moduleAuthorizationMiddleware = (moduleCode: string) => {
    return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
        try {
            const neededPermission = MODULE_PERMISSION_BY_METHOD[String(req.method || '').toUpperCase()] || null;
            if (!neededPermission) return next();

            const method = String(req.method || '').toUpperCase();
            const subPath = String(req.url || '').split('?')[0];
            const origPath = String(req.originalUrl || '').split('?')[0];
            const isPublicModuleDoc =
                (method === 'GET' || method === 'HEAD') &&
                (subPath === '/openapi.json' ||
                    subPath.endsWith('/openapi.json') ||
                    subPath === '/docs' ||
                    subPath.endsWith('/docs') ||
                    origPath.endsWith('/openapi.json') ||
                    origPath.endsWith('/docs'));
            if (isPublicModuleDoc) return next();

            const token = getTokenFromRequest(req);
            if (!token) {
                return res.status(401).json({ error: 'Missing session token.' });
            }

            const userResult = await pool.query(
                'SELECT id, role, "roleId", "sessionTokenExpiresAt" FROM "User" WHERE "sessionToken" = $1 LIMIT 1',
                [token]
            );
            const user = userResult.rows[0];
            if (!user?.id) {
                return res.status(401).json({ error: 'Invalid session token.' });
            }
            if (user.sessionTokenExpiresAt && new Date(user.sessionTokenExpiresAt).getTime() < Date.now()) {
                return res.status(401).json({ error: 'Session expired.' });
            }

            (req as any).authUserId = String(user.id);
            (req as any).authRoleId = user.roleId ? String(user.roleId) : '';

            const legacyRole = String(user.role || '').trim().toLowerCase();
            if (legacyRole === 'administrator' || legacyRole === 'admin') {
                return next();
            }

            const roleId = String(user.roleId || '').trim();
            if (!roleId) {
                return res.status(403).json({ error: 'User has no assigned role.' });
            }

            const permissionResult = await pool.query(
                `
                  SELECT p."canRead", p."canCreate", p."canWrite", p."canDelete"
                  FROM "Permission" p
                  JOIN "SystemModule" m ON m.id = p."moduleId"
                  WHERE p."roleId" = $1 AND UPPER(m.code) = $2
                  LIMIT 1
                `,
                [roleId, String(moduleCode || '').toUpperCase()]
            );
            const permission = permissionResult.rows[0];
            const isAllowed = Boolean(permission?.[neededPermission]);

            if (!isAllowed) {
                return res.status(403).json({
                    error: `Forbidden: missing ${neededPermission} permission for module ${moduleCode}.`
                });
            }

            return next();
        } catch (error: any) {
            return res.status(500).json({ error: 'Failed to authorize request', details: error?.message || String(error) });
        }
    };
};

const ensurePublicEntityTables = async () => {
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

    await pool.query(`
      DO $$
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EntityNote_createdById_fkey') THEN
              ALTER TABLE "EntityNote" ADD CONSTRAINT "EntityNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
          END IF;

          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EntityNote_updatedById_fkey') THEN
              ALTER TABLE "EntityNote" ADD CONSTRAINT "EntityNote_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
          END IF;

          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EntityFile_createdById_fkey') THEN
              ALTER TABLE "EntityFile" ADD CONSTRAINT "EntityFile_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
          END IF;

          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EntityFile_updatedById_fkey') THEN
              ALTER TABLE "EntityFile" ADD CONSTRAINT "EntityFile_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
          END IF;
      END $$;
    `);
};

const normalizePublicCompanyIds = (value: any): string[] => {
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    for (const raw of value) {
        const id = String(raw || '').trim();
        if (id) seen.add(id);
    }
    return Array.from(seen);
};

const ensurePublicClientsSchema = async () => {
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
};

const nextPublicClientCode = (poolRef: pg.Pool) => async (companyId: string) => {
    const cid = String(companyId || '').trim();
    if (!cid) throw new Error('companyId is required to generate a client code');
    return reserveNextReference(poolRef, { companyId: cid, module: 'CLIENTS', code: 'CLIENTS' });
};

const nextPublicClientCodeForCompany = nextPublicClientCode(pool);

const getPublicClientById = async (clientId: string) => {
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
          WHERE c.id = $1
          GROUP BY c.id, creator.name, updater.name
          LIMIT 1
        `,
        [clientId]
    );
    return result.rows[0] || null;
};

const requirePublicApiAuth = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
        await ensureUserColumns();
        const token = getTokenFromRequest(req);
        if (!token) return res.status(401).json({ error: 'Bearer token is required.' });

        const sessionResult = await pool.query(
            'SELECT id FROM "User" WHERE "sessionToken" = $1 LIMIT 1',
            [token]
        );
        const userId = String(sessionResult.rows[0]?.id || '').trim();
        if (!userId) return res.status(401).json({ error: 'Invalid or expired token.' });

        (req as any).publicApiUserId = userId;
        next();
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to validate token', details: error.message });
    }
};

const ensureBaseCurrencyCategory = async () => {
    let currencyCategory = await prisma.category.findFirst({ where: { code: 'BASE_CURRENCY' } });

    if (!currencyCategory) {
        currencyCategory = await prisma.category.create({
            data: {
                code: 'BASE_CURRENCY',
                name: 'Base Currency',
                description: 'Base currencies available for organization localization.',
                module: 'Organization',
                status: 'Active',
                sortingRule: 'Manual'
            }
        });
    }

    const currencies = ['USD', 'EUR', 'ARS', 'CLP'];

    for (let i = 0; i < currencies.length; i += 1) {
        const code = currencies[i];
        const existing = await prisma.categoryItem.findFirst({
            where: {
                categoryId: currencyCategory.id,
                OR: [{ code }, { name: code }]
            }
        });

        if (!existing) {
            await prisma.categoryItem.create({
                data: {
                    categoryId: currencyCategory.id,
                    code,
                    name: code,
                    description: `${code} base currency`,
                    status: 'Active',
                    sortOrder: i
                }
            });
        }
    }
};

// --- Organization API ---

app.get('/api/organization', async (req, res) => {
    try {
        const ctx = await loadTenantAuthContext(req, res);
        if (!ctx) return;
        await ensureOrganizationColumns();
        await ensureBaseCurrencyCategory();
        const result = await pool.query('SELECT * FROM "Organization" WHERE id = $1 LIMIT 1', [ctx.organizationId]);
        const org = result.rows[0];
        res.json(org || {});
    } catch (error) {
        console.error('Error fetching organization:', error);
        res.status(500).json({ error: 'Failed to fetch organization' });
    }
});

app.put('/api/organization', async (req, res) => {
    try {
        const ctx = await loadTenantAuthContext(req, res);
        if (!ctx) return;
        await ensureOrganizationColumns();
        await ensureBaseCurrencyCategory();
        const orgData = stripOrganizationSmtpFields(req.body) as Record<string, unknown>;
        delete orgData.id;
        const orgId = ctx.organizationId;
        let updated;
        try {
            updated = await prisma.organization.update({
                where: { id: orgId },
                data: orgData as any
            });
        } catch (err: any) {
            if (err.message && err.message.includes('Unknown argument')) {
                const keys = Object.keys(orgData);
                const setClause = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ');
                const values = Object.values(orgData);
                await pool.query(`UPDATE "Organization" SET ${setClause}, "updatedAt" = NOW() WHERE id = $${keys.length + 1}`, [...values, orgId]);
                const result = await pool.query('SELECT * FROM "Organization" WHERE id = $1', [orgId]);
                updated = result.rows[0];
            } else {
                throw err;
            }
        }

        // Logic for creating storage folders if provider is Local
        if (updated.storageProvider === 'Local') {
            const storagePath = STORAGE_ROOT;
            if (!fs.existsSync(storagePath)) {
                fs.mkdirSync(storagePath);
            }
            const orgFolderName = updated.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '_' + updated.id.split('-')[0];
            const orgPath = path.join(storagePath, orgFolderName);
            if (!fs.existsSync(orgPath)) {
                fs.mkdirSync(orgPath);
            }
        }

        res.json(updated);
    } catch (error: any) {
        console.error('Error saving organization:', error);
        fs.appendFileSync(logFile, `[${new Date().toISOString()}] SAVE FAILURE: ${error.message}\n${error.stack}\n`);
        res.status(500).json({ error: 'Failed to save organization', details: error.message });
    }
});


app.get('/api/smtp-config', async (req, res) => {
    try {
        await ensureAdminSupportTables(pool);
        const result = await pool.query('SELECT value FROM "PlatformSetting" WHERE "key" = $1 LIMIT 1', ['smtp']);
        const value = (result.rows[0]?.value as Record<string, unknown>) || {};
        const provider = value?.provider === 'SES' ? 'SES' : 'SMTP';
        const settings = isPlainObject(value.config) ? (value.config as Record<string, unknown>) : {};
        res.json({
            provider,
            config: sanitizeSmtpConfigForResponse(provider, settings)
        });
    } catch (error: any) {
        console.error('Error fetching smtp config:', error);
        res.status(500).json({ error: 'Failed to fetch smtp config', details: error.message });
    }
});

app.put('/api/smtp-config', async (req, res) => {
    try {
        await ensureAdminSupportTables(pool);
        const provider = String(req.body?.provider || 'SMTP').toUpperCase() === 'SES' ? 'SES' : 'SMTP';

        const existingResult = await pool.query('SELECT value FROM "PlatformSetting" WHERE "key" = $1 LIMIT 1', ['smtp']);
        const existingValue = (existingResult.rows[0]?.value as Record<string, unknown>) || {};
        const existingSettings = isPlainObject(existingValue.config) ? (existingValue.config as Record<string, unknown>) : {};

        const incoming = isPlainObject(req.body?.config) ? (req.body.config as Record<string, unknown>) : {};
        const normalizedConfig = normalizeSmtpConfig(provider, incoming, existingSettings);

        const payload = { provider, config: normalizedConfig };
        await pool.query(
            `INSERT INTO "PlatformSetting" ("key", value, "updatedAt")
             VALUES ($1, $2::jsonb, NOW())
             ON CONFLICT ("key") DO UPDATE SET value = EXCLUDED.value, "updatedAt" = NOW()`,
            ['smtp', JSON.stringify(payload)]
        );

        res.json({
            success: true,
            provider,
            config: sanitizeSmtpConfigForResponse(provider, normalizedConfig)
        });
    } catch (error: any) {
        console.error('Error saving smtp config:', error);
        res.status(500).json({ error: 'Failed to save smtp config', details: error.message });
    }
});

app.post('/api/smtp-config/test', async (req, res) => {
    try {
        await ensureAdminSupportTables(pool);
        const toEmail = String(req.body?.toEmail || '').trim();
        if (!toEmail || !isValidEmail(toEmail)) {
            return res.status(400).json({ error: 'Valid toEmail is required.' });
        }

        const requestedProvider = String(req.body?.provider || '').toUpperCase();
        const requested = requestedProvider === 'SES' ? 'SES' : requestedProvider === 'SMTP' ? 'SMTP' : '';

        const result = await pool.query('SELECT value FROM "PlatformSetting" WHERE "key" = $1 LIMIT 1', ['smtp']);
        const storedValue = (result.rows[0]?.value as Record<string, unknown>) || {};
        const storedProvider = storedValue?.provider === 'SES' ? 'SES' : 'SMTP';
        const baseProvider = requested || storedProvider;
        const storedConfig = isPlainObject(storedValue.config) ? (storedValue.config as Record<string, unknown>) : {};
        const incoming = isPlainObject(req.body?.config) ? (req.body.config as Record<string, unknown>) : {};
        const normalizedConfig = normalizeSmtpConfig(baseProvider, incoming, storedConfig);

        if (baseProvider === 'SES' && !isValidEmail(String(normalizedConfig.fromEmail || ''))) {
            return res.status(400).json({ error: 'SES fromEmail must be a valid email.' });
        }
        if (baseProvider === 'SMTP' && normalizedConfig.fromEmail && !isValidEmail(String(normalizedConfig.fromEmail))) {
            return res.status(400).json({ error: 'SMTP fromEmail must be a valid email.' });
        }

        await sendTestEmailWithConfig(baseProvider, normalizedConfig, toEmail);

        res.json({ success: true, message: 'Test email sent to ' + toEmail + ' using ' + baseProvider + '.' });
    } catch (error: any) {
        console.error('Error sending test email:', error);
        res.status(500).json({ error: 'Failed to send test email', details: error.message });
    }
});

app.get('/api/translations/overrides', async (req, res) => {
    try {
        await ensureAdminSupportTables(pool);
        const locale = String(req.query.locale || '').trim().toLowerCase();
        if (!locale) return res.status(400).json({ error: 'locale is required' });
        const result = await pool.query(
            `SELECT id, locale, namespace, key, value, "updatedAt"
             FROM "TranslationOverride"
             WHERE locale = $1
             ORDER BY namespace ASC NULLS FIRST, key ASC`,
            [locale]
        );
        const rows = result.rows;
        res.json(buildTranslationOverridesObject(rows, locale));
    } catch (error: any) {
        console.error('Error fetching translation overrides:', error);
        res.status(500).json({ error: 'Failed to fetch translation overrides', details: error.message });
    }
});

// --- Roles & Modules API ---

app.get('/api/modules', async (req, res) => {
    try {
        const modules = await prisma.systemModule.findMany({
            orderBy: { name: 'asc' }
        });
        res.json(modules);
    } catch (error) {
        console.error('Error fetching modules:', error);
        res.status(500).json({ error: 'Failed to fetch modules' });
    }
});

app.get('/api/modules/catalog', async (req, res) => {
    try {
        const diskModules = getDiskModules();
        const dbModules = await prisma.systemModule.findMany({ orderBy: { name: 'asc' } });
        const dbByCode = new Map(dbModules.map((m) => [String(m.code || '').toUpperCase(), m]));
        const usedCodes = new Set<string>();

        const catalog = diskModules.map(({ folder, manifest }) => {
            const code = String(manifest.code || '').toUpperCase();
            const dbRow = dbByCode.get(code) || null;
            usedCodes.add(code);

            return {
                id: dbRow?.id || null,
                name: dbRow?.name || manifest.name,
                code,
                description: dbRow?.description || manifest.description || null,
                version: manifest.version || null,
                folder,
                availableInFilesystem: true,
                installed: Boolean(dbRow),
                status: dbRow?.status || null
            };
        });

        for (const dbRow of dbModules) {
            const code = String(dbRow.code || '').toUpperCase();
            if (usedCodes.has(code)) continue;

            catalog.push({
                id: dbRow.id,
                name: dbRow.name,
                code,
                description: dbRow.description || null,
                version: null,
                folder: null,
                availableInFilesystem: false,
                installed: true,
                status: dbRow.status
            });
        }

        catalog.sort((a, b) => a.name.localeCompare(b.name));
        res.json(catalog);
    } catch (error) {
        console.error('Error fetching module catalog:', error);
        res.status(500).json({ error: 'Failed to fetch module catalog' });
    }
});

app.post('/api/modules/install', async (req, res) => {
    try {
        const moduleKey = String(req.body?.code || req.body?.module || '').trim();
        if (!moduleKey) {
            return res.status(400).json({ error: 'Module code is required' });
        }

        const diskModule = findDiskModule(moduleKey);
        if (!diskModule) {
            return res.status(404).json({ error: 'Module not found in /modules' });
        }

        const { dir, manifest } = diskModule;
        await ensureModuleMigrationsTable();
        await executeModuleMigrations(dir, manifest);

        await maybeRunModuleHook(dir, 'install', {
            pool,
            moduleCode: manifest.code,
            moduleName: manifest.name,
            moduleDescription: manifest.description || null
        });

        let row = await prisma.systemModule.findUnique({ where: { code: manifest.code } });
        if (!row) {
            row = await prisma.systemModule.create({
                data: {
                    name: manifest.name,
                    code: manifest.code,
                    description: manifest.description || null,
                    status: 'Active'
                }
            });
        } else if (row.status !== 'Active') {
            row = await prisma.systemModule.update({
                where: { id: row.id },
                data: {
                    name: manifest.name,
                    description: manifest.description || row.description,
                    status: 'Active'
                }
            });
        }

        res.json({ success: true, module: row });
    } catch (error: any) {
        console.error('Error installing module:', error);
        res.status(500).json({ error: 'Failed to install module', details: error.message });
    }
});

app.post('/api/modules', async (req, res) => {
    try {
        const { name, code, description, status } = req.body;
        if (!name || !code) return res.status(400).json({ error: 'Name and Code are required' });

        const mod = await prisma.systemModule.create({
            data: {
                name,
                code: String(code).toUpperCase().trim(),
                description,
                status: status || 'Active'
            }
        });
        res.json(mod);
    } catch (error: any) {
        console.error('Error creating module:', error);
        if (error.code === 'P2002') return res.status(400).json({ error: 'Module with this name or code already exists' });
        res.status(500).json({ error: 'Failed to create module' });
    }
});

app.put('/api/modules/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, code, description, status } = req.body;
        const mod = await prisma.systemModule.update({
            where: { id },
            data: {
                name,
                code: code ? String(code).toUpperCase().trim() : undefined,
                description,
                status
            }
        });
        res.json(mod);
    } catch (error: any) {
        console.error('Error updating module:', error);
        if (error.code === 'P2002') return res.status(400).json({ error: 'Module with this name or code already exists' });
        res.status(500).json({ error: 'Failed to update module' });
    }
});

app.post('/api/modules/:id/uninstall', async (req, res) => {
    try {
        const { id } = req.params;
        const purgeData = Boolean(req.body?.purgeData);
        const row = await prisma.systemModule.findUnique({ where: { id } });
        if (!row) return res.status(404).json({ error: 'Module not found' });

        const diskModule = findDiskModule(row.code);
        if (diskModule) {
            await maybeRunModuleHook(diskModule.dir, 'uninstall', {
                pool,
                moduleCode: row.code,
                moduleName: row.name,
                moduleDescription: row.description || null,
                purgeData
            });
        }

        const mod = await prisma.systemModule.update({
            where: { id },
            data: { status: 'Inactive' }
        });
        res.json({ success: true, module: mod });
    } catch (error: any) {
        console.error('Error uninstalling module:', error);
        res.status(500).json({ error: 'Failed to uninstall module', details: error.message });
    }
});

app.delete('/api/modules/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.systemModule.delete({ where: { id } });
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting module:', error);
        res.status(500).json({ error: 'Failed to delete module' });
    }
});

// --- Menu Config API ---
app.get('/api/menu-config', async (req, res) => {
    try {
        await ensureDefaultMenuConfig();
        await ensureMyPlanMenuItem();

        const groupsResult = await pool.query(
            `SELECT id, key, label, icon, status, "sortOrder", placement, "displayMode"
             FROM "MenuGroup"
             ORDER BY placement ASC, "sortOrder" ASC, label ASC`
        );
        const itemsResult = await pool.query(
            `SELECT id, "groupId", label, icon, "targetType", "viewKey", "moduleCode", "linkUrl", "openInNewTab", status, "sortOrder", "displayMode"
             FROM "MenuItem"
             ORDER BY "sortOrder" ASC, label ASC`
        );

        const groups = groupsResult.rows as MenuGroupRow[];
        const itemsByGroup = new Map<string, MenuItemRow[]>();
        for (const item of (itemsResult.rows as MenuItemRow[])) {
            if (!itemsByGroup.has(item.groupId)) itemsByGroup.set(item.groupId, []);
            itemsByGroup.get(item.groupId)!.push(item);
        }

        res.json({
            groups: groups.map((group) => ({
                ...group,
                placement: normalizeMenuPlacement(group.placement),
                displayMode: normalizeDisplayMode((group as MenuGroupRow).displayMode),
                items: (itemsByGroup.get(group.id) || []).map((item) => {
                    const row = item as MenuItemRow;
                    return {
                        ...item,
                        targetType: normalizeMenuItemTargetType(row.targetType),
                        displayMode: normalizeDisplayMode(row.displayMode),
                        linkUrl: row.linkUrl || null,
                        openInNewTab: Boolean(row.openInNewTab)
                    };
                })
            }))
        });
    } catch (error: any) {
        console.error('Error fetching menu config:', error);
        res.status(500).json({ error: 'Failed to fetch menu config', details: error.message });
    }
});

app.post('/api/menu-config/groups', async (req, res) => {
    try {
        await ensureMenuConfigTables();
        const label = String(req.body?.label || '').trim();
        const icon = String(req.body?.icon || '').trim() || 'fa-folder';
        const keyInput = String(req.body?.key || '').trim().toLowerCase();
        const status = String(req.body?.status || 'Active') === 'Inactive' ? 'Inactive' : 'Active';
        const placement = normalizeMenuPlacement(req.body?.placement);
        const displayMode = normalizeDisplayMode(req.body?.displayMode);

        if (!label) return res.status(400).json({ error: 'label is required' });

        const keyBase = (keyInput || label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `group-${Date.now()}`;
        let key = keyBase;
        let suffix = 1;
        while (true) {
            const exists = await pool.query(
                'SELECT 1 FROM "MenuGroup" WHERE key = $1 AND placement = $2 LIMIT 1',
                [key, placement]
            );
            if (!exists.rows[0]) break;
            suffix += 1;
            key = `${keyBase}-${suffix}`;
        }

        const maxOrder = await pool.query(
            'SELECT COALESCE(MAX("sortOrder"), 0) AS max_order FROM "MenuGroup" WHERE placement = $1',
            [placement]
        );
        const nextOrder = Number(maxOrder.rows[0]?.max_order || 0) + 10;
        const id = crypto.randomUUID();
        const result = await pool.query(
            `INSERT INTO "MenuGroup" (id, key, label, icon, status, "sortOrder", placement, "displayMode", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
             RETURNING id, key, label, icon, status, "sortOrder", placement, "displayMode"`,
            [id, key, label, icon, status, nextOrder, placement, displayMode]
        );
        res.status(201).json(result.rows[0]);
    } catch (error: any) {
        console.error('Error creating menu group:', error);
        res.status(500).json({ error: 'Failed to create menu group', details: error.message });
    }
});

app.put('/api/menu-config/groups/reorder', async (req, res) => {
    try {
        await ensureMenuConfigTables();
        const groupIds = Array.isArray(req.body?.groupIds) ? req.body.groupIds.map((id: unknown) => String(id)) : [];
        if (!groupIds.length) return res.status(400).json({ error: 'groupIds is required' });

        const placements = await pool.query(
            'SELECT DISTINCT placement FROM "MenuGroup" WHERE id = ANY($1::text[])',
            [groupIds]
        );
        const placementList = placements.rows.map((r: { placement: string }) => normalizeMenuPlacement(r.placement));
        if (placementList.length !== 1) {
            return res.status(400).json({ error: 'All reordered groups must share the same placement' });
        }

        await pool.query('BEGIN');
        try {
            for (let i = 0; i < groupIds.length; i += 1) {
                await pool.query(
                    'UPDATE "MenuGroup" SET "sortOrder" = $1, "updatedAt" = NOW() WHERE id = $2',
                    [(i + 1) * 10, groupIds[i]]
                );
            }
            await pool.query('COMMIT');
        } catch (error) {
            await pool.query('ROLLBACK');
            throw error;
        }

        res.json({ success: true });
    } catch (error: any) {
        console.error('Error reordering menu groups:', error);
        res.status(500).json({ error: 'Failed to reorder menu groups', details: error.message });
    }
});

app.put('/api/menu-config/groups/:id', async (req, res) => {
    try {
        await ensureMenuConfigTables();
        const id = String(req.params.id || '').trim();
        if (!id) return res.status(400).json({ error: 'id is required' });

        const existing = await pool.query('SELECT id FROM "MenuGroup" WHERE id = $1 LIMIT 1', [id]);
        if (!existing.rows[0]) return res.status(404).json({ error: 'Menu group not found' });

        const updates: string[] = [];
        const params: any[] = [];
        const maybeSet = (column: string, value: unknown) => {
            params.push(value);
            updates.push(`${column} = $${params.length}`);
        };

        if (typeof req.body?.label === 'string') maybeSet('label', String(req.body.label).trim() || 'Untitled');
        if (typeof req.body?.icon === 'string') maybeSet('icon', String(req.body.icon).trim() || 'fa-folder');
        if (typeof req.body?.status === 'string') maybeSet('status', String(req.body.status) === 'Inactive' ? 'Inactive' : 'Active');
        if (typeof req.body?.displayMode === 'string') {
            maybeSet('"displayMode"', normalizeDisplayMode(req.body.displayMode));
        }

        if (!updates.length) {
            const current = await pool.query(
                'SELECT id, key, label, icon, status, "sortOrder", placement, "displayMode" FROM "MenuGroup" WHERE id = $1 LIMIT 1',
                [id]
            );
            return res.json(current.rows[0]);
        }

        params.push(id);
        const result = await pool.query(
            `UPDATE "MenuGroup"
             SET ${updates.join(', ')}, "updatedAt" = NOW()
             WHERE id = $${params.length}
             RETURNING id, key, label, icon, status, "sortOrder", placement, "displayMode"`,
            params
        );
        res.json(result.rows[0]);
    } catch (error: any) {
        console.error('Error updating menu group:', error);
        res.status(500).json({ error: 'Failed to update menu group', details: error.message });
    }
});

app.delete('/api/menu-config/groups/:id', async (req, res) => {
    try {
        await ensureMenuConfigTables();
        const id = String(req.params.id || '').trim();
        if (!id) return res.status(400).json({ error: 'id is required' });

        await pool.query('DELETE FROM "MenuGroup" WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (error: any) {
        console.error('Error deleting menu group:', error);
        res.status(500).json({ error: 'Failed to delete menu group', details: error.message });
    }
});

app.post('/api/menu-config/items', async (req, res) => {
    try {
        await ensureMenuConfigTables();
        const groupId = String(req.body?.groupId || '').trim();
        const label = String(req.body?.label || '').trim();
        const icon = String(req.body?.icon || '').trim() || 'fa-link';
        const targetType = normalizeMenuItemTargetType(req.body?.targetType);
        const status = String(req.body?.status || 'Active') === 'Inactive' ? 'Inactive' : 'Active';
        const displayMode = normalizeDisplayMode(req.body?.displayMode);
        const id = crypto.randomUUID();

        let viewKey = String(req.body?.viewKey || '').trim();
        let moduleCode: string | null = null;
        let linkUrl: string | null = null;
        let openInNewTab = Boolean(req.body?.openInNewTab);

        if (targetType === 'EXTERNAL_URL') {
            const safe = assertSafeMenuLinkUrl(req.body?.linkUrl);
            if (!safe) {
                return res.status(400).json({
                    error: 'linkUrl is required for free links. Use http(s), mailto, tel, or a path starting with / (not //).'
                });
            }
            linkUrl = safe;
            viewKey = `ext:${id}`;
            moduleCode = null;
        } else if (targetType === 'MODULE_VIEW') {
            moduleCode = String(req.body?.moduleCode || '').trim().toUpperCase() || null;
            if (!viewKey) return res.status(400).json({ error: 'viewKey is required' });
        } else if (!viewKey) {
            return res.status(400).json({ error: 'groupId, label and viewKey are required' });
        }

        if (!groupId || !label) return res.status(400).json({ error: 'groupId and label are required' });

        const groupExists = await pool.query('SELECT id FROM "MenuGroup" WHERE id = $1 LIMIT 1', [groupId]);
        if (!groupExists.rows[0]) return res.status(404).json({ error: 'Menu group not found' });

        const maxOrder = await pool.query('SELECT COALESCE(MAX("sortOrder"), 0) AS max_order FROM "MenuItem" WHERE "groupId" = $1', [groupId]);
        const nextOrder = Number(maxOrder.rows[0]?.max_order || 0) + 10;

        const result = await pool.query(
            `INSERT INTO "MenuItem" (id, "groupId", label, icon, "targetType", "viewKey", "moduleCode", "linkUrl", "openInNewTab", status, "sortOrder", "displayMode", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
             RETURNING id, "groupId", label, icon, "targetType", "viewKey", "moduleCode", "linkUrl", "openInNewTab", status, "sortOrder", "displayMode"`,
            [
                id,
                groupId,
                label,
                icon,
                targetType,
                viewKey,
                moduleCode,
                linkUrl,
                targetType === 'EXTERNAL_URL' ? openInNewTab : false,
                status,
                nextOrder,
                displayMode
            ]
        );
        res.status(201).json(result.rows[0]);
    } catch (error: any) {
        console.error('Error creating menu item:', error);
        res.status(500).json({ error: 'Failed to create menu item', details: error.message });
    }
});

app.put('/api/menu-config/items/reorder', async (req, res) => {
    try {
        await ensureMenuConfigTables();
        const groupId = String(req.body?.groupId || '').trim();
        const itemIds = Array.isArray(req.body?.itemIds) ? req.body.itemIds.map((id: unknown) => String(id)) : [];
        if (!groupId || !itemIds.length) return res.status(400).json({ error: 'groupId and itemIds are required' });

        await pool.query('BEGIN');
        try {
            for (let i = 0; i < itemIds.length; i += 1) {
                await pool.query(
                    'UPDATE "MenuItem" SET "groupId" = $1, "sortOrder" = $2, "updatedAt" = NOW() WHERE id = $3',
                    [groupId, (i + 1) * 10, itemIds[i]]
                );
            }
            await pool.query('COMMIT');
        } catch (error) {
            await pool.query('ROLLBACK');
            throw error;
        }
        res.json({ success: true });
    } catch (error: any) {
        console.error('Error reordering menu items:', error);
        res.status(500).json({ error: 'Failed to reorder menu items', details: error.message });
    }
});

app.put('/api/menu-config/items/:id', async (req, res) => {
    try {
        await ensureMenuConfigTables();
        const id = String(req.params.id || '').trim();
        if (!id) return res.status(400).json({ error: 'id is required' });

        const existing = await pool.query('SELECT id FROM "MenuItem" WHERE id = $1 LIMIT 1', [id]);
        if (!existing.rows[0]) return res.status(404).json({ error: 'Menu item not found' });

        const updates: string[] = [];
        const params: any[] = [];
        const setColumn = (column: string, value: unknown) => {
            params.push(value);
            updates.push(`${column} = $${params.length}`);
        };

        if (typeof req.body?.groupId === 'string') setColumn('"groupId"', String(req.body.groupId).trim());
        if (typeof req.body?.label === 'string') setColumn('label', String(req.body.label).trim() || 'Untitled');
        if (typeof req.body?.icon === 'string') setColumn('icon', String(req.body.icon).trim() || 'fa-link');
        if (typeof req.body?.targetType === 'string') {
            setColumn('"targetType"', normalizeMenuItemTargetType(req.body.targetType));
        }
        if (typeof req.body?.viewKey === 'string') setColumn('"viewKey"', String(req.body.viewKey).trim());
        if (typeof req.body?.moduleCode === 'string' || req.body?.moduleCode === null) {
            setColumn('"moduleCode"', req.body?.moduleCode ? String(req.body.moduleCode).trim().toUpperCase() : null);
        }
        if (typeof req.body?.linkUrl === 'string' || req.body?.linkUrl === null) {
            const v = req.body?.linkUrl;
            if (v === null) {
                setColumn('"linkUrl"', null);
            } else {
                const raw = String(v).trim();
                if (!raw) {
                    setColumn('"linkUrl"', null);
                } else {
                    const safe = assertSafeMenuLinkUrl(raw);
                    if (!safe) {
                        return res.status(400).json({ error: 'Invalid linkUrl' });
                    }
                    setColumn('"linkUrl"', safe);
                }
            }
        }
        if (typeof req.body?.openInNewTab === 'boolean') {
            setColumn('"openInNewTab"', req.body.openInNewTab);
        }
        if (typeof req.body?.status === 'string') {
            setColumn('status', String(req.body.status) === 'Inactive' ? 'Inactive' : 'Active');
        }
        if (typeof req.body?.displayMode === 'string') {
            setColumn('"displayMode"', normalizeDisplayMode(req.body.displayMode));
        }

        if (!updates.length) {
            const current = await pool.query(
                'SELECT id, "groupId", label, icon, "targetType", "viewKey", "moduleCode", "linkUrl", "openInNewTab", status, "sortOrder", "displayMode" FROM "MenuItem" WHERE id = $1 LIMIT 1',
                [id]
            );
            return res.json(current.rows[0]);
        }

        params.push(id);
        const result = await pool.query(
            `UPDATE "MenuItem"
             SET ${updates.join(', ')}, "updatedAt" = NOW()
             WHERE id = $${params.length}
             RETURNING id, "groupId", label, icon, "targetType", "viewKey", "moduleCode", "linkUrl", "openInNewTab", status, "sortOrder", "displayMode"`,
            params
        );
        res.json(result.rows[0]);
    } catch (error: any) {
        console.error('Error updating menu item:', error);
        res.status(500).json({ error: 'Failed to update menu item', details: error.message });
    }
});

app.delete('/api/menu-config/items/:id', async (req, res) => {
    try {
        await ensureMenuConfigTables();
        const id = String(req.params.id || '').trim();
        if (!id) return res.status(400).json({ error: 'id is required' });
        await pool.query('DELETE FROM "MenuItem" WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (error: any) {
        console.error('Error deleting menu item:', error);
        res.status(500).json({ error: 'Failed to delete menu item', details: error.message });
    }
});

app.get('/api/roles', async (req, res) => {
    try {
        const roles = await prisma.role.findMany({
            include: {
                _count: { select: { users: true } },
                permissions: {
                    include: { module: true }
                }
            },
            orderBy: { name: 'asc' }
        });
        res.json(roles);
    } catch (error) {
        console.error('Error fetching roles:', error);
        res.status(500).json({ error: 'Failed to fetch roles' });
    }
});

app.post('/api/roles', async (req, res) => {
    try {
        const { name, description, permissions } = req.body;
        if (!name) return res.status(400).json({ error: 'Role name is required' });

        const role = await prisma.role.create({
            data: {
                name,
                description,
                permissions: {
                    create: permissions?.map((p: any) => ({
                        moduleId: p.moduleId,
                        canRead: p.canRead || false,
                        canWrite: p.canWrite || false,
                        canCreate: p.canCreate || false,
                        canDelete: p.canDelete || false
                    })) || []
                }
            },
            include: { permissions: true }
        });
        res.json(role);
    } catch (error: any) {
        console.error('Error creating role:', error);
        if (error.code === 'P2002') return res.status(400).json({ error: 'Role with this name already exists' });
        res.status(500).json({ error: 'Failed to create role' });
    }
});

app.put('/api/roles/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, permissions } = req.body;

        await prisma.permission.deleteMany({ where: { roleId: id } });

        const role = await prisma.role.update({
            where: { id },
            data: {
                name,
                description,
                permissions: {
                    create: permissions?.map((p: any) => ({
                        moduleId: p.moduleId,
                        canRead: p.canRead || false,
                        canWrite: p.canWrite || false,
                        canCreate: p.canCreate || false,
                        canDelete: p.canDelete || false
                    })) || []
                }
            },
            include: { permissions: true }
        });
        res.json(role);
    } catch (error) {
        console.error('Error updating role:', error);
        res.status(500).json({ error: 'Failed to update role' });
    }
});

app.get('/api/companies', async (req, res) => {
    try {
        const ctx = await loadTenantAuthContext(req, res);
        if (!ctx) return;
        const accessibleIds = accessibleCompanyIdsForUser(ctx);
        if (!accessibleIds.length) {
            return res.json([]);
        }

        const { companyId, status } = req.query;
        const filterCompanyId = companyId ? String(companyId) : '';
        if (filterCompanyId && !accessibleIds.includes(filterCompanyId)) {
            return res.status(403).json({ error: 'Not allowed to access this company.' });
        }

        let query =
            'SELECT * FROM "Company" WHERE "organizationId" = $1 AND id = ANY($2::text[])';
        const params: unknown[] = [ctx.organizationId, accessibleIds];

        if (filterCompanyId) {
            params.push(filterCompanyId);
            query += ` AND id = $${params.length}`;
        }
        if (status) {
            params.push(status);
            query += ` AND status = $${params.length}`;
        }
        query += ' ORDER BY name ASC';

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching companies:', error);
        res.status(500).json({ error: 'Failed to fetch companies' });
    }
});

app.post('/api/companies/:id/logo', upload.single('logo'), async (req, res) => {
    try {
        const ctx = await loadTenantAuthContext(req, res);
        if (!ctx) return;
        const { id } = req.params;
        const file = req.file;
        if (!file) return res.status(400).json({ error: 'No file uploaded' });
        if (!(await assertCompanyInTenantScope(pool, ctx, id))) {
            return res.status(403).json({ error: 'Not allowed to update this company.' });
        }

        const orgResult = await pool.query('SELECT * FROM "Organization" WHERE id = $1 LIMIT 1', [ctx.organizationId]);
        const org = orgResult.rows[0];
        const provider = org?.storageProvider || 'Local';
        
        let logoUrl = '';

        if (provider === 'Local') {
            const storagePath = STORAGE_ROOT;
            const orgFolderName = org.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '_' + org.id.split('-')[0];
            const logoFilename = `logo_${Date.now()}${path.extname(file.originalname)}`;
            const finalPath = path.join(storagePath, orgFolderName, logoFilename);
            
            if (!fs.existsSync(path.dirname(finalPath))) {
                fs.mkdirSync(path.dirname(finalPath), { recursive: true });
            }
            
            fs.writeFileSync(finalPath, file.buffer);
            logoUrl = `/storage/${orgFolderName}/${logoFilename}`;
        } else {
            // For S3, GoogleCloud, Azure, we would ideally use their SDKs. 
            // For now, if not Local, we'll return an error or log it as TODO if SDKs are missing.
            // But if user expects it to work, I should try to implement S3 if possible.
            // Since SDKs are not installed, I'll log a warning and fallback to Local or error.
            return res.status(501).json({ error: `Storage provider ${provider} not fully implemented yet in the API. Please use Local for now.` });
        }

        await pool.query('UPDATE "Company" SET "logoUrl" = $1 WHERE id = $2', [logoUrl, id]);
        res.json({ success: true, logoUrl });
    } catch (error: any) {
        console.error('Error uploading logo:', error);
        res.status(500).json({ error: 'Failed to upload logo', details: error.message });
    }
});

app.get('/api/companies/:id/pdf', async (req, res) => {
    try {
        const ctx = await loadTenantAuthContext(req, res);
        if (!ctx) return;
        const { id } = req.params;
        if (!(await assertCompanyInTenantScope(pool, ctx, id))) {
            return res.status(403).json({ error: 'Not allowed to access this company.' });
        }
        const result = await pool.query('SELECT * FROM "Company" WHERE id = $1', [id]);
        const company = result.rows[0];
        if (!company) return res.status(404).json({ error: 'Company not found' });

        const doc = new jsPDF();
        doc.setFontSize(22);
        doc.text(company.name, 20, 20);
        
        doc.setFontSize(12);
        doc.text(`Reference: ${company.fullreference || company.code || 'N/A'}`, 20, 35);
        doc.text(`Status: ${company.status}`, 20, 45);
        doc.text(`Email: ${company.email || 'N/A'}`, 20, 55);
        doc.text(`Phone: ${company.phone || 'N/A'}`, 20, 65);
        doc.text(`Website: ${company.website || 'N/A'}`, 20, 75);
        doc.text(`Location: ${[company.city, company.state, company.country].filter(Boolean).join(', ')}`, 20, 85);
        doc.text(`VAT Code: ${company.vatCode || 'N/A'}`, 20, 95);
        
        doc.text('Description:', 20, 110);
        doc.setFontSize(10);
        const splitDescription = doc.splitTextToSize(company.description || 'No description provided.', 170);
        doc.text(splitDescription, 20, 120);

        const pdfBuffer = doc.output('arraybuffer');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=company_${id}.pdf`);
        res.send(Buffer.from(pdfBuffer));
    } catch (error: any) {
        console.error('Error generating PDF:', error);
        res.status(500).json({ error: 'Failed to generate PDF', details: error.message });
    }
});

app.post('/api/companies', async (req, res) => {
    const ctx = await loadTenantAuthContext(req, res);
    if (!ctx) return;

    const client = await pool.connect();
    try {
        await ensureCompanyZipcodeColumn();
        const orgData = await client.query(
            'SELECT id, "dateFormat", "timeFormat", "timezone", "moneyFormat", "currencyPosition", "defaultLanguage", "baseCurrency" FROM "Organization" WHERE id = $1 LIMIT 1',
            [ctx.organizationId]
        );
        const org = orgData.rows[0];
        if (!org) return res.status(400).json({ error: 'Organization not found' });

        const localizationDefaults = {
            dateFormat: org.dateFormat || 'YYYY/MM/DD',
            timeFormat: org.timeFormat || 'HH:mm',
            timezone: org.timezone || 'UTC',
            moneyFormat: org.moneyFormat || '1,234.56',
            currencyPosition: org.currencyPosition || 'Prefix',
            defaultLanguage: org.defaultLanguage || 'English',
            baseCurrency: org.baseCurrency || 'USD'
        };

        const incomingData = req.body || {};
        const data = { ...incomingData, organizationId: org.id };

        for (const [key, fallback] of Object.entries(localizationDefaults)) {
            const value = (data as any)[key];
            if (value === undefined || value === null || value === '') {
                (data as any)[key] = fallback;
            }
        }
        const keys = Object.keys(data);
        const columns = keys.map(k => `"${k}"`).join(', ');
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        const values = Object.values(data);

        const query = `INSERT INTO "Company" (${columns}, "createdAt", "updatedAt") VALUES (${placeholders}, NOW(), NOW()) RETURNING *`;

        await client.query('BEGIN');
        const result = await client.query(query, values);
        const newCompany = result.rows[0];
        await cloneAllCoreReferencesToCompany(client, newCompany.id);
        await client.query('COMMIT');
        res.json(newCompany);
    } catch (error: any) {
        try {
            await client.query('ROLLBACK');
        } catch {
            /* ignore */
        }
        console.error('Error creating company:', error);
        res.status(500).json({ error: 'Failed to create company', details: error.message });
    } finally {
        client.release();
    }
});

app.put('/api/companies/:id', async (req, res) => {
    try {
        const ctx = await loadTenantAuthContext(req, res);
        if (!ctx) return;
        await ensureCompanyZipcodeColumn();
        const { id } = req.params;
        if (!(await assertCompanyInTenantScope(pool, ctx, id))) {
            return res.status(403).json({ error: 'Not allowed to update this company.' });
        }
        const data = req.body;
        
        // Use raw SQL to bypass Prisma validation errors for new fields
        const keys = Object.keys(data).filter(k => k !== 'id' && k !== 'organizationId');
        const setClause = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ');
        const values = keys.map(k => data[k]);
        
        const query = `UPDATE "Company" SET ${setClause}, "updatedAt" = NOW() WHERE id = $${keys.length + 1} RETURNING *`;
        const result = await pool.query(query, [...values, id]);
        
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Company not found' });
        }
        
        res.json(result.rows[0]);
    } catch (error: any) {
        console.error('Error updating company:', error);
        res.status(500).json({ error: 'Failed to update company', details: error.message });
    }
});

app.delete('/api/companies/:id', async (req, res) => {
    try {
        const ctx = await loadTenantAuthContext(req, res);
        if (!ctx) return;
        const { id } = req.params;
        if (!(await assertCompanyInTenantScope(pool, ctx, id))) {
            return res.status(403).json({ error: 'Not allowed to delete this company.' });
        }
        await prisma.company.delete({ where: { id } });
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting company:', error);
        res.status(500).json({ error: 'Failed to delete company' });
    }
});

// --- Categories API (tenant: read + scoped items; Category CRUD only via /api/admin) ---

app.get('/api/categories', async (req, res) => {
    try {
        const ctx = await loadTenantAuthContext(req, res);
        if (!ctx) return;
        await ensureBaseCurrencyCategory();
        const companyCtx = await resolveCompanyContextForRequest(pool, ctx, req.query.companyId as string | undefined);
        const categories = await prisma.category.findMany({
            orderBy: { name: 'asc' }
        });
        const counts = await Promise.all(
            categories.map((c) =>
                countMergedCategoryItems(pool, {
                    categoryId: c.id,
                    organizationId: ctx.organizationId,
                    companyIdContext: companyCtx,
                    activeOnly: false
                })
            )
        );
        res.json(
            categories.map((c, i) => ({
                ...c,
                _count: { items: counts[i] ?? 0 }
            }))
        );
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
});

app.get('/api/categories/:id', async (req, res) => {
    try {
        const ctx = await loadTenantAuthContext(req, res);
        if (!ctx) return;
        const category = await prisma.category.findUnique({
            where: { id: req.params.id }
        });
        if (!category) return res.status(404).json({ error: 'Category not found' });
        const companyCtx = await resolveCompanyContextForRequest(pool, ctx, req.query.companyId as string | undefined);
        const items = await fetchMergedCategoryItems(pool, {
            categoryId: category.id,
            organizationId: ctx.organizationId,
            companyIdContext: companyCtx,
            activeOnly: false
        });
        res.json({
            ...category,
            items: items.map((row) => ({
                ...row,
                isSystem: isSystemCategoryItem(row)
            }))
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
});

app.post('/api/categories', async (_req, res) => {
    res.status(403).json({ error: 'Category definitions are managed in SaaS Admin.' });
});

app.put('/api/categories/:id', async (_req, res) => {
    res.status(403).json({ error: 'Category definitions are managed in SaaS Admin.' });
});

app.delete('/api/categories/:id', async (_req, res) => {
    res.status(403).json({ error: 'Category definitions are managed in SaaS Admin.' });
});

app.post('/api/category-items', async (req, res) => {
    try {
        const ctx = await loadTenantAuthContext(req, res);
        if (!ctx) return;
        const body = (req.body || {}) as Record<string, unknown>;
        const categoryId = String(body.categoryId || '').trim();
        if (!categoryId) return res.status(400).json({ error: 'categoryId is required' });
        const category = await prisma.category.findUnique({ where: { id: categoryId } });
        if (!category) return res.status(404).json({ error: 'Category not found' });

        const requestedCompanyId = body.companyId != null && String(body.companyId).trim() !== '' ? String(body.companyId).trim() : null;
        if (requestedCompanyId) {
            const ok = await assertCompanyBelongsToOrg(pool, ctx.organizationId, requestedCompanyId);
            if (!ok) return res.status(400).json({ error: 'companyId is not part of your organization.' });
            const allowed = await resolveCompanyContextForRequest(pool, ctx, requestedCompanyId);
            if (!allowed) return res.status(403).json({ error: 'You cannot attach items to this company.' });
        }

        const codeRaw = body.code != null ? String(body.code).trim() : '';
        const code = codeRaw || null;
        if (!code) return res.status(400).json({ error: 'Item code is required and must be globally unique.' });

        const item = await prisma.categoryItem.create({
            data: {
                categoryId,
                code,
                name: String(body.name || '').trim() || 'Unnamed',
                description: body.description != null ? String(body.description) : null,
                status: String(body.status || 'Active'),
                organizationId: ctx.organizationId,
                companyId: requestedCompanyId
            }
        });
        res.json({ ...item, isSystem: false });
    } catch (error: any) {
        if (error?.code === 'P2002') {
            return res.status(400).json({ error: 'Item code must be globally unique.' });
        }
        res.status(500).json({ error: 'Failed', details: error?.message || String(error) });
    }
});

app.put('/api/category-items/:id', async (req, res) => {
    try {
        const ctx = await loadTenantAuthContext(req, res);
        if (!ctx) return;
        const id = String(req.params.id || '').trim();
        const existing = await prisma.categoryItem.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Not found' });
        if (isSystemCategoryItem(existing)) return res.status(403).json({ error: 'System items cannot be modified from tenant.' });
        if (String(existing.organizationId || '') !== ctx.organizationId) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const body = (req.body || {}) as Record<string, unknown>;
        let companyId: string | null = existing.companyId ?? null;
        if (body.companyId !== undefined) {
            const raw = body.companyId != null && String(body.companyId).trim() !== '' ? String(body.companyId).trim() : null;
            if (raw) {
                const ok = await assertCompanyBelongsToOrg(pool, ctx.organizationId, raw);
                if (!ok) return res.status(400).json({ error: 'companyId is not part of your organization.' });
                const allowed = await resolveCompanyContextForRequest(pool, ctx, raw);
                if (!allowed) return res.status(403).json({ error: 'You cannot attach items to this company.' });
                companyId = raw;
            } else {
                companyId = null;
            }
        }

        const codeRaw = body.code !== undefined ? String(body.code || '').trim() : String(existing.code || '').trim();
        const code = codeRaw || null;
        if (!code) return res.status(400).json({ error: 'Item code is required.' });

        const item = await prisma.categoryItem.update({
            where: { id },
            data: {
                code,
                name: body.name !== undefined ? String(body.name || '').trim() || 'Unnamed' : existing.name,
                description: body.description !== undefined ? (body.description != null ? String(body.description) : null) : existing.description,
                status: body.status !== undefined ? String(body.status || 'Active') : existing.status,
                companyId
            }
        });
        res.json({ ...item, isSystem: false });
    } catch (error: any) {
        if (error?.code === 'P2002') {
            return res.status(400).json({ error: 'Item code must be globally unique.' });
        }
        res.status(500).json({ error: 'Failed', details: error?.message || String(error) });
    }
});

app.delete('/api/category-items/:id', async (req, res) => {
    try {
        const ctx = await loadTenantAuthContext(req, res);
        if (!ctx) return;
        const id = String(req.params.id || '').trim();
        const existing = await prisma.categoryItem.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Not found' });
        if (isSystemCategoryItem(existing)) return res.status(403).json({ error: 'System items cannot be deleted from tenant.' });
        if (String(existing.organizationId || '') !== ctx.organizationId) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        await prisma.categoryItem.delete({ where: { id } });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
});

app.put('/api/category-items/reorder', async (req, res) => {
    try {
        const ctx = await loadTenantAuthContext(req, res);
        if (!ctx) return;
        const { items } = req.body || {};
        if (!Array.isArray(items)) return res.status(400).json({ error: 'items array required' });
        for (const row of items) {
            const id = String(row?.id || '').trim();
            if (!id) continue;
            const existing = await prisma.categoryItem.findUnique({ where: { id } });
            if (!existing) continue;
            if (isSystemCategoryItem(existing)) continue;
            if (String(existing.organizationId || '') !== ctx.organizationId) {
                return res.status(403).json({ error: 'Forbidden' });
            }
            await prisma.categoryItem.update({
                where: { id },
                data: { sortOrder: Number(row.sortOrder) || 0 }
            });
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
});

// --- References API (tenant: company-scoped rows only; core templates via /api/admin/references) ---

app.get('/api/references', async (req, res) => {
    try {
        const ctx = await loadTenantAuthContext(req, res);
        if (!ctx) return;
        const raw = String(req.query.companyId || '').trim();
        const companyCtx = await resolveCompanyContextForRequest(pool, ctx, raw || ctx.primaryCompanyId);
        if (!companyCtx) {
            return res.status(403).json({ error: 'You cannot access references for this company.' });
        }

        const references = await prisma.reference.findMany({
            where: { companyId: companyCtx },
            orderBy: { module: 'asc' }
        });
        res.json(references);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch references' });
    }
});

app.post('/api/references', async (req, res) => {
    const ctx = await loadTenantAuthContext(req, res);
    if (!ctx) return;
    return res.status(403).json({
        error: 'References cannot be created from the tenant app. Use SaaS Admin to add new templates.'
    });
});

app.put('/api/references/:id', async (req, res) => {
    try {
        const ctx = await loadTenantAuthContext(req, res);
        if (!ctx) return;
        const id = String(req.params.id || '').trim();
        const existing = await prisma.reference.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Not found' });
        if (existing.companyId == null) {
            return res.status(403).json({ error: 'Core templates cannot be updated from tenant.' });
        }
        const ok = await assertCompanyBelongsToOrg(pool, ctx.organizationId, existing.companyId);
        if (!ok) return res.status(403).json({ error: 'Forbidden' });
        const allowed = await resolveCompanyContextForRequest(pool, ctx, existing.companyId);
        if (!allowed) return res.status(403).json({ error: 'Forbidden' });

        const body = (req.body || {}) as Record<string, unknown>;
        const reference = await prisma.reference.update({
            where: { id },
            data: {
                reference: body.reference !== undefined ? Number(body.reference) || 0 : undefined,
                prefix: body.prefix !== undefined ? (body.prefix != null ? String(body.prefix) : null) : undefined,
                sufix: body.sufix !== undefined ? (body.sufix != null ? String(body.sufix) : null) : undefined,
                digits: body.digits !== undefined ? Number(body.digits) || 4 : undefined,
                clone: body.clone !== undefined ? Number(body.clone) || 0 : undefined
            }
        });
        res.json(reference);
    } catch (error: any) {
        if (error?.code === 'P2002') {
            return res.status(400).json({ error: 'Duplicate module/code for this company.' });
        }
        res.status(500).json({ error: 'Failed', details: error?.message || String(error) });
    }
});

app.delete('/api/references/:id', async (req, res) => {
    const ctx = await loadTenantAuthContext(req, res);
    if (!ctx) return;
    return res.status(403).json({
        error: 'References cannot be deleted from the tenant app. They are required for the system.'
    });
});

// --- Tasks API ---

// --- Auth API ---

app.post('/api/auth/login', async (req, res) => {
    try {
        await ensureUserColumns();
        const email = String(req.body?.email || '').trim().toLowerCase();
        const password = String(req.body?.password || '');

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required.' });
        }

        const result = await pool.query(
            'SELECT id, email, password FROM "User" WHERE LOWER(email) = $1 LIMIT 1',
            [email]
        );
        const dbUser = result.rows[0];

        if (!dbUser || !verifyPassword(password, dbUser.password)) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        // Migración transparente: si el password estaba en texto plano heredado, se re-hashea.
        if (!isHashed(dbUser.password)) {
            await pool.query('UPDATE "User" SET password = $1 WHERE id = $2', [hashPassword(password), dbUser.id]);
        }

        const token = createSessionToken();
        await pool.query('UPDATE "User" SET "sessionToken" = $1, "sessionTokenExpiresAt" = $2, "updatedAt" = NOW() WHERE id = $3', [token, sessionExpiry(), dbUser.id]);

        const user = await getNormalizedUserById(dbUser.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        res.json({ token, user });
    } catch (error: any) {
        console.error('Error in POST /api/auth/login:', error);
        res.status(500).json({ error: 'Failed to login', details: error.message });
    }
});

app.post('/api/auth/register', async (req, res) => {
    try {
        await ensureUserColumns();
        const firstName = String(req.body?.firstName || '').trim();
        const lastName = String(req.body?.lastName || '').trim();
        const email = String(req.body?.email || '').trim().toLowerCase();
        const password = String(req.body?.password || '');

        if (!firstName || !lastName || !email || !password) {
            return res.status(400).json({ error: 'firstName, lastName, email and password are required.' });
        }
        if (!isValidEmail(email)) {
            return res.status(400).json({ error: 'Email is invalid.' });
        }

        const existing = await pool.query('SELECT id FROM "User" WHERE LOWER(email) = $1 LIMIT 1', [email]);
        if (existing.rows[0]) {
            return res.status(409).json({ error: 'A user with this email already exists.' });
        }

        const requestedCompanyId = String(req.body?.companyId || '').trim();
        let companyId = requestedCompanyId;

        if (!companyId) {
            const firstCompany = await prisma.company.findFirst({ orderBy: { createdAt: 'asc' } });
            if (!firstCompany) {
                return res.status(400).json({ error: 'No company available. Create a company first.' });
            }
            companyId = firstCompany.id;
        }

        const created = await prisma.user.create({
            data: {
                firstName,
                lastName,
                name: [firstName, lastName].filter(Boolean).join(' '),
                email,
                password: hashPassword(password),
                role: 'Administrator',
                companyId
            }
        });

        const token = createSessionToken();
        await pool.query('UPDATE "User" SET "sessionToken" = $1, "sessionTokenExpiresAt" = $2, "updatedAt" = NOW() WHERE id = $3', [token, sessionExpiry(), created.id]);

        const user = await getNormalizedUserById(created.id);
        res.status(201).json({ token, user });
    } catch (error: any) {
        console.error('Error in POST /api/auth/register:', error);
        res.status(500).json({ error: 'Failed to register', details: error.message });
    }
});

app.post('/api/auth/forgot-password', async (req, res) => {
    try {
        await ensureUserColumns();

        const email = String(req.body?.email || '').trim().toLowerCase();
        if (!email || !isValidEmail(email)) {
            return res.status(400).json({ error: 'Valid email is required.' });
        }

        const userResult = await pool.query(
            'SELECT id, email, "firstName", "lastName" FROM "User" WHERE LOWER(email) = $1 LIMIT 1',
            [email]
        );
        const user = userResult.rows[0];

        if (!user) {
            return res.json({ success: true, message: 'If the email exists, a reset message was sent.' });
        }

        const token = createResetToken();
        const expiresAt = new Date(Date.now() + 1000 * 60 * 60);

        await pool.query(
            'UPDATE "User" SET "passwordResetToken" = $1, "passwordResetExpiresAt" = $2, "updatedAt" = NOW() WHERE id = $3',
            [token, expiresAt.toISOString(), user.id]
        );

        const { provider, config: smtpConfig } = await loadCanonicalOutboundMailConfig();

        const resetUrl = `${req.protocol}://${req.get('host')}/?resetToken=${encodeURIComponent(token)}`;
        const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;

        const subject = 'Recupero de contrasena - Sinapsis';
        const textBody = `Hola ${fullName},\n\nRecibimos una solicitud para restablecer tu contrasena.\n\nUsa este enlace: ${resetUrl}\n\nSi el enlace no funciona, copia este token: ${token}\n\nEste enlace expira en 1 hora.`;
        const htmlBody = `<p>Hola ${fullName},</p><p>Recibimos una solicitud para restablecer tu contrasena.</p><p><a href="${resetUrl}">Restablecer contrasena</a></p><p>Si el enlace no funciona, usa este token:</p><p><strong>${token}</strong></p><p>Este enlace expira en 1 hora.</p>`;

        await sendEmailWithConfig(provider, smtpConfig, user.email, subject, textBody, htmlBody);

        res.json({ success: true, message: 'Reset email sent.' });
    } catch (error: any) {
        console.error('Error in POST /api/auth/forgot-password:', error);
        res.status(500).json({ error: 'Failed to send reset email', details: error.message });
    }
});

app.post('/api/auth/reset-password', async (req, res) => {
    try {
        await ensureUserColumns();
        const token = String(req.body?.token || '').trim();
        const newPassword = String(req.body?.newPassword || '');

        if (!token || !newPassword) {
            return res.status(400).json({ error: 'token and newPassword are required.' });
        }

        const result = await pool.query(
            'SELECT id, "passwordResetExpiresAt" FROM "User" WHERE "passwordResetToken" = $1 LIMIT 1',
            [token]
        );
        const dbUser = result.rows[0];

        if (!dbUser) {
            return res.status(400).json({ error: 'Invalid reset token.' });
        }

        const expiresAt = dbUser.passwordResetExpiresAt ? new Date(dbUser.passwordResetExpiresAt) : null;
        if (!expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
            return res.status(400).json({ error: 'Reset token expired.' });
        }

        await pool.query(
            'UPDATE "User" SET password = $1, "passwordResetToken" = NULL, "passwordResetExpiresAt" = NULL, "sessionToken" = NULL, "updatedAt" = NOW() WHERE id = $2',
            [hashPassword(newPassword), dbUser.id]
        );

        res.json({ success: true, message: 'Password updated successfully.' });
    } catch (error: any) {
        console.error('Error in POST /api/auth/reset-password:', error);
        res.status(500).json({ error: 'Failed to reset password', details: error.message });
    }
});

app.get('/api/auth/session', async (req, res) => {
    try {
        await ensureUserColumns();
        if (!String(req.headers.authorization || '').trim()) {
            return res.json({ user: null });
        }
        const token = getTokenFromRequest(req);
        if (!token) {
            return res.status(401).json({ error: 'Missing session token.' });
        }

        const result = await pool.query('SELECT id, "sessionTokenExpiresAt" FROM "User" WHERE "sessionToken" = $1 LIMIT 1', [token]);
        const row = result.rows[0];
        if (!row?.id) {
            return res.status(401).json({ error: 'Invalid session token.' });
        }
        // Expiración: si venció, se invalida el token y se pide reingresar.
        if (row.sessionTokenExpiresAt && new Date(row.sessionTokenExpiresAt).getTime() < Date.now()) {
            await pool.query('UPDATE "User" SET "sessionToken" = NULL, "sessionTokenExpiresAt" = NULL WHERE id = $1', [row.id]);
            return res.status(401).json({ error: 'Session expired.' });
        }

        const user = await getNormalizedUserById(row.id);
        if (!user) {
            return res.status(401).json({ error: 'Invalid session token.' });
        }

        // Rotación deslizante: cada validación extiende la ventana de validez.
        await pool.query('UPDATE "User" SET "sessionTokenExpiresAt" = $1 WHERE id = $2', [sessionExpiry(), row.id]);

        res.json({ user });
    } catch (error: any) {
        console.error('Error in GET /api/auth/session:', error);
        res.status(500).json({ error: 'Failed to restore session', details: error.message });
    }
});

app.post('/api/auth/logout', async (req, res) => {
    try {
        await ensureUserColumns();
        const token = getTokenFromRequest(req);
        if (token) {
            await pool.query('UPDATE "User" SET "sessionToken" = NULL, "updatedAt" = NOW() WHERE "sessionToken" = $1', [token]);
        }
        res.json({ success: true });
    } catch (error: any) {
        console.error('Error in POST /api/auth/logout:', error);
        res.status(500).json({ error: 'Failed to logout', details: error.message });
    }
});

app.get('/api/users', async (req, res) => {
    try {
        const ctx = await loadTenantAuthContext(req, res);
        if (!ctx) return;
        await ensureUserColumns();
        const { companyId } = req.query;
        const companyIdStr = companyId ? String(companyId) : '';
        if (companyIdStr && !(await assertCompanyInTenantScope(pool, ctx, companyIdStr))) {
            return res.status(403).json({ error: 'Not allowed to list users for this company.' });
        }
        const users = await prisma.user.findMany({
            where: {
                company: { organizationId: ctx.organizationId },
                ...(companyIdStr ? { companyId: companyIdStr } : {})
            },
            include: { company: true, roleRef: true },
            orderBy: { createdAt: 'desc' }
        });

        const userIds = users.map((u: any) => u.id);
        const extrasMap = new Map<string, { language: string | null; accessCompanyIds: string[] }>();

        if (userIds.length > 0) {
            const extraResult = await pool.query(
                'SELECT id, "language", "accessCompanyIds" FROM "User" WHERE id = ANY($1)',
                [userIds]
            );
            for (const row of extraResult.rows) {
                extrasMap.set(row.id, {
                    language: row.language || null,
                    accessCompanyIds: row.accessCompanyIds
                        ? String(row.accessCompanyIds).split(',').map((x: string) => x.trim()).filter(Boolean)
                        : []
                });
            }
        }

        const normalizedUsers = users.map((u: any) => {
            const extra = extrasMap.get(u.id);
            return {
                ...u,
                language: extra?.language || null,
                accessCompanyIds: extra?.accessCompanyIds || []
            };
        });

        res.json(normalizedUsers);
    } catch (error) {
        console.error('Error in GET /api/users:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

app.post('/api/users', async (req, res) => {
    try {
        const ctx = await loadTenantAuthContext(req, res);
        if (!ctx) return;
        await ensureUserColumns();
        const { email, name, firstName, lastName, password, role, companyId, roleId, language, accessCompanyIds } = req.body;
        const accessCompanyIdsValue = Array.isArray(accessCompanyIds) ? accessCompanyIds.join(',') : '';

        if (!companyId || !(await assertCompanyBelongsToOrg(pool, ctx.organizationId, String(companyId)))) {
            return res.status(400).json({ error: 'companyId must belong to your organization.' });
        }
        if (Array.isArray(accessCompanyIds)) {
            for (const cid of accessCompanyIds) {
                if (!cid || !(await assertCompanyBelongsToOrg(pool, ctx.organizationId, String(cid)))) {
                    return res.status(400).json({ error: 'accessCompanyIds must reference companies in your organization.' });
                }
            }
        }

        const user = await prisma.user.create({
            data: {
                email,
                name,
                firstName,
                lastName,
                password: password ? hashPassword(String(password)) : password,
                role: role || 'Administrator',
                companyId,
                roleId: roleId || null
            },
            include: { company: true, roleRef: true }
        });

        await pool.query(
            'UPDATE "User" SET "language" = $1, "accessCompanyIds" = $2 WHERE id = $3',
            [language || null, accessCompanyIdsValue || null, user.id]
        );

        res.json({
            ...user,
            language: language || null,
            accessCompanyIds: Array.isArray(accessCompanyIds) ? accessCompanyIds : []
        });
    } catch (error) {
        console.error('Error in POST /api/users:', error);
        res.status(500).json({ error: String(error) });
    }
});

app.put('/api/users/:id', async (req, res) => {
    try {
        const ctx = await loadTenantAuthContext(req, res);
        if (!ctx) return;
        await ensureUserColumns();
        const { id } = req.params;
        const { email, name, firstName, lastName, password, role, companyId, roleId, language, accessCompanyIds } = req.body;
        const accessCompanyIdsValue = Array.isArray(accessCompanyIds) ? accessCompanyIds.join(',') : '';

        const existing = await prisma.user.findFirst({
            where: { id },
            include: { company: true }
        });
        if (!existing?.company || existing.company.organizationId !== ctx.organizationId) {
            return res.status(404).json({ error: 'User not found.' });
        }
        if (companyId && !(await assertCompanyBelongsToOrg(pool, ctx.organizationId, String(companyId)))) {
            return res.status(400).json({ error: 'companyId must belong to your organization.' });
        }
        if (Array.isArray(accessCompanyIds)) {
            for (const cid of accessCompanyIds) {
                if (!cid || !(await assertCompanyBelongsToOrg(pool, ctx.organizationId, String(cid)))) {
                    return res.status(400).json({ error: 'accessCompanyIds must reference companies in your organization.' });
                }
            }
        }

        const updateData: any = {
            email,
            name,
            firstName,
            lastName,
            role,
            companyId,
            roleId: roleId || null
        };
        if (password) updateData.password = hashPassword(String(password));

        const user = await prisma.user.update({
            where: { id },
            data: updateData,
            include: { company: true, roleRef: true }
        });

        await pool.query(
            'UPDATE "User" SET "language" = $1, "accessCompanyIds" = $2 WHERE id = $3',
            [language || null, accessCompanyIdsValue || null, id]
        );

        res.json({
            ...user,
            language: language || null,
            accessCompanyIds: Array.isArray(accessCompanyIds) ? accessCompanyIds : []
        });
    } catch (error) {
        console.error('Error in PUT /api/users/:id:', error);
        res.status(500).json({ error: String(error) });
    }
});


app.post('/api/users/:id/change-password', async (req, res) => {
    try {
        await ensureUserColumns();
        const { id } = req.params;
        const token = getTokenFromRequest(req);
        const currentPassword = String(req.body?.currentPassword || '');
        const newPassword = String(req.body?.newPassword || '');
        const confirmPassword = String(req.body?.confirmPassword || '');

        if (!token) {
            return res.status(401).json({ error: 'Missing session token.' });
        }

        if (!currentPassword || !newPassword || !confirmPassword) {
            return res.status(400).json({ error: 'currentPassword, newPassword and confirmPassword are required.' });
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).json({ error: 'New password and confirmation do not match.' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'New password must have at least 6 characters.' });
        }

        const sessionResult = await pool.query(
            'SELECT id FROM "User" WHERE "sessionToken" = $1 LIMIT 1',
            [token]
        );
        const sessionUser = sessionResult.rows[0];

        if (!sessionUser?.id || String(sessionUser.id) !== String(id)) {
            return res.status(403).json({ error: 'You are not allowed to change this password.' });
        }

        const result = await pool.query(
            'SELECT password FROM "User" WHERE id = $1 LIMIT 1',
            [id]
        );
        const dbUser = result.rows[0];

        if (!dbUser) {
            return res.status(404).json({ error: 'User not found.' });
        }

        if (!verifyPassword(currentPassword, dbUser.password)) {
            return res.status(400).json({ error: 'Current password is incorrect.' });
        }

        await pool.query(
            'UPDATE "User" SET password = $1, "updatedAt" = NOW() WHERE id = $2',
            [hashPassword(newPassword), id]
        );

        res.json({ success: true, message: 'Password updated successfully.' });
    } catch (error: any) {
        console.error('Error in POST /api/users/:id/change-password:', error);
        res.status(500).json({ error: 'Failed to change password', details: error.message });
    }
});
app.post('/api/users/:id/avatar', upload.single('avatar'), async (req, res) => {
    try {
        const ctx = await loadTenantAuthContext(req, res);
        if (!ctx) return;
        const { id } = req.params;
        const file = req.file;
        if (!file) return res.status(400).json({ error: 'No file uploaded' });

        const target = await prisma.user.findFirst({
            where: { id },
            include: { company: true }
        });
        if (!target?.company || target.company.organizationId !== ctx.organizationId) {
            return res.status(403).json({ error: 'Not allowed to update this user.' });
        }

        const orgResult = await pool.query('SELECT * FROM "Organization" WHERE id = $1 LIMIT 1', [ctx.organizationId]);
        const org = orgResult.rows[0];
        const provider = org?.storageProvider || 'Local';

        let avatarUrl = '';

        if (provider === 'Local') {
            const storagePath = STORAGE_ROOT;
            const orgFolderName = org?.name && org?.id
                ? `${org.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${String(org.id).split('-')[0]}`
                : 'organization';
            const avatarFilename = `avatar_${id}_${Date.now()}${path.extname(file.originalname)}`;
            const finalPath = path.join(storagePath, orgFolderName, avatarFilename);

            if (!fs.existsSync(path.dirname(finalPath))) {
                fs.mkdirSync(path.dirname(finalPath), { recursive: true });
            }

            fs.writeFileSync(finalPath, file.buffer);
            avatarUrl = `/storage/${orgFolderName}/${avatarFilename}`;
        } else {
            return res.status(501).json({ error: `Storage provider ${provider} not fully implemented yet in the API. Please use Local for now.` });
        }

        const updatedUser = await prisma.user.update({
            where: { id },
            data: { avatar: avatarUrl },
            include: { company: true, roleRef: true }
        });

        res.json({ success: true, avatar: avatarUrl, user: updatedUser });
    } catch (error: any) {
        console.error('Error uploading user avatar:', error);
        res.status(500).json({ error: 'Failed to upload avatar', details: error.message });
    }
});

app.delete('/api/users/:id', async (req, res) => {
    try {
        const ctx = await loadTenantAuthContext(req, res);
        if (!ctx) return;
        const { id } = req.params;
        const target = await prisma.user.findFirst({
            where: { id },
            include: { company: true }
        });
        if (!target?.company || target.company.organizationId !== ctx.organizationId) {
            return res.status(404).json({ error: 'User not found.' });
        }
        await prisma.user.delete({ where: { id } });
        res.json({ success: true });
    } catch (error) {
        console.error('Error in DELETE /api/users/:id:', error);
        res.status(500).json({ error: String(error) });
    }
});

app.patch('/api/companies/:id/status', async (req, res) => {
    try {
        const ctx = await loadTenantAuthContext(req, res);
        if (!ctx) return;
        const { id } = req.params;
        if (!(await assertCompanyInTenantScope(pool, ctx, id))) {
            return res.status(403).json({ error: 'Not allowed to update this company.' });
        }
        const { status } = req.body;
        const company = await prisma.company.update({
            where: { id },
            data: { status }
        });
        res.json(company);
    } catch (error) {
        console.error('Error updating company status:', error);
        res.status(500).json({ error: 'Failed to update company status' });
    }
});

// --- Public API Docs (Swagger/OpenAPI) ---

app.get('/api/openapi.json', (req, res) => {
    const serverUrl = `${req.protocol}://${req.get('host')}`;
    res.json({
        openapi: '3.0.3',
        info: {
            title: 'Sinapsis Public API',
            version: '1.0.0',
            description: 'Public endpoints to manage clients, reusable notes and files.'
        },
        tags: [
            { name: 'Clients', description: 'Public clients endpoints' },
            { name: 'Notes', description: 'Public notes endpoints' },
            { name: 'Files', description: 'Public files endpoints' },
            { name: 'CRM', description: 'CRM opportunities endpoints' }
        ],
        servers: [{ url: serverUrl }],
        components: {
            securitySchemes: {
                BearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'Token'
                }
            },
            schemas: {
                EntityNote: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        sourceModule: { type: 'string' },
                        sourceId: { type: 'string' },
                        note: { type: 'string' },
                        status: { type: 'string' },
                        createdById: { type: 'string' },
                        updatedById: { type: 'string' },
                        createdAt: { type: 'string', format: 'date-time' },
                        updatedAt: { type: 'string', format: 'date-time' }
                    }
                },
                EntityFile: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        sourceModule: { type: 'string' },
                        sourceId: { type: 'string' },
                        name: { type: 'string' },
                        originalName: { type: 'string' },
                        fileUrl: { type: 'string' },
                        mimeType: { type: 'string' },
                        fileExt: { type: 'string' },
                        sizeBytes: { type: 'integer' },
                        status: { type: 'string' },
                        createdAt: { type: 'string', format: 'date-time' },
                        updatedAt: { type: 'string', format: 'date-time' }
                    }
                },
                PublicClient: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        code: { type: 'string' },
                        name: { type: 'string' },
                        email: { type: 'string', nullable: true },
                        phone: { type: 'string', nullable: true },
                        taxId: { type: 'string', nullable: true },
                        type: { type: 'string' },
                        status: { type: 'string' },
                        address: { type: 'string', nullable: true },
                        city: { type: 'string', nullable: true },
                        state: { type: 'string', nullable: true },
                        zipcode: { type: 'string', nullable: true },
                        country: { type: 'string', nullable: true },
                        notes: { type: 'string', nullable: true },
                        companyId: { type: 'string' },
                        companyIds: { type: 'array', items: { type: 'string' } },
                        companyNames: { type: 'array', items: { type: 'string' } },
                        createdAt: { type: 'string', format: 'date-time' },
                        updatedAt: { type: 'string', format: 'date-time' }
                    }
                }
            }
        },
        security: [{ BearerAuth: [] }],
        paths: {
            '/api/crm/meta': {
                get: {
                    tags: ['CRM'],
                    summary: 'Get CRM metadata',
                    parameters: [
                        { name: 'companyId', in: 'query', required: false, schema: { type: 'string' } }
                    ],
                    responses: { '200': { description: 'CRM metadata' } }
                }
            },
            '/api/crm/overview': {
                get: {
                    tags: ['CRM'],
                    summary: 'Get CRM overview',
                    parameters: [
                        { name: 'companyId', in: 'query', required: false, schema: { type: 'string' } }
                    ],
                    responses: { '200': { description: 'CRM overview' } }
                }
            },
            '/api/crm/opportunities': {
                get: {
                    tags: ['CRM'],
                    summary: 'List opportunities',
                    parameters: [
                        { name: 'companyId', in: 'query', required: false, schema: { type: 'string' } },
                        { name: 'stage', in: 'query', required: false, schema: { type: 'string' } },
                        { name: 'status', in: 'query', required: false, schema: { type: 'string' } },
                        { name: 'ownerId', in: 'query', required: false, schema: { type: 'string' } },
                        { name: 'clientId', in: 'query', required: false, schema: { type: 'string' } },
                        { name: 'search', in: 'query', required: false, schema: { type: 'string' } }
                    ],
                    responses: { '200': { description: 'Opportunities list' } }
                },
                post: {
                    tags: ['CRM'],
                    summary: 'Create opportunity',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['title', 'clientId', 'ownerId', 'createdById'],
                                    properties: {
                                        title: { type: 'string' },
                                        clientId: { type: 'string' },
                                        ownerId: { type: 'string' },
                                        stage: { type: 'string' },
                                        status: { type: 'string' },
                                        amount: { type: 'number' },
                                        probability: { type: 'integer' },
                                        expectedCloseDate: { type: 'string', format: 'date-time', nullable: true },
                                        source: { type: 'string', nullable: true },
                                        notes: { type: 'string', nullable: true },
                                        companyId: { type: 'string' },
                                        createdById: { type: 'string' },
                                        updatedById: { type: 'string' }
                                    }
                                }
                            }
                        }
                    },
                    responses: { '201': { description: 'Opportunity created' } }
                }
            },
            '/api/crm/opportunities/{id}': {
                get: {
                    tags: ['CRM'],
                    summary: 'Get opportunity by id',
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                    responses: { '200': { description: 'Opportunity detail' } }
                },
                put: {
                    tags: ['CRM'],
                    summary: 'Update opportunity',
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['updatedById'],
                                    properties: {
                                        title: { type: 'string' },
                                        clientId: { type: 'string' },
                                        ownerId: { type: 'string' },
                                        stage: { type: 'string' },
                                        status: { type: 'string' },
                                        amount: { type: 'number' },
                                        probability: { type: 'integer' },
                                        expectedCloseDate: { type: 'string', format: 'date-time', nullable: true },
                                        source: { type: 'string', nullable: true },
                                        notes: { type: 'string', nullable: true },
                                        companyId: { type: 'string' },
                                        updatedById: { type: 'string' }
                                    }
                                }
                            }
                        }
                    },
                    responses: { '200': { description: 'Opportunity updated' } }
                },
                delete: {
                    tags: ['CRM'],
                    summary: 'Archive opportunity',
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['updatedById'],
                                    properties: {
                                        updatedById: { type: 'string' }
                                    }
                                }
                            }
                        }
                    },
                    responses: { '200': { description: 'Opportunity archived' } }
                }
            },
            '/api/crm/opportunities/{id}/move': {
                patch: {
                    tags: ['CRM'],
                    summary: 'Move CRM opportunity by stage/status',
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['updatedById'],
                                    properties: {
                                        stage: { type: 'string' },
                                        status: { type: 'string' },
                                        closedAt: { type: 'string', format: 'date-time', nullable: true },
                                        updatedById: { type: 'string' }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        '200': { description: 'Opportunity moved' },
                        '400': { description: 'Invalid request' },
                        '404': { description: 'Opportunity not found' }
                    }
                }
            },
            '/api/crm/opportunities/{id}/stage': {
                patch: {
                    tags: ['CRM'],
                    summary: 'Update opportunity stage',
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['stage', 'updatedById'],
                                    properties: {
                                        stage: { type: 'string' },
                                        updatedById: { type: 'string' }
                                    }
                                }
                            }
                        }
                    },
                    responses: { '200': { description: 'Opportunity stage updated' } }
                }
            },
            '/api/crm/opportunities/{id}/status': {
                patch: {
                    tags: ['CRM'],
                    summary: 'Update opportunity status',
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['status', 'updatedById'],
                                    properties: {
                                        status: { type: 'string' },
                                        updatedById: { type: 'string' }
                                    }
                                }
                            }
                        }
                    },
                    responses: { '200': { description: 'Opportunity status updated' } }
                }
            },
            '/api/crm/activities': {
                get: {
                    tags: ['CRM'],
                    summary: 'List activities',
                    parameters: [
                        { name: 'companyId', in: 'query', required: false, schema: { type: 'string' } },
                        { name: 'opportunityId', in: 'query', required: false, schema: { type: 'string' } },
                        { name: 'assignedToId', in: 'query', required: false, schema: { type: 'string' } },
                        { name: 'status', in: 'query', required: false, schema: { type: 'string' } },
                        { name: 'search', in: 'query', required: false, schema: { type: 'string' } },
                        { name: 'from', in: 'query', required: false, schema: { type: 'string', format: 'date-time' } },
                        { name: 'to', in: 'query', required: false, schema: { type: 'string', format: 'date-time' } }
                    ],
                    responses: { '200': { description: 'Activities list' } }
                },
                post: {
                    tags: ['CRM'],
                    summary: 'Create activity',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['opportunityId', 'title', 'assignedToId', 'createdById'],
                                    properties: {
                                        opportunityId: { type: 'string' },
                                        title: { type: 'string' },
                                        type: { type: 'string' },
                                        status: { type: 'string' },
                                        dueDate: { type: 'string', format: 'date-time', nullable: true },
                                        details: { type: 'string', nullable: true },
                                        assignedToId: { type: 'string' },
                                        companyId: { type: 'string' },
                                        createdById: { type: 'string' },
                                        updatedById: { type: 'string' }
                                    }
                                }
                            }
                        }
                    },
                    responses: { '201': { description: 'Activity created' } }
                }
            },
            '/api/crm/activities/{id}': {
                get: {
                    tags: ['CRM'],
                    summary: 'Get activity by id',
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                    responses: { '200': { description: 'Activity detail' } }
                },
                put: {
                    tags: ['CRM'],
                    summary: 'Update activity',
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['updatedById'],
                                    properties: {
                                        opportunityId: { type: 'string' },
                                        title: { type: 'string' },
                                        type: { type: 'string' },
                                        status: { type: 'string' },
                                        dueDate: { type: 'string', format: 'date-time', nullable: true },
                                        details: { type: 'string', nullable: true },
                                        assignedToId: { type: 'string' },
                                        companyId: { type: 'string' },
                                        updatedById: { type: 'string' }
                                    }
                                }
                            }
                        }
                    },
                    responses: { '200': { description: 'Activity updated' } }
                },
                delete: {
                    tags: ['CRM'],
                    summary: 'Cancel activity',
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['updatedById'],
                                    properties: {
                                        updatedById: { type: 'string' }
                                    }
                                }
                            }
                        }
                    },
                    responses: { '200': { description: 'Activity cancelled' } }
                }
            },
            '/api/crm/activities/{id}/status': {
                patch: {
                    tags: ['CRM'],
                    summary: 'Update activity status',
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['status', 'updatedById'],
                                    properties: {
                                        status: { type: 'string' },
                                        updatedById: { type: 'string' }
                                    }
                                }
                            }
                        }
                    },
                    responses: { '200': { description: 'Activity status updated' } }
                }
            },
            '/api/public/clients': {
                get: {
                    tags: ['Clients'],
                    summary: 'List clients',
                    parameters: [
                        { name: 'companyId', in: 'query', required: false, schema: { type: 'string' } },
                        { name: 'type', in: 'query', required: false, schema: { type: 'string' } },
                        { name: 'status', in: 'query', required: false, schema: { type: 'string' } },
                        { name: 'search', in: 'query', required: false, schema: { type: 'string' } }
                    ],
                    responses: { '200': { description: 'Clients list' } }
                },
                post: {
                    tags: ['Clients'],
                    summary: 'Create client',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['name', 'companyIds'],
                                    properties: {
                                        name: { type: 'string' },
                                        email: { type: 'string' },
                                        phone: { type: 'string' },
                                        taxId: { type: 'string' },
                                        type: { type: 'string' },
                                        status: { type: 'string' },
                                        address: { type: 'string' },
                                        city: { type: 'string' },
                                        state: { type: 'string' },
                                        zipcode: { type: 'string' },
                                        country: { type: 'string' },
                                        notes: { type: 'string' },
                                        companyId: { type: 'string' },
                                        companyIds: { type: 'array', items: { type: 'string' } }
                                    }
                                }
                            }
                        }
                    },
                    responses: { '201': { description: 'Client created' } }
                }
            },
            '/api/public/clients/{id}': {
                get: {
                    tags: ['Clients'],
                    summary: 'Get client by id',
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                    responses: { '200': { description: 'Client' } }
                },
                put: {
                    tags: ['Clients'],
                    summary: 'Update client',
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        name: { type: 'string' },
                                        email: { type: 'string' },
                                        phone: { type: 'string' },
                                        taxId: { type: 'string' },
                                        type: { type: 'string' },
                                        status: { type: 'string' },
                                        address: { type: 'string' },
                                        city: { type: 'string' },
                                        state: { type: 'string' },
                                        zipcode: { type: 'string' },
                                        country: { type: 'string' },
                                        notes: { type: 'string' },
                                        companyId: { type: 'string' },
                                        companyIds: { type: 'array', items: { type: 'string' } }
                                    }
                                }
                            }
                        }
                    },
                    responses: { '200': { description: 'Client updated' } }
                }
            },
            '/api/public/clients/{id}/status': {
                patch: {
                    tags: ['Clients'],
                    summary: 'Update client status',
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['status'],
                                    properties: {
                                        status: { type: 'string' }
                                    }
                                }
                            }
                        }
                    },
                    responses: { '200': { description: 'Status updated' } }
                }
            },
            '/api/public/notes': {
                get: {
                    tags: ['Notes'],
                    summary: 'List notes by sourceModule/sourceId',
                    parameters: [
                        { name: 'sourceModule', in: 'query', required: true, schema: { type: 'string' } },
                        { name: 'sourceId', in: 'query', required: true, schema: { type: 'string' } }
                    ],
                    responses: { '200': { description: 'Notes list' } }
                },
                post: {
                    tags: ['Notes'],
                    summary: 'Create note',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['sourceModule', 'sourceId', 'note'],
                                    properties: {
                                        sourceModule: { type: 'string' },
                                        sourceId: { type: 'string' },
                                        note: { type: 'string' }
                                    }
                                }
                            }
                        }
                    },
                    responses: { '201': { description: 'Note created' } }
                }
            },
            '/api/public/notes/{id}': {
                put: {
                    tags: ['Notes'],
                    summary: 'Update note',
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { type: 'object', required: ['note'], properties: { note: { type: 'string' } } } } }
                    },
                    responses: { '200': { description: 'Note updated' } }
                },
                delete: {
                    tags: ['Notes'],
                    summary: 'Delete note (soft delete)',
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                    responses: { '200': { description: 'Note deleted' } }
                }
            },
            '/api/public/files': {
                get: {
                    tags: ['Files'],
                    summary: 'List files by sourceModule/sourceId',
                    parameters: [
                        { name: 'sourceModule', in: 'query', required: true, schema: { type: 'string' } },
                        { name: 'sourceId', in: 'query', required: true, schema: { type: 'string' } }
                    ],
                    responses: { '200': { description: 'Files list' } }
                }
            },
            '/api/public/files/upload': {
                post: {
                    tags: ['Files'],
                    summary: 'Upload file',
                    requestBody: {
                        required: true,
                        content: {
                            'multipart/form-data': {
                                schema: {
                                    type: 'object',
                                    required: ['sourceModule', 'sourceId', 'file'],
                                    properties: {
                                        sourceModule: { type: 'string' },
                                        sourceId: { type: 'string' },
                                        name: { type: 'string' },
                                        file: { type: 'string', format: 'binary' }
                                    }
                                }
                            }
                        }
                    },
                    responses: { '201': { description: 'File uploaded' } }
                }
            },
            '/api/public/files/{id}': {
                put: {
                    tags: ['Files'],
                    summary: 'Rename file',
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } } } }
                    },
                    responses: { '200': { description: 'File updated' } }
                },
                delete: {
                    tags: ['Files'],
                    summary: 'Delete file (soft delete)',
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                    responses: { '200': { description: 'File deleted' } }
                }
            }
        }
    });
});

app.get('/api/docs', (req, res) => {
    const html = `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Sinapsis Public API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: '/api/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true
      });
    </script>
  </body>
</html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
});

// --- Public API (Authenticated) ---

app.get('/api/public/clients', requirePublicApiAuth, async (req, res) => {
    try {
        await ensurePublicClientsSchema();
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
        res.status(500).json({ error: 'Failed to fetch public clients', details: error.message });
    }
});

app.get('/api/public/clients/:id', requirePublicApiAuth, async (req, res) => {
    try {
        await ensurePublicClientsSchema();
        const client = await getPublicClientById(String(req.params.id || '').trim());
        if (!client) return res.status(404).json({ error: 'Client not found' });
        res.json(client);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to fetch public client', details: error.message });
    }
});

app.post('/api/public/clients', requirePublicApiAuth, async (req, res) => {
    try {
        await ensurePublicClientsSchema();
        const userId = String((req as any).publicApiUserId || '').trim();
        const name = String(req.body?.name || '').trim();
        const oneCompany = String(req.body?.companyId || '').trim();
        const manyCompanies = normalizePublicCompanyIds(req.body?.companyIds || []);
        const companyIds = Array.from(new Set([...(oneCompany ? [oneCompany] : []), ...manyCompanies]));
        const primaryCompanyId = oneCompany || companyIds[0] || '';

        if (!name || !primaryCompanyId || companyIds.length === 0 || !userId) {
            return res.status(400).json({ error: 'name and companyIds are required.' });
        }

        const id = crypto.randomUUID();
        const code = await nextPublicClientCodeForCompany(primaryCompanyId);

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
                userId,
                userId
            ]
        );

        for (const cid of companyIds) {
            await pool.query(
                'INSERT INTO "ClientCompany" (id, "clientId", "companyId", "isPrimary", "createdAt") VALUES ($1, $2, $3, $4, NOW()) ON CONFLICT ("clientId", "companyId") DO NOTHING',
                [crypto.randomUUID(), id, cid, cid === primaryCompanyId]
            );
        }

        const client = await getPublicClientById(id);
        res.status(201).json(client);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to create public client', details: error.message });
    }
});

app.put('/api/public/clients/:id', requirePublicApiAuth, async (req, res) => {
    try {
        await ensurePublicClientsSchema();
        const userId = String((req as any).publicApiUserId || '').trim();
        const clientId = String(req.params.id || '').trim();
        const existing = await getPublicClientById(clientId);
        if (!existing) return res.status(404).json({ error: 'Client not found' });

        const name = String(req.body?.name || existing.name || '').trim();
        const oneCompany = String(req.body?.companyId || '').trim();
        const manyCompanies = normalizePublicCompanyIds(req.body?.companyIds || []);
        const existingCompanyIds = Array.isArray(existing.companyIds) && existing.companyIds.length > 0
            ? existing.companyIds
            : (existing.companyId ? [existing.companyId] : []);
        const nextCompanyIds = manyCompanies.length > 0 || oneCompany
            ? Array.from(new Set([...(oneCompany ? [oneCompany] : []), ...manyCompanies]))
            : existingCompanyIds;
        const primaryCompanyId = oneCompany || nextCompanyIds[0] || existing.companyId || '';

        if (!name || !primaryCompanyId || nextCompanyIds.length === 0) {
            return res.status(400).json({ error: 'name and companyIds are required.' });
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
                userId,
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

        const updated = await getPublicClientById(clientId);
        res.json(updated);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to update public client', details: error.message });
    }
});

app.patch('/api/public/clients/:id/status', requirePublicApiAuth, async (req, res) => {
    try {
        await ensurePublicClientsSchema();
        const userId = String((req as any).publicApiUserId || '').trim();
        const clientId = String(req.params.id || '').trim();
        const status = String(req.body?.status || '').trim();
        if (!status) return res.status(400).json({ error: 'status is required.' });

        await pool.query(
            'UPDATE "Client" SET status = $1, "updatedById" = $2, "updatedAt" = NOW() WHERE id = $3',
            [status, userId, clientId]
        );

        const client = await getPublicClientById(clientId);
        if (!client) return res.status(404).json({ error: 'Client not found' });
        res.json(client);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to update public client status', details: error.message });
    }
});

app.get(['/api/public/notes', '/api/public/entity-notes'], requirePublicApiAuth, async (req, res) => {
    try {
        await ensurePublicEntityTables();
        const sourceModule = String(req.query.sourceModule || '').trim().toUpperCase();
        const sourceId = String(req.query.sourceId || '').trim();
        if (!sourceModule || !sourceId) {
            return res.status(400).json({ error: 'sourceModule and sourceId are required.' });
        }

        const notes = await pool.query(
            `SELECT id, "sourceModule", "sourceId", note, status, "createdById", "updatedById", "createdAt", "updatedAt"
             FROM "EntityNote"
             WHERE "sourceModule" = $1 AND "sourceId" = $2 AND status = 'Active'
             ORDER BY "createdAt" DESC`,
            [sourceModule, sourceId]
        );
        res.json(notes.rows);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to load entity notes', details: error.message });
    }
});

app.post(['/api/public/notes', '/api/public/entity-notes'], requirePublicApiAuth, async (req, res) => {
    try {
        await ensurePublicEntityTables();
        const sourceModule = String(req.body?.sourceModule || '').trim().toUpperCase();
        const sourceId = String(req.body?.sourceId || '').trim();
        const note = String(req.body?.note || '').trim();
        const userId = String((req as any).publicApiUserId || '');
        if (!sourceModule || !sourceId || !note) {
            return res.status(400).json({ error: 'sourceModule, sourceId and note are required.' });
        }

        const id = crypto.randomUUID();
        await pool.query(
            `INSERT INTO "EntityNote" (id, "sourceModule", "sourceId", note, status, "createdById", "updatedById", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, 'Active', $5, $6, NOW(), NOW())`,
            [id, sourceModule, sourceId, note, userId, userId]
        );
        const created = await pool.query('SELECT * FROM "EntityNote" WHERE id = $1 LIMIT 1', [id]);
        res.status(201).json(created.rows[0]);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to create entity note', details: error.message });
    }
});

app.put(['/api/public/notes/:id', '/api/public/entity-notes/:id'], requirePublicApiAuth, async (req, res) => {
    try {
        await ensurePublicEntityTables();
        const id = String(req.params.id || '').trim();
        const note = String(req.body?.note || '').trim();
        const userId = String((req as any).publicApiUserId || '');
        if (!id || !note) return res.status(400).json({ error: 'id and note are required.' });

        const existing = await pool.query('SELECT id FROM "EntityNote" WHERE id = $1 AND status = $2 LIMIT 1', [id, 'Active']);
        if (!existing.rows[0]) return res.status(404).json({ error: 'Entity note not found' });

        await pool.query('UPDATE "EntityNote" SET note = $1, "updatedById" = $2, "updatedAt" = NOW() WHERE id = $3', [note, userId, id]);
        const updated = await pool.query('SELECT * FROM "EntityNote" WHERE id = $1 LIMIT 1', [id]);
        res.json(updated.rows[0]);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to update entity note', details: error.message });
    }
});

app.delete(['/api/public/notes/:id', '/api/public/entity-notes/:id'], requirePublicApiAuth, async (req, res) => {
    try {
        await ensurePublicEntityTables();
        const id = String(req.params.id || '').trim();
        const userId = String((req as any).publicApiUserId || '');
        if (!id) return res.status(400).json({ error: 'id is required.' });

        const existing = await pool.query('SELECT id FROM "EntityNote" WHERE id = $1 AND status = $2 LIMIT 1', [id, 'Active']);
        if (!existing.rows[0]) return res.status(404).json({ error: 'Entity note not found' });

        await pool.query('UPDATE "EntityNote" SET status = $1, "updatedById" = $2, "updatedAt" = NOW() WHERE id = $3', ['Inactive', userId, id]);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to delete entity note', details: error.message });
    }
});

app.get(['/api/public/files', '/api/public/entity-files'], requirePublicApiAuth, async (req, res) => {
    try {
        await ensurePublicEntityTables();
        const sourceModule = String(req.query.sourceModule || '').trim().toUpperCase();
        const sourceId = String(req.query.sourceId || '').trim();
        if (!sourceModule || !sourceId) {
            return res.status(400).json({ error: 'sourceModule and sourceId are required.' });
        }

        const files = await pool.query(
            `SELECT id, "sourceModule", "sourceId", name, "originalName", "fileUrl", "mimeType", "fileExt", "sizeBytes", status, "createdAt", "updatedAt"
             FROM "EntityFile"
             WHERE "sourceModule" = $1 AND "sourceId" = $2 AND status = 'Active'
             ORDER BY "createdAt" DESC`,
            [sourceModule, sourceId]
        );
        res.json(files.rows);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to load entity files', details: error.message });
    }
});

app.post(['/api/public/files/upload', '/api/public/entity-files/upload'], requirePublicApiAuth, upload.single('file'), async (req, res) => {
    try {
        await ensurePublicEntityTables();
        const sourceModule = String(req.body?.sourceModule || '').trim().toUpperCase();
        const sourceId = String(req.body?.sourceId || '').trim();
        const customName = String(req.body?.name || '').trim();
        const file = req.file;
        const userId = String((req as any).publicApiUserId || '');

        if (!sourceModule || !sourceId || !file) {
            return res.status(400).json({ error: 'sourceModule, sourceId and file are required.' });
        }

        const orgResult = await pool.query('SELECT * FROM "Organization" LIMIT 1');
        const org = orgResult.rows[0] || { name: 'org', id: '1' };
        const ext = path.extname(file.originalname || '').toLowerCase();
        const baseName = customName || path.basename(file.originalname || 'file', ext) || 'file';
        const safeBaseName = baseName.replace(/[^\w\-\. ]/g, '_').trim() || 'file';
        const filename = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}${ext}`;

        const storagePath = STORAGE_ROOT;
        const orgFolderName = org.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '_' + String(org.id).split('-')[0];
        const relativePath = path.join(orgFolderName, 'files', sourceModule.toLowerCase(), sourceId, filename);
        const finalPath = path.join(storagePath, relativePath);
        const finalDir = path.dirname(finalPath);
        if (!fs.existsSync(finalDir)) fs.mkdirSync(finalDir, { recursive: true });
        fs.writeFileSync(finalPath, file.buffer);

        const id = crypto.randomUUID();
        const fileUrl = `/storage/${relativePath.replace(/\\/g, '/')}`;
        await pool.query(
            `INSERT INTO "EntityFile" (
                id, "sourceModule", "sourceId", name, "originalName", "fileUrl", "filePath", "mimeType", "fileExt", "sizeBytes", status, "createdById", "updatedById", "createdAt", "updatedAt"
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Active', $11, $12, NOW(), NOW()
            )`,
            [id, sourceModule, sourceId, safeBaseName, file.originalname || safeBaseName, fileUrl, finalPath, file.mimetype || null, ext || null, Number(file.size || 0), userId, userId]
        );
        const created = await pool.query('SELECT * FROM "EntityFile" WHERE id = $1 LIMIT 1', [id]);
        res.status(201).json(created.rows[0]);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to upload entity file', details: error.message });
    }
});

app.put(['/api/public/files/:id', '/api/public/entity-files/:id'], requirePublicApiAuth, async (req, res) => {
    try {
        await ensurePublicEntityTables();
        const id = String(req.params.id || '').trim();
        const name = String(req.body?.name || '').trim();
        const userId = String((req as any).publicApiUserId || '');
        if (!id || !name) return res.status(400).json({ error: 'id and name are required.' });

        const existing = await pool.query('SELECT id FROM "EntityFile" WHERE id = $1 AND status = $2 LIMIT 1', [id, 'Active']);
        if (!existing.rows[0]) return res.status(404).json({ error: 'Entity file not found' });

        await pool.query('UPDATE "EntityFile" SET name = $1, "updatedById" = $2, "updatedAt" = NOW() WHERE id = $3', [name, userId, id]);
        const updated = await pool.query('SELECT * FROM "EntityFile" WHERE id = $1 LIMIT 1', [id]);
        res.json(updated.rows[0]);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to update entity file', details: error.message });
    }
});

app.delete(['/api/public/files/:id', '/api/public/entity-files/:id'], requirePublicApiAuth, async (req, res) => {
    try {
        await ensurePublicEntityTables();
        const id = String(req.params.id || '').trim();
        const userId = String((req as any).publicApiUserId || '');
        if (!id) return res.status(400).json({ error: 'id is required.' });

        const existingResult = await pool.query('SELECT id, "filePath" FROM "EntityFile" WHERE id = $1 AND status = $2 LIMIT 1', [id, 'Active']);
        const existing = existingResult.rows[0];
        if (!existing) return res.status(404).json({ error: 'Entity file not found' });

        await pool.query('UPDATE "EntityFile" SET status = $1, "updatedById" = $2, "updatedAt" = NOW() WHERE id = $3', ['Inactive', userId, id]);

        const filePath = String(existing.filePath || '').trim();
        if (filePath && fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); } catch {}
        }
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to delete entity file', details: error.message });
    }
});

for (const [routePrefix, moduleCode] of Object.entries(MODULE_ROUTE_CODE_MAP)) {
    app.use(routePrefix, moduleAuthorizationMiddleware(moduleCode));
}

await loadServerModules();

try {
    await ensureOrganizationColumns();
} catch (e: unknown) {
    console.warn('[startup] ensureOrganizationColumns:', (e as Error)?.message || e);
}

try {
    const spMod = await prisma.systemModule.findUnique({ where: { code: 'SUBSCRIPTION_PLANS' } });
    if (!spMod) {
        const installUrl = pathToFileURL(path.join(MODULES_ROOT, 'subscription-plans/install.ts')).href;
        const { default: installSubscriptionPlans } = await import(installUrl);
        await installSubscriptionPlans({
            pool,
            moduleCode: 'SUBSCRIPTION_PLANS',
            moduleName: 'Subscription plans',
            moduleDescription: 'Catálogo de planes de suscripción y asignación por organización'
        });
        console.log('[startup] Registered Subscription plans module (SystemModule + permissions).');
    }
} catch (e: unknown) {
    console.warn('[startup] Subscription plans module bootstrap:', (e as Error)?.message || e);
}

export default app;






