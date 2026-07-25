---
name: sinapsis-module-references
description: When adding or changing a Sinapsis module that uses numeric Reference sequences, use core templates plus per-company rows and shared helpers.
---

# Sinapsis module references

## Model

- **Core template**: one `Reference` row with `companyId = null` per `(module, code)` (platform-wide template).
- **Per company**: one row per `(companyId, module, code)` with its own counter; created when a **company** is created (clone from core) and when a **module** registers a new template (propagate to all existing companies).
- **Initial counter**: `reference = 0` for new clones and new core rows unless product says otherwise.
- **Reservation**: always use `reserveNextReference` from `api/referenceScope.ts` inside HTTP handlers that have a **non-empty `companyId`**. Never `SELECT`/`UPDATE` `Reference` by `module`/`code` alone.

## Module install (`modules/<name>/install.ts`)

1. Import `ensureCoreReferenceTemplate` and `propagateReferenceTemplateToAllCompanies` from `../../api/referenceScope` relative to the module folder (same pattern as other modules).
2. For each sequence, pick `module` and `code` that are **not already used** by another core template (search repo for `ensureCoreReferenceTemplate` / `"Reference"` / existing `module`+`code`).
3. Call:

   ```ts
   await ensureCoreReferenceTemplate(pool, {
     module: 'MY_MODULE',
     code: 'MY_ENTITY',
     prefix: 'MY-',
     digits: 4,
     reference: 0,
     sufix: '' // optional
   });
   await propagateReferenceTemplateToAllCompanies(pool, 'MY_MODULE', 'MY_ENTITY');
   ```

4. Do **not** hand-write `INSERT INTO "Reference"` in install scripts except through these helpers.

## Module server (code generation)

1. Import `reserveNextReference` from `../../../api/referenceScope.ts` (from `modules/<name>/server`).
2. Resolve **`companyId`** from the same place as the rest of the handler (body, related entity, or `resolveCompanyContextForRequest` / tenant rules).
3. Replace ad-hoc transactions with:

   ```ts
   const code = await reserveNextReference(pool, {
     companyId,
     module: 'MY_MODULE',
     code: 'MY_ENTITY'
   });
   ```

4. Do not use `Number(row.reference || 1)`; zero is a valid stored counter.

## Module uninstall (`uninstall.ts`)

- Delete **all** reference rows for the module’s `module` key, e.g. `DELETE FROM "Reference" WHERE module = $1`, so both core and per-company copies are removed.

## SaaS Admin templates

- Core rows are edited only via **Admin** (`/api/admin/references` and UI under `/admin/settings/references`). Tenant `/api/references` is company-scoped only.

## If something fails at runtime

- Error text *"Missing Reference row for company …"* means that company has no row for that `(module, code)` (e.g. company created before the template existed, and no backfill). Fix by re-running the module install for that environment or adding a one-off propagate/clone step—not by inserting global rows without `companyId`.
