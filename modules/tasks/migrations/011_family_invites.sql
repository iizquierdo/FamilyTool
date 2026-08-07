-- OrganiHogar: invitaciones para sumar miembros a una familia existente por link
-- (ej. compartido por WhatsApp). Quien lo abre se registra y queda asociado a esa
-- familia directamente, sin crear un tenant nuevo. Idempotente.
CREATE TABLE IF NOT EXISTS "FamilyInvite" (
    "id"          TEXT NOT NULL,
    "companyId"   TEXT NOT NULL,
    "code"        TEXT NOT NULL,
    "createdById" TEXT,
    "isParent"    BOOLEAN NOT NULL DEFAULT FALSE,
    "maxUses"     INTEGER,           -- NULL = ilimitado
    "usesCount"   INTEGER NOT NULL DEFAULT 0,
    "expiresAt"   TIMESTAMP(3),
    "active"      BOOLEAN NOT NULL DEFAULT TRUE,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FamilyInvite_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "FamilyInvite_code_key" ON "FamilyInvite"("code");
CREATE INDEX IF NOT EXISTS "FamilyInvite_companyId_idx" ON "FamilyInvite"("companyId");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FamilyInvite_companyId_fkey') THEN
        ALTER TABLE "FamilyInvite" ADD CONSTRAINT "FamilyInvite_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FamilyInvite_createdById_fkey') THEN
        ALTER TABLE "FamilyInvite" ADD CONSTRAINT "FamilyInvite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
