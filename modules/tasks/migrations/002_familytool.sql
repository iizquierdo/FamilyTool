-- OrganiHogar: extiende el módulo Tasks con economía familiar, ciclo de vida de tareas,
-- billetera, transferencias, retiros y metas familiares. Idempotente.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Extensión de la tabla Task
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "taskKind"       TEXT NOT NULL DEFAULT 'Responsibility'; -- 'Paid' | 'Responsibility'
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "rewardPoints"   INTEGER NOT NULL DEFAULT 0;             -- Monedas ($) para tareas pagas
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "rewardXp"       INTEGER NOT NULL DEFAULT 0;             -- Reputación/XP (responsabilidades)
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "lifecycle"      TEXT NOT NULL DEFAULT 'creada';         -- creada|en_espera|doing|done|aprobada|finalizada
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "availableUntil" TIMESTAMP(3);                           -- fin de la cuenta regresiva (en_espera)
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "takenById"      TEXT;                                   -- quién la tomó
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "takenAt"        TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "submittedAt"    TIMESTAMP(3);                           -- marcada como realizada (done)
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "validatorId"    TEXT;                                   -- validador delegado (opcional)
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "validatedById"  TEXT;                                   -- quién validó
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "validatedAt"    TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "rejectedReason" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "familyGoalId"   TEXT;                                   -- meta a la que aporta (opcional)

CREATE INDEX IF NOT EXISTS "Task_lifecycle_idx"    ON "Task"("companyId", "lifecycle");
CREATE INDEX IF NOT EXISTS "Task_taskKind_idx"     ON "Task"("companyId", "taskKind");
CREATE INDEX IF NOT EXISTS "Task_takenById_idx"    ON "Task"("takenById");
CREATE INDEX IF NOT EXISTS "Task_availableUntil_idx" ON "Task"("availableUntil");

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Billetera (saldo por usuario) — dos monedas: MONEY ($) y XP (reputación)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Wallet" (
    "id"          TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "companyId"   TEXT NOT NULL,
    "moneyPoints" INTEGER NOT NULL DEFAULT 0,
    "xpPoints"    INTEGER NOT NULL DEFAULT 0,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Wallet_userId_key"     ON "Wallet"("userId");
CREATE INDEX        IF NOT EXISTS "Wallet_companyId_idx"  ON "Wallet"("companyId");

-- Historial de movimientos de la billetera (fuente de verdad auditable)
CREATE TABLE IF NOT EXISTS "WalletLedger" (
    "id"          TEXT NOT NULL,
    "walletId"    TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "companyId"   TEXT NOT NULL,
    "currency"    TEXT NOT NULL,            -- 'MONEY' | 'XP'
    "amount"      INTEGER NOT NULL,         -- con signo (+ acredita, - debita)
    "balanceAfter" INTEGER NOT NULL,
    "reason"      TEXT NOT NULL,            -- task_reward|transfer_in|transfer_out|withdrawal|mint|goal_contribution|adjustment
    "refType"     TEXT,
    "refId"       TEXT,
    "note"        TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WalletLedger_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "WalletLedger_walletId_idx"  ON "WalletLedger"("walletId", "createdAt");
CREATE INDEX IF NOT EXISTS "WalletLedger_companyId_idx" ON "WalletLedger"("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "WalletLedger_userId_idx"    ON "WalletLedger"("userId");

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Configuración de la familia (por company): tasa de conversión + reglas
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "FamilyConfig" (
    "companyId"                     TEXT NOT NULL,
    "pointsPerUnit"                 INTEGER NOT NULL DEFAULT 100,   -- puntos ($) por 1 unidad de dinero
    "currency"                      TEXT NOT NULL DEFAULT 'USD',
    "minWithdrawalPoints"           INTEGER NOT NULL DEFAULT 0,
    "requireResponsibilitiesUpToDate" BOOLEAN NOT NULL DEFAULT TRUE, -- candado pedagógico
    "createdAt"                     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"                     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FamilyConfig_pkey" PRIMARY KEY ("companyId")
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Retiros (canje de puntos por dinero) con snapshot de conversión
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Withdrawal" (
    "id"             TEXT NOT NULL,
    "userId"         TEXT NOT NULL,
    "companyId"      TEXT NOT NULL,
    "points"         INTEGER NOT NULL,
    "pointsPerUnit"  INTEGER NOT NULL,        -- snapshot de la tasa al solicitar
    "currency"       TEXT NOT NULL,           -- snapshot
    "moneyAmount"    NUMERIC(14,2) NOT NULL,  -- snapshot: points / pointsPerUnit
    "status"         TEXT NOT NULL DEFAULT 'pending', -- pending|approved|rejected|cancelled
    "approvedById"   TEXT,
    "approvedAt"     TIMESTAMP(3),
    "rejectedReason" TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Withdrawal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Withdrawal_userId_idx"           ON "Withdrawal"("userId");
CREATE INDEX IF NOT EXISTS "Withdrawal_companyId_status_idx" ON "Withdrawal"("companyId", "status");

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Transferencias P2P (solo puntos MONEY) — visibles para el padre
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Transfer" (
    "id"          TEXT NOT NULL,
    "companyId"   TEXT NOT NULL,
    "fromUserId"  TEXT NOT NULL,
    "toUserId"    TEXT NOT NULL,
    "points"      INTEGER NOT NULL,
    "note"        TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Transfer_companyId_idx" ON "Transfer"("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "Transfer_fromUserId_idx" ON "Transfer"("fromUserId");
CREATE INDEX IF NOT EXISTS "Transfer_toUserId_idx"   ON "Transfer"("toUserId");

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Metas familiares (alimentadas por XP) + contribuciones por usuario
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "FamilyGoal" (
    "id"          TEXT NOT NULL,
    "companyId"   TEXT NOT NULL,
    "title"       TEXT NOT NULL,
    "description" TEXT,
    "targetXp"    INTEGER NOT NULL DEFAULT 0,
    "currentXp"   INTEGER NOT NULL DEFAULT 0,
    "status"      TEXT NOT NULL DEFAULT 'Active', -- Active|Reached|Archived
    "imageUrl"    TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FamilyGoal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "FamilyGoal_companyId_status_idx" ON "FamilyGoal"("companyId", "status");

CREATE TABLE IF NOT EXISTS "FamilyGoalContribution" (
    "id"           TEXT NOT NULL,
    "goalId"       TEXT NOT NULL,
    "userId"       TEXT NOT NULL,
    "companyId"    TEXT NOT NULL,
    "xp"           INTEGER NOT NULL,
    "sourceTaskId" TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FamilyGoalContribution_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "FamilyGoalContribution_goalId_idx" ON "FamilyGoalContribution"("goalId");
CREATE INDEX IF NOT EXISTS "FamilyGoalContribution_userId_idx" ON "FamilyGoalContribution"("userId");

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Claves foráneas (guardadas para idempotencia)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Task_takenById_fkey') THEN
        ALTER TABLE "Task" ADD CONSTRAINT "Task_takenById_fkey" FOREIGN KEY ("takenById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Task_validatedById_fkey') THEN
        ALTER TABLE "Task" ADD CONSTRAINT "Task_validatedById_fkey" FOREIGN KEY ("validatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Wallet_userId_fkey') THEN
        ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Wallet_companyId_fkey') THEN
        ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WalletLedger_walletId_fkey') THEN
        ALTER TABLE "WalletLedger" ADD CONSTRAINT "WalletLedger_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FamilyConfig_companyId_fkey') THEN
        ALTER TABLE "FamilyConfig" ADD CONSTRAINT "FamilyConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Withdrawal_userId_fkey') THEN
        ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Withdrawal_companyId_fkey') THEN
        ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Transfer_companyId_fkey') THEN
        ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Transfer_fromUserId_fkey') THEN
        ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Transfer_toUserId_fkey') THEN
        ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FamilyGoal_companyId_fkey') THEN
        ALTER TABLE "FamilyGoal" ADD CONSTRAINT "FamilyGoal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FamilyGoalContribution_goalId_fkey') THEN
        ALTER TABLE "FamilyGoalContribution" ADD CONSTRAINT "FamilyGoalContribution_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "FamilyGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FamilyGoalContribution_userId_fkey') THEN
        ALTER TABLE "FamilyGoalContribution" ADD CONSTRAINT "FamilyGoalContribution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Task_familyGoalId_fkey') THEN
        ALTER TABLE "Task" ADD CONSTRAINT "Task_familyGoalId_fkey" FOREIGN KEY ("familyGoalId") REFERENCES "FamilyGoal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
