import type { Pool } from 'pg';

interface UninstallContext {
  pool: Pool;
  moduleCode: string;
  purgeData?: boolean;
}

export default async function uninstallClientsModule(ctx: UninstallContext) {
  const { pool, moduleCode, purgeData = false } = ctx;

  await pool.query(
    'UPDATE "SystemModule" SET status = $1, "updatedAt" = NOW() WHERE code = $2',
    ['Inactive', moduleCode]
  );

  if (!purgeData) return;

  await pool.query('DELETE FROM "ClientCompany"');
  await pool.query('DELETE FROM "Client"');

  await pool.query(
    'DELETE FROM "Category" WHERE code = ANY($1)',
    [['CLIENT_TYPE', 'CLIENT_STATUS']]
  );

  await pool.query('DELETE FROM "Reference" WHERE module = $1', ['CLIENTS']);
}
