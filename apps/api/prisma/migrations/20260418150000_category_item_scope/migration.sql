-- CategoryItem: tenant / company scope (null,null = system-wide managed by SaaS admin)
ALTER TABLE "CategoryItem" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "CategoryItem" ADD COLUMN "companyId" TEXT;

CREATE INDEX "CategoryItem_categoryId_organizationId_companyId_idx" ON "CategoryItem"("categoryId", "organizationId", "companyId");

ALTER TABLE "CategoryItem" ADD CONSTRAINT "CategoryItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CategoryItem" ADD CONSTRAINT "CategoryItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "CategoryItem_code_key" ON "CategoryItem"("code");
CREATE UNIQUE INDEX "Category_code_key" ON "Category"("code");
