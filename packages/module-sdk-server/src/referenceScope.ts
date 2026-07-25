import crypto from 'crypto';
import type { Pool, PoolClient } from 'pg';

type PgExec = Pick<Pool, 'query'>;

export type CoreReferenceDef = {
  module: string;
  code: string;
  prefix?: string | null;
  sufix?: string | null;
  digits?: number;
  /** Stored counter for next emitted value (default 0). */
  reference?: number;
};

const normCode = (code: string) => String(code || '').trim();

/** Next human-readable code from row state; `reference` is the value emitted, then incremented. */
export const formatReferenceCode = (row: { reference: number; digits: number; prefix: string | null; sufix: string | null }) => {
  const currentRef = row.reference != null && Number.isFinite(Number(row.reference)) ? Number(row.reference) : 0;
  const digits = Number(row.digits) || 4;
  const prefix = String(row.prefix || '');
  const sufix = String(row.sufix || '');
  return `${prefix}${String(currentRef).padStart(digits, '0')}${sufix}`;
};

/**
 * Idempotent: ensures one core row (companyId NULL) for (module, code).
 * Call from module install before propagating to companies.
 */
export const ensureCoreReferenceTemplate = async (pool: PgExec, def: CoreReferenceDef) => {
  const module = String(def.module || '').trim();
  const code = normCode(def.code);
  if (!module || !code) throw new Error('ensureCoreReferenceTemplate: module and code are required');

  const prefix = def.prefix != null ? String(def.prefix) : '';
  const sufix = def.sufix != null ? String(def.sufix) : '';
  const digits = Number.isFinite(Number(def.digits)) ? Number(def.digits) : 4;
  const reference = Number.isFinite(Number(def.reference)) ? Number(def.reference) : 0;

  const exists = await pool.query(
    `SELECT id FROM "Reference" WHERE "companyId" IS NULL AND module = $1 AND COALESCE(code, '') = $2 LIMIT 1`,
    [module, code]
  );
  if (exists.rows[0]) return;

  await pool.query(
    `INSERT INTO "Reference" (id, "companyId", module, code, reference, prefix, sufix, digits, clone, "createdAt", "updatedAt")
     VALUES ($1::uuid, NULL, $2, $3, $4, $5, $6, $7, 0, NOW(), NOW())`,
    [crypto.randomUUID(), module, code, reference, prefix || null, sufix || null, digits]
  );
};

/** For each company, insert a copy of the core template row if missing (counter 0). */
export const propagateReferenceTemplateToAllCompanies = async (pool: PgExec, module: string, code: string) => {
  const m = String(module || '').trim();
  const c = normCode(code);
  if (!m || !c) throw new Error('propagateReferenceTemplateToAllCompanies: module and code are required');

  await pool.query(
    `
    INSERT INTO "Reference" (id, "companyId", module, code, reference, prefix, sufix, digits, clone, "createdAt", "updatedAt")
    SELECT gen_random_uuid(), cmp.id, t.module, t.code, 0, t.prefix, t.sufix, t.digits, t.clone, NOW(), NOW()
    FROM "Company" cmp
    CROSS JOIN LATERAL (
      SELECT r.module, r.code, r.prefix, r.sufix, r.digits, r.clone
      FROM "Reference" r
      WHERE r."companyId" IS NULL AND r.module = $1 AND COALESCE(r.code, '') = $2
      LIMIT 1
    ) t
    WHERE NOT EXISTS (
      SELECT 1 FROM "Reference" x
      WHERE x."companyId" = cmp.id
        AND x.module = t.module
        AND COALESCE(x.code, '') = COALESCE(t.code, '')
    )
    `,
    [m, c]
  );
};

/** Clone every core reference into a new company with reference reset to 0. */
export const cloneAllCoreReferencesToCompany = async (exec: PgExec, newCompanyId: string) => {
  const id = String(newCompanyId || '').trim();
  if (!id) throw new Error('cloneAllCoreReferencesToCompany: company id required');

  await exec.query(
    `
    INSERT INTO "Reference" (id, "companyId", module, code, reference, prefix, sufix, digits, clone, "createdAt", "updatedAt")
    SELECT gen_random_uuid(), $1::text, r.module, r.code, 0, r.prefix, r.sufix, r.digits, r.clone, NOW(), NOW()
    FROM "Reference" r
    WHERE r."companyId" IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM "Reference" x
        WHERE x."companyId" = $1::text
          AND x.module = r.module
          AND COALESCE(x.code, '') = COALESCE(r.code, '')
      )
    `,
    [id]
  );
};

export type ReserveNextArgs = {
  companyId: string;
  module: string;
  code: string;
};

/**
 * Reserves the next formatted code for a company-scoped reference row.
 * Requires an existing row for (companyId, module, code); does not auto-create.
 */
export const reserveNextReference = async (pool: Pool, args: ReserveNextArgs): Promise<string> => {
  const companyId = String(args.companyId || '').trim();
  const module = String(args.module || '').trim();
  const code = normCode(args.code);
  if (!companyId || !module || !code) {
    throw new Error('reserveNextReference: companyId, module and code are required');
  }

  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT id, reference, digits, prefix, sufix FROM "Reference"
       WHERE module = $1 AND COALESCE(code, '') = $2 AND "companyId" = $3::text
       ORDER BY "createdAt" ASC
       LIMIT 1
       FOR UPDATE`,
      [module, code, companyId]
    );
    const row = result.rows[0];
    if (!row) {
      await client.query('ROLLBACK');
      throw new Error(
        `Missing Reference row for company ${companyId} module=${module} code=${code}. Ensure company was created after templates exist or run module install.`
      );
    }

    const currentRef = row.reference != null && Number.isFinite(Number(row.reference)) ? Number(row.reference) : 0;
    const digits = Number(row.digits) || 4;
    const prefix = String(row.prefix || '');
    const sufix = String(row.sufix || '');
    const nextCode = `${prefix}${String(currentRef).padStart(digits, '0')}${sufix}`;

    await client.query('UPDATE "Reference" SET reference = $1, "updatedAt" = NOW() WHERE id = $2', [currentRef + 1, row.id]);
    await client.query('COMMIT');
    return nextCode;
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }
};
