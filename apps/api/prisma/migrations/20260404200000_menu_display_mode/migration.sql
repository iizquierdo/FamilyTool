ALTER TABLE "MenuGroup" ADD COLUMN IF NOT EXISTS "displayMode" TEXT NOT NULL DEFAULT 'icon_and_text';
ALTER TABLE "MenuItem" ADD COLUMN IF NOT EXISTS "displayMode" TEXT NOT NULL DEFAULT 'icon_and_text';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'MenuGroup' AND column_name = 'showLabel'
  ) THEN
    UPDATE "MenuGroup" SET "displayMode" = 'icon_only' WHERE "showLabel" = false;
    UPDATE "MenuItem" SET "displayMode" = 'icon_only' WHERE "showLabel" = false;
    ALTER TABLE "MenuGroup" DROP COLUMN "showLabel";
    ALTER TABLE "MenuItem" DROP COLUMN "showLabel";
  END IF;
END $$;
