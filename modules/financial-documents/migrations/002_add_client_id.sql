ALTER TABLE "FinancialDocument" ADD COLUMN IF NOT EXISTS "clientId" TEXT;
CREATE INDEX IF NOT EXISTS "FinancialDocument_clientId_idx" ON "FinancialDocument"("clientId");
