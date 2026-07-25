-- Imagen de fondo opcional para la pantalla de login (URL en storage local u otro origen).
ALTER TABLE "Core" ADD COLUMN IF NOT EXISTS "loginBackgroundUrl" TEXT;
