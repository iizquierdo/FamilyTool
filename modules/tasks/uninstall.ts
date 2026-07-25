import type { Pool } from 'pg';

interface UninstallContext {
  pool: Pool;
  moduleCode: string;
  purgeData?: boolean;
}

export default async function uninstallTasksModule(ctx: UninstallContext) {
  const { pool, moduleCode, purgeData = false } = ctx;

  await pool.query(
    'UPDATE "SystemModule" SET status = $1, "updatedAt" = NOW() WHERE code = $2',
    ['Inactive', moduleCode]
  );

  if (!purgeData) return;

  await pool.query('DELETE FROM "TaskShare"');
  await pool.query('DELETE FROM "Task"');

  await pool.query(
    'DELETE FROM "Category" WHERE code = ANY($1)',
    [['TASK_TYPE', 'TASK_STATUS', 'TASK_PRIORITY']]
  );

  await pool.query('DELETE FROM "Reference" WHERE module = $1', ['TASKS']);
}
