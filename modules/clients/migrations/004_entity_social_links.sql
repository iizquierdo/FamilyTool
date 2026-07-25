CREATE TABLE IF NOT EXISTS "EntitySocialLink" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "categoryItemId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EntitySocialLink_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EntitySocialLink_entity_idx" ON "EntitySocialLink"("entityType", "entityId", "status");
CREATE INDEX IF NOT EXISTS "EntitySocialLink_categoryItem_idx" ON "EntitySocialLink"("categoryItemId");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EntitySocialLink_categoryItemId_fkey') THEN
        ALTER TABLE "EntitySocialLink" ADD CONSTRAINT "EntitySocialLink_categoryItemId_fkey" FOREIGN KEY ("categoryItemId") REFERENCES "CategoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EntitySocialLink_createdById_fkey') THEN
        ALTER TABLE "EntitySocialLink" ADD CONSTRAINT "EntitySocialLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EntitySocialLink_updatedById_fkey') THEN
        ALTER TABLE "EntitySocialLink" ADD CONSTRAINT "EntitySocialLink_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;
