-- Insert default reference for companies
INSERT INTO "Reference" ("id", "module", "code", "reference", "prefix", "digits", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'COMPANY_DEFAULT', 'COMPANY_DEFAULT', 1, 'COM-', 4, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- Insert default reference for users
INSERT INTO "Reference" ("id", "module", "code", "reference", "prefix", "digits", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'USER_DEFAULT', 'USER_DEFAULT', 1, 'USR-', 4, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- Insert default categories for company type
INSERT INTO "Category" ("id", "name", "code", "module", "description", "status", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Company Type', 'COMPANY_TYPE', 'Company', 'Tipos de empresas vinculadas al sistema', 'Active', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- Insert default categories for company category
INSERT INTO "Category" ("id", "name", "code", "module", "description", "status", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Company Category', 'COMPANY_CATEGORY', 'Company', 'Clasificación estratégica de empresas', 'Active', NOW(), NOW())
ON CONFLICT DO NOTHING;
