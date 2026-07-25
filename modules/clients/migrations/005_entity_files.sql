CREATE TABLE IF NOT EXISTS "EntityFile" (
    "id" TEXT NOT NULL,
    "sourceModule" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "filePath" TEXT,
    "mimeType" TEXT,
    "fileExt" TEXT,
    "sizeBytes" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EntityFile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EntityFile_source_idx" ON "EntityFile"("sourceModule", "sourceId", "status");
CREATE INDEX IF NOT EXISTS "EntityFile_createdAt_idx" ON "EntityFile"("createdAt");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EntityFile_createdById_fkey') THEN
        ALTER TABLE "EntityFile" ADD CONSTRAINT "EntityFile_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EntityFile_updatedById_fkey') THEN
        ALTER TABLE "EntityFile" ADD CONSTRAINT "EntityFile_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;
