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

export default async function installCrmModule(ctx: InstallContext) {
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
    code: 'CRM_OPPORTUNITY_STAGE',
    name: 'CRM Opportunity Stages',
    module: 'CRM',
    description: 'Stages for CRM opportunities',
    items: ['Lead', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost']
  });

  await ensureCategoryWithItems(pool, {
    code: 'CRM_OPPORTUNITY_STATUS',
    name: 'CRM Opportunity Status',
    module: 'CRM',
    description: 'Statuses for CRM opportunities',
    items: ['Open', 'OnHold', 'Won', 'Lost', 'Archived']
  });

  await ensureCategoryWithItems(pool, {
    code: 'CRM_ACTIVITY_TYPE',
    name: 'CRM Activity Types',
    module: 'CRM',
    description: 'Activity type catalog for CRM follow-ups',
    items: ['Call', 'Email', 'Meeting', 'Task', 'Demo', 'FollowUp']
  });

  await ensureCategoryWithItems(pool, {
    code: 'CRM_ACTIVITY_STATUS',
    name: 'CRM Activity Status',
    module: 'CRM',
    description: 'Activity status catalog for CRM follow-ups',
    items: ['Pending', 'Completed', 'Cancelled', 'Overdue']
  });

  await ensureCoreReferenceTemplate(pool, {
    module: 'CRM',
    code: 'CRM_OPPORTUNITY',
    prefix: 'CRM-',
    digits: 6,
    reference: 0
  });
  await propagateReferenceTemplateToAllCompanies(pool, 'CRM', 'CRM_OPPORTUNITY');

  await ensureCoreReferenceTemplate(pool, {
    module: 'CRM',
    code: 'CRM_ACTIVITY',
    prefix: 'CRA-',
    digits: 6,
    reference: 0
  });
  await propagateReferenceTemplateToAllCompanies(pool, 'CRM', 'CRM_ACTIVITY');
}
