-- For every existing company, create Reference rows cloned from core templates (companyId IS NULL)
-- when that company does not already have a row for the same (module, code).
-- Counter starts at 0 so tenant UIs and reserveNextReference work for legacy companies.

INSERT INTO "Reference" (id, "companyId", module, code, reference, prefix, sufix, digits, clone, "createdAt", "updatedAt")
SELECT gen_random_uuid(), c.id, r.module, r.code, 0, r.prefix, r.sufix, r.digits, r.clone, NOW(), NOW()
FROM "Company" c
CROSS JOIN "Reference" r
WHERE r."companyId" IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "Reference" x
    WHERE x."companyId" = c.id
      AND x.module = r.module
      AND COALESCE(x.code, '') = COALESCE(r.code, '')
  );
