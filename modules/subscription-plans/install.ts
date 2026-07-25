import type { Pool } from 'pg';
import crypto from 'crypto';

interface InstallContext {
  pool: Pool;
  moduleCode: string;
  moduleName: string;
  moduleDescription?: string;
}

export default async function installSubscriptionPlansModule(ctx: InstallContext) {
  const { pool, moduleCode, moduleName, moduleDescription } = ctx;

  const existingModule = await pool.query('SELECT id FROM "SystemModule" WHERE code = $1 LIMIT 1', [moduleCode]);

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

  const modRow = await pool.query('SELECT id FROM "SystemModule" WHERE code = $1 LIMIT 1', [moduleCode]);
  const moduleId = modRow.rows[0]?.id as string | undefined;
  if (!moduleId) return;

  const roles = await pool.query('SELECT id FROM "Role"');
  for (const row of roles.rows) {
    const roleId = String(row.id);
    const perm = await pool.query(
      'SELECT id FROM "Permission" WHERE "roleId" = $1 AND "moduleId" = $2 LIMIT 1',
      [roleId, moduleId]
    );
    if (perm.rows[0]) {
      await pool.query(
        `UPDATE "Permission" SET "canRead" = true, "canWrite" = true, "canCreate" = true, "canDelete" = true, "updatedAt" = NOW()
         WHERE "roleId" = $1 AND "moduleId" = $2`,
        [roleId, moduleId]
      );
    } else {
      await pool.query(
        `INSERT INTO "Permission" (id, "roleId", "moduleId", "canRead", "canWrite", "canCreate", "canDelete", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, true, true, true, true, NOW(), NOW())`,
        [crypto.randomUUID(), roleId, moduleId]
      );
    }
  }
}
