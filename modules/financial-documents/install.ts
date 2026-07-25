import crypto from 'crypto';
import type { Pool } from 'pg';
import { ensureCoreReferenceTemplate, propagateReferenceTemplateToAllCompanies } from '@sinapsis/module-sdk-server';

interface InstallContext {
  pool: Pool;
  moduleCode: string;
  moduleName: string;
  moduleDescription?: string;
}

const REF_MODULE = 'FIN_DOCS';

const REF_BY_TYPE: Record<string, { code: string; prefix: string }> = {
  Invoice: { code: 'INVOICE', prefix: 'INV-' },
  'Credit Memo': { code: 'CREDIT_MEMO', prefix: 'CRM-' },
  'Debit Memo': { code: 'DEBIT_MEMO', prefix: 'DBM-' },
  'Purchase Order': { code: 'PURCHASE_ORDER', prefix: 'PO-' },
  Receipt: { code: 'RECEIPT', prefix: 'RCP-' },
  'Delivery Note': { code: 'DELIVERY_NOTE', prefix: 'DLN-' }
};

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

export default async function installFinancialDocumentsModule(ctx: InstallContext) {
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
    code: 'FIN_DOC_TYPE',
    name: 'Financial Document Types',
    module: 'FinancialDocuments',
    description: 'Document types catalog for Financial Documents module',
    items: [
      'Invoice',
      'Credit Memo',
      'Debit Memo',
      'Purchase Order',
      'Receipt',
      'Delivery Note'
    ]
  });

  await ensureCategoryWithItems(pool, {
    code: 'FIN_DOC_STATUS',
    name: 'Financial Document Status',
    module: 'FinancialDocuments',
    description: 'Statuses catalog for Financial Documents module',
    items: ['Draft', 'Issued', 'Approved', 'Paid', 'Cancelled']
  });

  for (const ref of Object.values(REF_BY_TYPE)) {
    await ensureCoreReferenceTemplate(pool, {
      module: REF_MODULE,
      code: ref.code,
      prefix: ref.prefix,
      digits: 6,
      reference: 0
    });
    await propagateReferenceTemplateToAllCompanies(pool, REF_MODULE, ref.code);
  }
}
