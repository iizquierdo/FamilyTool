-- FamilyTool: marca si una tarea se dejó "sin asignar" (el padre eligió "— Cualquiera —"
-- al crearla). ownerId sigue siendo NOT NULL (se completa con el creador por compatibilidad),
-- pero este flag distingue esa asignación por defecto de una asignación real, para poder
-- avisar por push a toda la familia cuando se publica una tarea sin dueño específico.
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "unassigned" BOOLEAN NOT NULL DEFAULT FALSE;
