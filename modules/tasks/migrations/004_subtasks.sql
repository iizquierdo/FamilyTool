-- OrganiHogar: subtareas con puntos propios. Cada subtarea puede aprobarse o no al validar;
-- solo las aprobadas pagan sus puntos. Idempotente.

CREATE TABLE IF NOT EXISTS "TaskSubtask" (
    "id"          TEXT NOT NULL,
    "taskId"      TEXT NOT NULL,
    "title"       TEXT NOT NULL,
    "description" TEXT,
    "points"      INTEGER NOT NULL DEFAULT 0,   -- recompensa de la subtarea (MONEY si la tarea es paga, XP si es responsabilidad)
    "sortOrder"   INTEGER NOT NULL DEFAULT 0,
    "doneByChild" BOOLEAN NOT NULL DEFAULT FALSE, -- el que hace la tarea marca la subtarea como hecha
    "approved"    BOOLEAN,                         -- NULL=sin evaluar, TRUE=aprobada (paga), FALSE=rechazada (no paga)
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskSubtask_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TaskSubtask_taskId_idx" ON "TaskSubtask"("taskId", "sortOrder");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TaskSubtask_taskId_fkey') THEN
        ALTER TABLE "TaskSubtask" ADD CONSTRAINT "TaskSubtask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
