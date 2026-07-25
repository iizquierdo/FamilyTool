ALTER TABLE "Organization"
ADD COLUMN IF NOT EXISTS "addressAdditional" TEXT,
ADD COLUMN IF NOT EXISTS "zipcode" TEXT,
ADD COLUMN IF NOT EXISTS "city" TEXT,
ADD COLUMN IF NOT EXISTS "state" TEXT,
ADD COLUMN IF NOT EXISTS "country" TEXT,
ADD COLUMN IF NOT EXISTS "baseCurrency" TEXT;

DO $$
DECLARE
    base_currency_category_id TEXT;
BEGIN
    SELECT "id"
    INTO base_currency_category_id
    FROM "Category"
    WHERE "code" = 'BASE_CURRENCY'
    LIMIT 1;

    IF base_currency_category_id IS NULL THEN
        base_currency_category_id := gen_random_uuid()::text;

        INSERT INTO "Category" (
            "id",
            "code",
            "name",
            "description",
            "module",
            "status",
            "sortOrder",
            "sortingRule",
            "createdAt",
            "updatedAt"
        ) VALUES (
            base_currency_category_id,
            'BASE_CURRENCY',
            'Base Currency',
            'Base currencies available for organization localization.',
            'Organization',
            'Active',
            0,
            'Manual',
            NOW(),
            NOW()
        );
    END IF;

    INSERT INTO "CategoryItem" ("id", "code", "name", "description", "status", "sortOrder", "categoryId", "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text, 'USD', 'USD', 'USD base currency', 'Active', 0, base_currency_category_id, NOW(), NOW()
    WHERE NOT EXISTS (
        SELECT 1 FROM "CategoryItem"
        WHERE "categoryId" = base_currency_category_id
          AND ("code" = 'USD' OR "name" = 'USD')
    );

    INSERT INTO "CategoryItem" ("id", "code", "name", "description", "status", "sortOrder", "categoryId", "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text, 'EUR', 'EUR', 'EUR base currency', 'Active', 1, base_currency_category_id, NOW(), NOW()
    WHERE NOT EXISTS (
        SELECT 1 FROM "CategoryItem"
        WHERE "categoryId" = base_currency_category_id
          AND ("code" = 'EUR' OR "name" = 'EUR')
    );

    INSERT INTO "CategoryItem" ("id", "code", "name", "description", "status", "sortOrder", "categoryId", "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text, 'ARS', 'ARS', 'ARS base currency', 'Active', 2, base_currency_category_id, NOW(), NOW()
    WHERE NOT EXISTS (
        SELECT 1 FROM "CategoryItem"
        WHERE "categoryId" = base_currency_category_id
          AND ("code" = 'ARS' OR "name" = 'ARS')
    );

    INSERT INTO "CategoryItem" ("id", "code", "name", "description", "status", "sortOrder", "categoryId", "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text, 'CLP', 'CLP', 'CLP base currency', 'Active', 3, base_currency_category_id, NOW(), NOW()
    WHERE NOT EXISTS (
        SELECT 1 FROM "CategoryItem"
        WHERE "categoryId" = base_currency_category_id
          AND ("code" = 'CLP' OR "name" = 'CLP')
    );
END $$;
