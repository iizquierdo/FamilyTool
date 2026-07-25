import type { Pool } from 'pg';

interface UninstallContext {
  pool: Pool;
  moduleCode: string;
  purgeData?: boolean;
}

export default async function uninstallCrmModule(ctx: UninstallContext) {
  const { pool, moduleCode, purgeData = false } = ctx;

  await pool.query(
    'UPDATE "SystemModule" SET status = $1, "updatedAt" = NOW() WHERE code = $2',
    ['Inactive', moduleCode]
  );

  if (!purgeData) return;

  await pool.query('DELETE FROM "CrmActivity"');
  await pool.query('DELETE FROM "CrmOpportunity"');

  await pool.query(
    'DELETE FROM "Category" WHERE code = ANY($1)',
    [['CRM_OPPORTUNITY_STAGE', 'CRM_OPPORTUNITY_STATUS', 'CRM_ACTIVITY_TYPE', 'CRM_ACTIVITY_STATUS']]
  );

  await pool.query('DELETE FROM "Reference" WHERE module = $1', ['CRM']);
}
