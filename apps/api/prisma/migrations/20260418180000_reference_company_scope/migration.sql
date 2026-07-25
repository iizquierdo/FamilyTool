-- Reference rows: core templates (companyId NULL) + one row per company per (module, code).

-- Deduplicate core rows: keep smallest id per (module, COALESCE(code,''))
DELETE FROM "Reference" a
WHERE a."companyId" IS NULL
  AND EXISTS (
    SELECT 1 FROM "Reference" b
    WHERE b."companyId" IS NULL
      AND b.module = a.module
      AND COALESCE(b.code, '') = COALESCE(a.code, '')
      AND b.id < a.id
  );

-- FK to Company (nullable for core templates)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Reference_companyId_fkey') THEN
    ALTER TABLE "Reference"
      ADD CONSTRAINT "Reference_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- One core template per (module, code)
CREATE UNIQUE INDEX IF NOT EXISTS "Reference_core_module_code_key"
  ON "Reference" (module, COALESCE(code, ''))
  WHERE "companyId" IS NULL;

-- One row per company per (module, code)
CREATE UNIQUE INDEX IF NOT EXISTS "Reference_company_module_code_key"
  ON "Reference" ("companyId", module, COALESCE(code, ''))
  WHERE "companyId" IS NOT NULL;
