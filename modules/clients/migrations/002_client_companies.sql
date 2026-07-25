CREATE TABLE IF NOT EXISTS "ClientCompany" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClientCompany_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ClientCompany_clientId_companyId_key" ON "ClientCompany"("clientId", "companyId");
CREATE INDEX IF NOT EXISTS "ClientCompany_companyId_idx" ON "ClientCompany"("companyId");
CREATE INDEX IF NOT EXISTS "ClientCompany_clientId_idx" ON "ClientCompany"("clientId");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ClientCompany_clientId_fkey') THEN
        ALTER TABLE "ClientCompany" ADD CONSTRAINT "ClientCompany_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ClientCompany_companyId_fkey') THEN
        ALTER TABLE "ClientCompany" ADD CONSTRAINT "ClientCompany_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

INSERT INTO "ClientCompany" ("id", "clientId", "companyId", "isPrimary", "createdAt")
SELECT gen_random_uuid()::text, c.id, c."companyId", true, NOW()
FROM "Client" c
WHERE c."companyId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "ClientCompany" cc
    WHERE cc."clientId" = c.id
      AND cc."companyId" = c."companyId"
  );
