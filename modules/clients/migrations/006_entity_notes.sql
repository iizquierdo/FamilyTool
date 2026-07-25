CREATE TABLE IF NOT EXISTS "EntityNote" (
    "id" TEXT NOT NULL,
    "sourceModule" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EntityNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EntityNote_source_idx" ON "EntityNote"("sourceModule", "sourceId", "status");
CREATE INDEX IF NOT EXISTS "EntityNote_createdAt_idx" ON "EntityNote"("createdAt");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EntityNote_createdById_fkey') THEN
        ALTER TABLE "EntityNote" ADD CONSTRAINT "EntityNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EntityNote_updatedById_fkey') THEN
        ALTER TABLE "EntityNote" ADD CONSTRAINT "EntityNote_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;
