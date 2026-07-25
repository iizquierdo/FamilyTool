-- FamilyTool: actividades no pagas creadas y auto-asignadas por el propio usuario.
-- Siguen el mismo ciclo de aprobación, pero el puntaje no se fija al crear:
-- lo decide el padre/madre al validar (por defecto 0). Idempotente.
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "selfCreated" BOOLEAN NOT NULL DEFAULT FALSE;
