-- FamilyTool: estado activo/inactivo de los usuarios (ABM). La "baja" es una
-- desactivación (no se borra al usuario ni su historial de tareas/puntos). Idempotente.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT TRUE;
