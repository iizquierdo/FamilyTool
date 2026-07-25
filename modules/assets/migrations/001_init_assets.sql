-- Asset catalog (per organization / tenant)
CREATE TABLE IF NOT EXISTS "AssetProduct" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "typeCategoryItemId" TEXT,
    "sku" TEXT,
    "manufacturer" TEXT,
    "model" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssetProduct_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AssetProduct_organizationId_idx" ON "AssetProduct"("organizationId");
CREATE INDEX IF NOT EXISTS "AssetProduct_typeCategoryItemId_idx" ON "AssetProduct"("typeCategoryItemId");

CREATE UNIQUE INDEX IF NOT EXISTS "AssetProduct_organizationId_sku_key"
  ON "AssetProduct"("organizationId", "sku")
  WHERE "sku" IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AssetProduct_organizationId_fkey') THEN
    ALTER TABLE "AssetProduct"
      ADD CONSTRAINT "AssetProduct_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AssetProduct_typeCategoryItemId_fkey') THEN
    ALTER TABLE "AssetProduct"
      ADD CONSTRAINT "AssetProduct_typeCategoryItemId_fkey"
      FOREIGN KEY ("typeCategoryItemId") REFERENCES "CategoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Manuals and other files per catalog product (admin uploads; no User FK)
CREATE TABLE IF NOT EXISTS "AssetProductFile" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'manual',
    "name" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "filePath" TEXT,
    "mimeType" TEXT,
    "fileExt" TEXT,
    "sizeBytes" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "uploadedByAdminEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssetProductFile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AssetProductFile_productId_idx" ON "AssetProductFile"("productId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AssetProductFile_productId_fkey') THEN
    ALTER TABLE "AssetProductFile"
      ADD CONSTRAINT "AssetProductFile_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "AssetProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Physical / logical asset instance
CREATE TABLE IF NOT EXISTS "Asset" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "referenceCompanyId" TEXT,
    "serialNumber" TEXT,
    "assetTag" TEXT,
    "notes" TEXT,
    "statusCategoryItemId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Asset_organizationId_code_key" ON "Asset"("organizationId", "code");
CREATE INDEX IF NOT EXISTS "Asset_organizationId_idx" ON "Asset"("organizationId");
CREATE INDEX IF NOT EXISTS "Asset_productId_idx" ON "Asset"("productId");
CREATE INDEX IF NOT EXISTS "Asset_statusCategoryItemId_idx" ON "Asset"("statusCategoryItemId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Asset_organizationId_fkey') THEN
    ALTER TABLE "Asset"
      ADD CONSTRAINT "Asset_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Asset_productId_fkey') THEN
    ALTER TABLE "Asset"
      ADD CONSTRAINT "Asset_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "AssetProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Asset_referenceCompanyId_fkey') THEN
    ALTER TABLE "Asset"
      ADD CONSTRAINT "Asset_referenceCompanyId_fkey"
      FOREIGN KEY ("referenceCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Asset_statusCategoryItemId_fkey') THEN
    ALTER TABLE "Asset"
      ADD CONSTRAINT "Asset_statusCategoryItemId_fkey"
      FOREIGN KEY ("statusCategoryItemId") REFERENCES "CategoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- N:M asset to companies (row removed when company deleted)
CREATE TABLE IF NOT EXISTS "AssetCompany" (
    "assetId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssetCompany_pkey" PRIMARY KEY ("assetId", "companyId")
);

CREATE INDEX IF NOT EXISTS "AssetCompany_companyId_idx" ON "AssetCompany"("companyId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AssetCompany_assetId_fkey') THEN
    ALTER TABLE "AssetCompany"
      ADD CONSTRAINT "AssetCompany_assetId_fkey"
      FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AssetCompany_companyId_fkey') THEN
    ALTER TABLE "AssetCompany"
      ADD CONSTRAINT "AssetCompany_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
