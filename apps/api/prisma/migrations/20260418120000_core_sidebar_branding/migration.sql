-- Reemplaza icono FA de barra de menú por branding del rail izquierdo (color + logo opcional).

ALTER TABLE "Core" ADD COLUMN IF NOT EXISTS "sidebarBackgroundColor" TEXT NOT NULL DEFAULT '#000000';
ALTER TABLE "Core" ADD COLUMN IF NOT EXISTS "sidebarLogoUrl" TEXT;

ALTER TABLE "Core" DROP COLUMN IF EXISTS "menuBarIcon";
