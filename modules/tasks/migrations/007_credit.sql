-- OrganiHogar: crédito/adelanto de puntos. Cada billetera tiene un límite de crédito
-- (deuda máxima) y una deuda actual. Al ganar puntos se salda la deuda primero. Idempotente.
ALTER TABLE "Wallet" ADD COLUMN IF NOT EXISTS "creditLimit" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Wallet" ADD COLUMN IF NOT EXISTS "creditUsed"  INTEGER NOT NULL DEFAULT 0;
