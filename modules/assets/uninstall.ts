import type { Pool } from 'pg';

interface UninstallContext {
  pool: Pool;
  moduleCode: string;
  purgeData?: boolean;
}

export default async function uninstallAssetsModule(ctx: UninstallContext) {
  const { pool, moduleCode, purgeData = false } = ctx;

  await pool.query('UPDATE "SystemModule" SET status = $1, "updatedAt" = NOW() WHERE code = $2', ['Inactive', moduleCode]);

  if (!purgeData) return;

  await pool.query('DELETE FROM "AssetCompany"');
  await pool.query('DELETE FROM "Asset"');
  await pool.query('DELETE FROM "AssetProductFile"');
  await pool.query('DELETE FROM "AssetProduct"');

  await pool.query('DELETE FROM "Reference" WHERE module = $1', ['ASSETS']);
}
