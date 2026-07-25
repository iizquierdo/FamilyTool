-- FamilyTool: tareas recurrentes (RRULE, estilo Google Calendar). Una "recurrencia" es
-- una plantilla que genera instancias de Task cuando llega cada ocurrencia. Idempotente.

CREATE TABLE IF NOT EXISTS "TaskRecurrence" (
    "id"                TEXT NOT NULL,
    "companyId"         TEXT NOT NULL,
    "createdById"       TEXT NOT NULL,
    "ownerId"           TEXT,
    "title"             TEXT NOT NULL,
    "description"       TEXT,
    "taskKind"          TEXT NOT NULL DEFAULT 'Responsibility',
    "rewardPoints"      INTEGER NOT NULL DEFAULT 0,
    "rewardXp"          INTEGER NOT NULL DEFAULT 0,
    "familyGoalId"      TEXT,
    "subtasks"          JSONB,
    "rrule"             TEXT NOT NULL,          -- ej: FREQ=WEEKLY;BYDAY=MO,WE
    "startDate"         DATE NOT NULL,
    "endDate"           DATE,
    "lastGeneratedDate" DATE,
    "active"            BOOLEAN NOT NULL DEFAULT TRUE,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskRecurrence_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TaskRecurrence_companyId_idx" ON "TaskRecurrence"("companyId", "active");

ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "recurrenceId"   TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "occurrenceDate" DATE;
-- Evita duplicar la instancia de una misma ocurrencia.
CREATE UNIQUE INDEX IF NOT EXISTS "Task_recurrence_occ_key" ON "Task"("recurrenceId", "occurrenceDate") WHERE "recurrenceId" IS NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TaskRecurrence_companyId_fkey') THEN
        ALTER TABLE "TaskRecurrence" ADD CONSTRAINT "TaskRecurrence_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Task_recurrenceId_fkey') THEN
        ALTER TABLE "Task" ADD CONSTRAINT "Task_recurrenceId_fkey" FOREIGN KEY ("recurrenceId") REFERENCES "TaskRecurrence"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
