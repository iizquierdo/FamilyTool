-- Menu locations: sidebar (default), header, footer
ALTER TABLE "MenuGroup" ADD COLUMN IF NOT EXISTS "placement" TEXT NOT NULL DEFAULT 'sidebar';

ALTER TABLE "MenuGroup" DROP CONSTRAINT IF EXISTS "MenuGroup_key_key";

CREATE UNIQUE INDEX IF NOT EXISTS "MenuGroup_key_placement_key" ON "MenuGroup"("key", "placement");
