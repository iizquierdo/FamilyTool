CREATE TABLE IF NOT EXISTS "ExpenseRecurring" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "vendor" TEXT,
    "amount" NUMERIC(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'Monthly',
    "interval" INTEGER NOT NULL DEFAULT 1,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'Active',
    "category" TEXT,
    "paymentMethod" TEXT,
    "notes" TEXT,
    "companyId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExpenseRecurring_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Expense" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "vendor" TEXT,
    "amount" NUMERIC(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "exchangeRate" NUMERIC(18,6) NOT NULL DEFAULT 1,
    "baseCurrency" TEXT NOT NULL,
    "amountBase" NUMERIC(14,2) NOT NULL,
    "expenseDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Paid',
    "category" TEXT,
    "paymentMethod" TEXT,
    "notes" TEXT,
    "recurringId" TEXT,
    "isRecurringGenerated" BOOLEAN NOT NULL DEFAULT FALSE,
    "companyId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ExpenseExchangeRate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "baseCurrency" TEXT NOT NULL,
    "quoteCurrency" TEXT NOT NULL,
    "rate" NUMERIC(18,6) NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'Manual',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExpenseExchangeRate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Expense_code_key" ON "Expense"("code");
CREATE INDEX IF NOT EXISTS "Expense_companyId_expenseDate_idx" ON "Expense"("companyId", "expenseDate");
CREATE INDEX IF NOT EXISTS "Expense_companyId_status_idx" ON "Expense"("companyId", "status");
CREATE INDEX IF NOT EXISTS "Expense_ownerId_expenseDate_idx" ON "Expense"("ownerId", "expenseDate");
CREATE INDEX IF NOT EXISTS "Expense_recurringId_idx" ON "Expense"("recurringId");

CREATE UNIQUE INDEX IF NOT EXISTS "ExpenseRecurring_code_key" ON "ExpenseRecurring"("code");
CREATE INDEX IF NOT EXISTS "ExpenseRecurring_companyId_status_idx" ON "ExpenseRecurring"("companyId", "status");
CREATE INDEX IF NOT EXISTS "ExpenseRecurring_nextRunAt_idx" ON "ExpenseRecurring"("nextRunAt");

CREATE INDEX IF NOT EXISTS "ExpenseExchangeRate_company_base_quote_date_idx" ON "ExpenseExchangeRate"("companyId", "baseCurrency", "quoteCurrency", "effectiveDate");
CREATE INDEX IF NOT EXISTS "ExpenseExchangeRate_base_quote_date_idx" ON "ExpenseExchangeRate"("baseCurrency", "quoteCurrency", "effectiveDate");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Expense_companyId_fkey') THEN
        ALTER TABLE "Expense" ADD CONSTRAINT "Expense_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Expense_createdById_fkey') THEN
        ALTER TABLE "Expense" ADD CONSTRAINT "Expense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Expense_ownerId_fkey') THEN
        ALTER TABLE "Expense" ADD CONSTRAINT "Expense_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Expense_recurringId_fkey') THEN
        ALTER TABLE "Expense" ADD CONSTRAINT "Expense_recurringId_fkey" FOREIGN KEY ("recurringId") REFERENCES "ExpenseRecurring"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ExpenseRecurring_companyId_fkey') THEN
        ALTER TABLE "ExpenseRecurring" ADD CONSTRAINT "ExpenseRecurring_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ExpenseRecurring_createdById_fkey') THEN
        ALTER TABLE "ExpenseRecurring" ADD CONSTRAINT "ExpenseRecurring_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ExpenseRecurring_ownerId_fkey') THEN
        ALTER TABLE "ExpenseRecurring" ADD CONSTRAINT "ExpenseRecurring_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ExpenseExchangeRate_companyId_fkey') THEN
        ALTER TABLE "ExpenseExchangeRate" ADD CONSTRAINT "ExpenseExchangeRate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ExpenseExchangeRate_createdById_fkey') THEN
        ALTER TABLE "ExpenseExchangeRate" ADD CONSTRAINT "ExpenseExchangeRate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
