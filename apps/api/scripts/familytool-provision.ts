// FamilyTool — Provisión idempotente del entorno.
// Deja el web (tenant) como consola de administración de FamilyTool:
//   - Rebranding del Core (appName + colores).
//   - Módulo TASKS activo + permisos para todos los roles.
//   - Módulos del CRM genérico (que NO son FamilyTool) desactivados.
//   - Menú lateral limpio: Dashboard + Settings.
// Reproducible en cualquier base: `pnpm familytool:provision`.
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(here, '..');
const repoRoot = path.resolve(apiRoot, '..', '..');
dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(apiRoot, '.env'), override: true });

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const FAMILYTOOL_MODULE = 'TASKS';
// Módulos de la plantilla genérica que NO forman parte de FamilyTool.
const NON_FAMILYTOOL_MODULES = ['CLIENTS', 'CRM', 'EXPENSES', 'FIN_DOCS', 'ASSETS'];

// Menú deseado del web (admin/config). Los módulos de la familia viven en la PWA.
const DESIRED_MENU: {
  key: string;
  label: string;
  icon: string;
  sort: number;
  items: { label: string; icon: string; targetType: string; viewKey: string; sort: number }[];
}[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    icon: 'fa-chart-line',
    sort: 10,
    items: [{ label: 'Dashboard', icon: 'fa-chart-line', targetType: 'STATIC_VIEW', viewKey: 'Dashboard', sort: 10 }]
  },
  {
    key: 'settings',
    label: 'Settings',
    icon: 'fa-gear',
    sort: 90,
    items: [
      { label: 'Organización', icon: 'fa-building', targetType: 'STATIC_VIEW', viewKey: 'OrganizationSettings', sort: 10 },
      { label: 'Sucursales', icon: 'fa-sitemap', targetType: 'STATIC_VIEW', viewKey: 'CompanySettings', sort: 20 },
      { label: 'Branding App', icon: 'fa-palette', targetType: 'STATIC_VIEW', viewKey: 'AppBrandingSettings', sort: 30 },
      { label: 'Usuarios', icon: 'fa-users', targetType: 'STATIC_VIEW', viewKey: 'UserSettings', sort: 40 },
      { label: 'Roles', icon: 'fa-user-shield', targetType: 'STATIC_VIEW', viewKey: 'RoleSettings', sort: 50 },
      { label: 'Mi plan', icon: 'fa-gem', targetType: 'STATIC_VIEW', viewKey: 'MyPlanSettings', sort: 60 }
    ]
  }
];

async function main() {
  // 1) Branding
  await pool.query(
    `UPDATE "Core" SET "appName" = 'FamilyTool', "primaryColor" = '#6366f1', "secondaryColor" = '#f4f4f5', "updatedAt" = NOW() WHERE id = 1`
  );

  // 2) Módulo FamilyTool activo + permisos para todos los roles
  await pool.query(`UPDATE "SystemModule" SET status = 'Active', "updatedAt" = NOW() WHERE code = $1`, [FAMILYTOOL_MODULE]);
  const taskMod = await pool.query('SELECT id FROM "SystemModule" WHERE code = $1 LIMIT 1', [FAMILYTOOL_MODULE]);
  const taskModuleId = taskMod.rows[0]?.id as string | undefined;
  if (taskModuleId) {
    await pool.query(
      `INSERT INTO "Permission" (id, "roleId", "moduleId", "canRead", "canWrite", "canCreate", "canDelete", "createdAt", "updatedAt")
       SELECT gen_random_uuid(), r.id, $1, TRUE, TRUE, TRUE, TRUE, NOW(), NOW()
       FROM "Role" r ON CONFLICT ("roleId", "moduleId") DO NOTHING`,
      [taskModuleId]
    );
  }

  // 3) Desactivar los módulos del CRM genérico
  await pool.query(`UPDATE "SystemModule" SET status = 'Inactive', "updatedAt" = NOW() WHERE code = ANY($1)`, [NON_FAMILYTOOL_MODULES]);

  // 4) Menú lateral: reconstruir declarativamente
  const desiredKeys = DESIRED_MENU.map((g) => g.key);
  // Borra grupos del sidebar que no forman parte del menú deseado (cascada borra items).
  await pool.query(`DELETE FROM "MenuGroup" WHERE placement = 'sidebar' AND key <> ALL($1)`, [desiredKeys]);

  for (const group of DESIRED_MENU) {
    const upserted = await pool.query(
      `INSERT INTO "MenuGroup" (id, key, label, icon, status, "sortOrder", placement, "displayMode", "createdAt", "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, $3, 'Active', $4, 'sidebar', 'icon_and_text', NOW(), NOW())
       ON CONFLICT (key, placement) DO UPDATE SET label = EXCLUDED.label, icon = EXCLUDED.icon, "sortOrder" = EXCLUDED."sortOrder", status = 'Active', "updatedAt" = NOW()
       RETURNING id`,
      [group.key, group.label, group.icon, group.sort]
    );
    const groupId = upserted.rows[0].id as string;
    await pool.query('DELETE FROM "MenuItem" WHERE "groupId" = $1', [groupId]);
    for (const item of group.items) {
      await pool.query(
        `INSERT INTO "MenuItem" (id, "groupId", label, icon, "targetType", "viewKey", "moduleCode", "openInNewTab", status, "sortOrder", "displayMode", "createdAt", "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NULL, false, 'Active', $6, 'icon_and_text', NOW(), NOW())`,
        [groupId, item.label, item.icon, item.targetType, item.viewKey, item.sort]
      );
    }
  }

  // Resumen
  const groups = await pool.query(`SELECT label FROM "MenuGroup" WHERE placement = 'sidebar' ORDER BY "sortOrder"`);
  const active = await pool.query(`SELECT code FROM "SystemModule" WHERE status = 'Active' ORDER BY code`);
  console.log('✅ FamilyTool provisionado.');
  console.log('   Menú sidebar:', groups.rows.map((r: any) => r.label).join(' · '));
  console.log('   Módulos activos:', active.rows.map((r: any) => r.code).join(', '));
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error('Error en la provisión:', err.message);
    pool.end();
    process.exit(1);
  });
