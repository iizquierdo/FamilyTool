CREATE TABLE IF NOT EXISTS "FinancialDocument" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "issueDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "totalAmount" NUMERIC(14, 2) NOT NULL DEFAULT 0,
    "partyName" TEXT NOT NULL,
    "partyEmail" TEXT,
    "notes" TEXT,
    "companyId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FinancialDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "FinancialDocumentItem" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" NUMERIC(12, 2) NOT NULL DEFAULT 1,
    "unitPrice" NUMERIC(14, 2) NOT NULL DEFAULT 0,
    "total" NUMERIC(14, 2) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FinancialDocumentItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FinancialDocument_code_key" ON "FinancialDocument"("code");
CREATE INDEX IF NOT EXISTS "FinancialDocument_companyId_type_status_idx" ON "FinancialDocument"("companyId", "type", "status");
CREATE INDEX IF NOT EXISTS "FinancialDocument_issueDate_idx" ON "FinancialDocument"("issueDate");
CREATE INDEX IF NOT EXISTS "FinancialDocument_createdById_idx" ON "FinancialDocument"("createdById");
CREATE INDEX IF NOT EXISTS "FinancialDocumentItem_documentId_sortOrder_idx" ON "FinancialDocumentItem"("documentId", "sortOrder");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FinancialDocument_companyId_fkey') THEN
        ALTER TABLE "FinancialDocument" ADD CONSTRAINT "FinancialDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FinancialDocument_createdById_fkey') THEN
        ALTER TABLE "FinancialDocument" ADD CONSTRAINT "FinancialDocument_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FinancialDocument_updatedById_fkey') THEN
        ALTER TABLE "FinancialDocument" ADD CONSTRAINT "FinancialDocument_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FinancialDocumentItem_documentId_fkey') THEN
        ALTER TABLE "FinancialDocumentItem" ADD CONSTRAINT "FinancialDocumentItem_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "FinancialDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
