-- OrganiHogar: adjuntos de tareas. "attachment" = material de referencia que carga el
-- padre al crear/editar la tarea (ej. foto de ejemplo). "evidence" = fotos/videos que
-- carga el hijo al marcar la tarea como hecha, para que el padre las vea al validar.
CREATE TABLE IF NOT EXISTS "TaskAttachment" (
    "id"           TEXT NOT NULL,
    "taskId"       TEXT NOT NULL,
    "kind"         TEXT NOT NULL DEFAULT 'attachment', -- 'attachment' | 'evidence'
    "fileUrl"      TEXT NOT NULL,
    "filePath"     TEXT,
    "originalName" TEXT,
    "mimeType"     TEXT,
    "fileExt"      TEXT,
    "sizeBytes"    BIGINT NOT NULL DEFAULT 0,
    "uploadedById" TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskAttachment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TaskAttachment_taskId_idx" ON "TaskAttachment"("taskId", "kind");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TaskAttachment_taskId_fkey') THEN
        ALTER TABLE "TaskAttachment" ADD CONSTRAINT "TaskAttachment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TaskAttachment_uploadedById_fkey') THEN
        ALTER TABLE "TaskAttachment" ADD CONSTRAINT "TaskAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
