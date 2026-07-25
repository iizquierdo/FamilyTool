CREATE TABLE IF NOT EXISTS "CrmOpportunity" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'Lead',
    "status" TEXT NOT NULL DEFAULT 'Open',
    "source" TEXT,
    "amount" NUMERIC(14, 2) NOT NULL DEFAULT 0,
    "probability" INTEGER NOT NULL DEFAULT 0,
    "expectedCloseDate" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CrmOpportunity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CrmActivity" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'Task',
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "details" TEXT,
    "assignedToId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CrmActivity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CrmOpportunity_code_key" ON "CrmOpportunity"("code");
CREATE INDEX IF NOT EXISTS "CrmOpportunity_companyId_stage_idx" ON "CrmOpportunity"("companyId", "stage");
CREATE INDEX IF NOT EXISTS "CrmOpportunity_companyId_status_idx" ON "CrmOpportunity"("companyId", "status");
CREATE INDEX IF NOT EXISTS "CrmOpportunity_clientId_idx" ON "CrmOpportunity"("clientId");
CREATE INDEX IF NOT EXISTS "CrmOpportunity_ownerId_idx" ON "CrmOpportunity"("ownerId");
CREATE INDEX IF NOT EXISTS "CrmOpportunity_expectedCloseDate_idx" ON "CrmOpportunity"("expectedCloseDate");

CREATE UNIQUE INDEX IF NOT EXISTS "CrmActivity_code_key" ON "CrmActivity"("code");
CREATE INDEX IF NOT EXISTS "CrmActivity_companyId_status_dueDate_idx" ON "CrmActivity"("companyId", "status", "dueDate");
CREATE INDEX IF NOT EXISTS "CrmActivity_opportunityId_idx" ON "CrmActivity"("opportunityId");
CREATE INDEX IF NOT EXISTS "CrmActivity_assignedToId_dueDate_idx" ON "CrmActivity"("assignedToId", "dueDate");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CrmOpportunity_clientId_fkey') THEN
        ALTER TABLE "CrmOpportunity" ADD CONSTRAINT "CrmOpportunity_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CrmOpportunity_companyId_fkey') THEN
        ALTER TABLE "CrmOpportunity" ADD CONSTRAINT "CrmOpportunity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CrmOpportunity_ownerId_fkey') THEN
        ALTER TABLE "CrmOpportunity" ADD CONSTRAINT "CrmOpportunity_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CrmOpportunity_createdById_fkey') THEN
        ALTER TABLE "CrmOpportunity" ADD CONSTRAINT "CrmOpportunity_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CrmOpportunity_updatedById_fkey') THEN
        ALTER TABLE "CrmOpportunity" ADD CONSTRAINT "CrmOpportunity_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CrmActivity_opportunityId_fkey') THEN
        ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "CrmOpportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CrmActivity_companyId_fkey') THEN
        ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CrmActivity_assignedToId_fkey') THEN
        ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CrmActivity_createdById_fkey') THEN
        ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CrmActivity_updatedById_fkey') THEN
        ALTER TABLE "CrmActivity" ADD CONSTRAINT "CrmActivity_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;
