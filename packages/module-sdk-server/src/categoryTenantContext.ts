import type pg from 'pg';

export type MergedCategoryItemRow = {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  status: string;
  sortOrder: number;
  categoryId: string;
  organizationId: string | null;
  companyId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export const isSystemCategoryItem = (row: { organizationId?: string | null; companyId?: string | null }) =>
  row.organizationId == null && row.companyId == null;

export const parseAccessCompanyIds = (raw: string | null | undefined): string[] => {
  if (!raw) return [];
  return String(raw)
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
};

export async function resolveUserIdFromSessionToken(pool: pg.Pool, token: string): Promise<string | null> {
  const t = String(token || '').trim();
  if (!t) return null;
  const r = await pool.query('SELECT id, "sessionTokenExpiresAt" FROM "User" WHERE "sessionToken" = $1 LIMIT 1', [t]);
  const row = r.rows[0];
  if (!row?.id) return null;
  // Token vencido: se trata como no autenticado.
  if (row.sessionTokenExpiresAt && new Date(row.sessionTokenExpiresAt).getTime() < Date.now()) return null;
  return String(row.id);
}

export type TenantAuthContext = {
  userId: string;
  organizationId: string;
  primaryCompanyId: string;
  accessCompanyIds: string[];
};

export async function resolveTenantAuthContext(pool: pg.Pool, userId: string): Promise<TenantAuthContext | null> {
  const r = await pool.query(
    `
    SELECT u.id AS "userId",
           c."organizationId" AS "organizationId",
           u."companyId" AS "primaryCompanyId",
           u."accessCompanyIds" AS "accessCompanyIdsRaw"
    FROM "User" u
    JOIN "Company" c ON c.id = u."companyId"
    WHERE u.id = $1
    LIMIT 1
  `,
    [userId]
  );
  const row = r.rows[0];
  if (!row?.organizationId || !row?.primaryCompanyId) return null;
  return {
    userId: String(row.userId),
    organizationId: String(row.organizationId),
    primaryCompanyId: String(row.primaryCompanyId),
    accessCompanyIds: parseAccessCompanyIds(row.accessCompanyIdsRaw)
  };
}

export function userCanAccessCompany(ctx: TenantAuthContext, companyId: string): boolean {
  const id = String(companyId || '').trim();
  if (!id) return false;
  if (id === ctx.primaryCompanyId) return true;
  return ctx.accessCompanyIds.includes(id);
}

/** Resolves optional company filter: must belong to org and be accessible by user. */
export async function resolveCompanyContextForRequest(
  pool: pg.Pool,
  ctx: TenantAuthContext,
  requestedCompanyId: string | null | undefined
): Promise<string | null> {
  const raw = String(requestedCompanyId || '').trim();
  if (!raw) return null;
  if (!userCanAccessCompany(ctx, raw)) return null;
  const r = await pool.query(
    'SELECT id FROM "Company" WHERE id = $1 AND "organizationId" = $2 LIMIT 1',
    [raw, ctx.organizationId]
  );
  return r.rows[0]?.id ? String(r.rows[0].id) : null;
}

export async function assertCompanyBelongsToOrg(
  pool: pg.Pool,
  organizationId: string,
  companyId: string
): Promise<boolean> {
  const r = await pool.query(
    'SELECT 1 FROM "Company" WHERE id = $1 AND "organizationId" = $2 LIMIT 1',
    [companyId, organizationId]
  );
  return Boolean(r.rows[0]);
}

export type FetchMergedItemsOptions = {
  categoryId: string;
  organizationId: string;
  companyIdContext: string | null;
  activeOnly?: boolean;
};

export async function fetchMergedCategoryItems(
  pool: pg.Pool,
  opts: FetchMergedItemsOptions
): Promise<MergedCategoryItemRow[]> {
  const { categoryId, organizationId, companyIdContext, activeOnly } = opts;
  const statusClause = activeOnly ? `AND i.status = 'Active'` : '';

  if (!organizationId) {
    const sql = `
      SELECT i.id, i.code, i.name, i.description, i.status, i."sortOrder", i."categoryId",
             i."organizationId", i."companyId", i."createdAt", i."updatedAt"
      FROM "CategoryItem" i
      WHERE i."categoryId" = $1
      ${statusClause}
      AND i."organizationId" IS NULL AND i."companyId" IS NULL
      ORDER BY i."sortOrder" ASC, i.id ASC
    `;
    const r = await pool.query(sql, [categoryId]);
    return r.rows as MergedCategoryItemRow[];
  }

  const params: unknown[] = [categoryId, organizationId];
  let companyClause = '';
  if (companyIdContext) {
    params.push(companyIdContext);
    companyClause = `OR (i."organizationId" = $2 AND i."companyId" = $${params.length})`;
  }
  const sql = `
    SELECT i.id, i.code, i.name, i.description, i.status, i."sortOrder", i."categoryId",
           i."organizationId", i."companyId", i."createdAt", i."updatedAt"
    FROM "CategoryItem" i
    WHERE i."categoryId" = $1
    ${statusClause}
    AND (
      (i."organizationId" IS NULL AND i."companyId" IS NULL)
      OR (i."organizationId" = $2 AND i."companyId" IS NULL)
      ${companyClause}
    )
    ORDER BY i."sortOrder" ASC, i.id ASC
  `;
  const r = await pool.query(sql, params);
  return r.rows as MergedCategoryItemRow[];
}

export async function countMergedCategoryItems(
  pool: pg.Pool,
  opts: Omit<FetchMergedItemsOptions, 'activeOnly'> & { activeOnly?: boolean }
): Promise<number> {
  const { categoryId, organizationId, companyIdContext, activeOnly } = opts;
  const statusClause = activeOnly ? `AND i.status = 'Active'` : '';

  if (!organizationId) {
    const sql = `
      SELECT COUNT(*)::int AS n
      FROM "CategoryItem" i
      WHERE i."categoryId" = $1
      ${statusClause}
      AND i."organizationId" IS NULL AND i."companyId" IS NULL
    `;
    const r = await pool.query(sql, [categoryId]);
    return Number(r.rows[0]?.n || 0);
  }

  const params: unknown[] = [categoryId, organizationId];
  let companyClause = '';
  if (companyIdContext) {
    params.push(companyIdContext);
    companyClause = `OR (i."organizationId" = $2 AND i."companyId" = $${params.length})`;
  }
  const sql = `
    SELECT COUNT(*)::int AS n
    FROM "CategoryItem" i
    WHERE i."categoryId" = $1
    ${statusClause}
    AND (
      (i."organizationId" IS NULL AND i."companyId" IS NULL)
      OR (i."organizationId" = $2 AND i."companyId" IS NULL)
      ${companyClause}
    )
  `;
  const r = await pool.query(sql, params);
  return Number(r.rows[0]?.n || 0);
}

/** Load merged active items for several category codes (dropdowns / module meta). */
export async function fetchMergedItemsByCategoryCodes(
  pool: pg.Pool,
  args: {
    codes: string[];
    organizationId: string;
    companyIdContext: string | null;
    activeOnly?: boolean;
  }
): Promise<Map<string, { id: string; name: string }[]>> {
  const out = new Map<string, { id: string; name: string }[]>();
  const codes = args.codes.filter(Boolean);
  if (!codes.length) return out;
  const catMeta = await pool.query(`SELECT id, code FROM "Category" WHERE code = ANY($1)`, [codes]);
  const codeToId = new Map<string, string>(
    catMeta.rows.map((r: { id: string; code: string }) => [String(r.code), String(r.id)])
  );
  const activeOnly = args.activeOnly !== false;
  for (const code of codes) {
    const categoryId = codeToId.get(code);
    if (!categoryId) {
      out.set(code, []);
      continue;
    }
    const rows = await fetchMergedCategoryItems(pool, {
      categoryId,
      organizationId: args.organizationId,
      companyIdContext: args.companyIdContext,
      activeOnly
    });
    out.set(
      code,
      rows.map((i) => ({ id: i.id, name: i.name }))
    );
  }
  return out;
}

export async function countMergedItemsByCategoryIds(
  pool: pg.Pool,
  args: {
    categoryIds: string[];
    organizationId: string;
    companyIdContext: string | null;
    activeOnly?: boolean;
  }
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const ids = args.categoryIds.filter(Boolean);
  if (!ids.length) return map;
  for (const cid of ids) {
    map.set(
      cid,
      await countMergedCategoryItems(pool, {
        categoryId: cid,
        organizationId: args.organizationId,
        companyIdContext: args.companyIdContext,
        activeOnly: args.activeOnly
      })
    );
  }
  return map;
}
