import type { Pool } from 'pg';

interface UninstallContext {
  pool: Pool;
  moduleCode: string;
  purgeData?: boolean;
}

export default async function uninstallSubscriptionPlansModule(ctx: UninstallContext) {
  const { pool, moduleCode } = ctx;
  await pool.query('UPDATE "SystemModule" SET status = $1, "updatedAt" = NOW() WHERE code = $2', ['Inactive', moduleCode]);
}
