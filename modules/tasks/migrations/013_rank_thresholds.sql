-- FamilyTool: umbrales de rango (XP) configurables por familia. NULL = usar los
-- rangos por defecto (RANKS en server/family.ts). Idempotente.
ALTER TABLE "FamilyConfig" ADD COLUMN IF NOT EXISTS "rankThresholds" JSONB;
