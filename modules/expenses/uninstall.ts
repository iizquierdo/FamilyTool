import type { Pool } from 'pg';

interface UninstallContext {
  pool: Pool;
  moduleCode: string;
  purgeData?: boolean;
}

const EXPENSE_CATEGORY_CODES = [
  'EXPENSE_CATEGORY',
  'EXPENSE_STATUS',
  'EXPENSE_PAYMENT_METHOD',
  'EXPENSE_CURRENCY',
  'EXPENSE_RECURRENCE'
];

export default async function uninstallExpensesModule(ctx: UninstallContext) {
  const { pool, moduleCode, purgeData = false } = ctx;

  await pool.query(
    'UPDATE "SystemModule" SET status = $1, "updatedAt" = NOW() WHERE code = $2',
    ['Inactive', moduleCode]
  );

  if (!purgeData) return;

  await pool.query('DELETE FROM "Expense"');
  await pool.query('DELETE FROM "ExpenseRecurring"');
  await pool.query('DELETE FROM "ExpenseExchangeRate"');

  await pool.query(
    'DELETE FROM "Category" WHERE code = ANY($1)',
    [EXPENSE_CATEGORY_CODES]
  );

  await pool.query(
    'DELETE FROM "Reference" WHERE module = $1',
    ['EXPENSES']
  );
}
