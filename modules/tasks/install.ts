import crypto from 'crypto';
import type { Pool } from 'pg';
import { ensureCoreReferenceTemplate, propagateReferenceTemplateToAllCompanies } from '@sinapsis/module-sdk-server';

interface InstallContext {
  pool: Pool;
  moduleCode: string;
  moduleName: string;
  moduleDescription?: string;
}

const ensureCategoryWithItems = async (
  pool: Pool,
  args: { code: string; name: string; module: string; description: string; items: string[] }
) => {
  const existingCategory = await pool.query(
    'SELECT id FROM "Category" WHERE code = $1 ORDER BY "createdAt" ASC LIMIT 1',
    [args.code]
  );

  let categoryId = existingCategory.rows[0]?.id as string | undefined;

  if (!categoryId) {
    const created = await pool.query(
      'INSERT INTO "Category" (id, code, name, description, module, status, "sortOrder", "sortingRule", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, 0, $7, NOW(), NOW()) RETURNING id',
      [crypto.randomUUID(), args.code, args.name, args.description, args.module, 'Active', 'Manual']
    );
    categoryId = created.rows[0].id;
  }

  for (let i = 0; i < args.items.length; i += 1) {
    const name = args.items[i];
    const code = name.replace(/[^a-z0-9]/gi, '_').toUpperCase();
    const existingItem = await pool.query(
      'SELECT id FROM "CategoryItem" WHERE "categoryId" = $1 AND (name = $2 OR code = $3) LIMIT 1',
      [categoryId, name, code]
    );

    if (!existingItem.rows[0]) {
      await pool.query(
        'INSERT INTO "CategoryItem" (id, code, name, description, status, "sortOrder", "categoryId", "organizationId", "companyId", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, NULL, NOW(), NOW())',
        [crypto.randomUUID(), code, name, `${args.name}: ${name}`, 'Active', i, categoryId]
      );
    }
  }
};

export default async function installTasksModule(ctx: InstallContext) {
  const { pool, moduleCode, moduleName, moduleDescription } = ctx;

  const existingModule = await pool.query(
    'SELECT id FROM "SystemModule" WHERE code = $1 LIMIT 1',
    [moduleCode]
  );

  if (existingModule.rows[0]) {
    await pool.query(
      'UPDATE "SystemModule" SET name = $1, description = $2, status = $3, "updatedAt" = NOW() WHERE code = $4',
      [moduleName, moduleDescription || null, 'Active', moduleCode]
    );
  } else {
    await pool.query(
      'INSERT INTO "SystemModule" (id, name, code, description, status, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, NOW(), NOW())',
      [crypto.randomUUID(), moduleName, moduleCode, moduleDescription || null, 'Active']
    );
  }

  await ensureCategoryWithItems(pool, {
    code: 'TASK_TYPE',
    name: 'Task Types',
    module: 'Tasks',
    description: 'Task types catalog for Tasks module',
    items: ['General', 'Bug', 'Feature', 'Ops']
  });

  await ensureCategoryWithItems(pool, {
    code: 'TASK_STATUS',
    name: 'Task Status',
    module: 'Tasks',
    description: 'Task statuses for Tasks module',
    items: ['Todo', 'InProgress', 'Done']
  });

  await ensureCategoryWithItems(pool, {
    code: 'TASK_PRIORITY',
    name: 'Task Priority',
    module: 'Tasks',
    description: 'Task priorities for Tasks module',
    items: ['Low', 'Medium', 'High']
  });

  await ensureCoreReferenceTemplate(pool, {
    module: 'TASKS',
    code: 'TASKS',
    prefix: 'TSK-',
    digits: 4,
    reference: 0
  });
  await propagateReferenceTemplateToAllCompanies(pool, 'TASKS', 'TASKS');

  // FamilyTool: asegura una configuración por familia (company) con valores por defecto.
  await pool.query(
    `INSERT INTO "FamilyConfig" ("companyId", "pointsPerUnit", "currency", "minWithdrawalPoints", "requireResponsibilitiesUpToDate", "createdAt", "updatedAt")
     SELECT c.id, 100, 'USD', 0, TRUE, NOW(), NOW()
     FROM "Company" c
     ON CONFLICT ("companyId") DO NOTHING`
  );

  // FamilyTool: en la app familiar el módulo ES la aplicación, así que todo miembro
  // (todo rol) necesita acceso. Los permisos "solo padre" (emitir, aprobar retiros,
  // editar config) se validan a nivel endpoint (isParentUser), no por RBAC.
  // Sembramos permisos de TASKS para cada rol que aún no los tenga.
  const taskModule = await pool.query('SELECT id FROM "SystemModule" WHERE code = $1 LIMIT 1', [moduleCode]);
  const taskModuleId = taskModule.rows[0]?.id as string | undefined;
  if (taskModuleId) {
    await pool.query(
      `INSERT INTO "Permission" (id, "roleId", "moduleId", "canRead", "canWrite", "canCreate", "canDelete", "createdAt", "updatedAt")
       SELECT gen_random_uuid(), r.id, $1, TRUE, TRUE, TRUE, TRUE, NOW(), NOW()
       FROM "Role" r
       ON CONFLICT ("roleId", "moduleId") DO NOTHING`,
      [taskModuleId]
    );
  }

  // FamilyTool: catálogo de insignias (gamificación).
  const badges: [string, string, string, string, number][] = [
    ['FIRST_TASK', 'Primer paso', 'Completaste tu primera tarea', '🎯', 0],
    ['STREAK_3', 'En racha', '3 días seguidos colaborando', '🔥', 1],
    ['STREAK_7', 'Imparable', '7 días seguidos colaborando', '⚡', 2],
    ['HELPER_10', 'Gran ayudante', 'Completaste 10 tareas', '🌟', 3],
    ['GENEROUS', 'Generoso/a', 'Transferiste puntos a otro miembro', '🤝', 4],
    ['SAVER', 'Ahorrador/a', 'Hiciste tu primer retiro aprobado', '🏦', 5]
  ];
  for (const [code, name, description, icon, sortOrder] of badges) {
    await pool.query(
      `INSERT INTO "Badge" (id, code, name, description, icon, "sortOrder")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, icon = EXCLUDED.icon, "sortOrder" = EXCLUDED."sortOrder"`,
      [code, name, description, icon, sortOrder]
    );
  }
}
