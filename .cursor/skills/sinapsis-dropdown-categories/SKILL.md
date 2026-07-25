---
name: sinapsis-dropdown-categories
description: Use scoped Category / CategoryItem data for dropdowns in Sinapsis (system vs tenant vs company merge).
---

# Sinapsis: dropdowns desde categorías

## Modelo mental

- **`Category`**: definición global del dropdown (código estable `code`, módulo, etc.). Solo el **SaaS Admin** (`/admin`, API `/api/admin/...`) crea/edita/borra categorías.
- **`CategoryItem`**: opciones del selector.
  - **Sistema**: `organizationId` y `companyId` en `null` → visibles para todos los tenants; el tenant **no** puede mutarlas.
  - **Tenant (todas las compañías)**: `organizationId` = org del usuario, `companyId` `null`.
  - **Por compañía**: mismo `organizationId`, `companyId` = compañía concreta.
- **Orden**: misma lista mergeada ordenada por `sortOrder` global (y `id` de desempate en API).
- **Códigos de ítem**: `CategoryItem.code` es **único global** (obligatorio al crear ítems desde tenant).

## API tenant (app principal)

- Listado de categorías: `GET /api/categories?companyId=<opcional>` (sesión Bearer obligatoria).
- Ítems mergeados para una categoría: `GET /api/categories/:categoryId?companyId=<opcional>`.
  - Sin `companyId`: sistema + ítems del tenant sin compañía específica.
  - Con `companyId`: además ítems del tenant asignados a esa compañía (debe ser accesible por el usuario).
- Mutación de ítems del tenant: `POST/PUT/DELETE /api/category-items` (no usar para ítems sistema).

## API SaaS Admin

- CRUD categorías e ítems **solo sistema** (`organizationId` y `companyId` null): prefijo `/api/admin/categories`, `/api/admin/category-items`, etc., con token admin.

## Módulos (meta / SQL)

- Los endpoints `*/meta` que alimentan dropdowns deben usar la misma semántica de merge (ver `api/categoryTenantContext.ts`: `fetchMergedCategoryItems`, `fetchMergedItemsByCategoryCodes`).
- Pasar `userId` (y `companyId` cuando aplique) en query para resolver org y compañía.

## Frontend

- No hardcodear listas si existe categoría por `code` (salvo casos no catalogados, p. ej. timezones).
- Incluir `companyId` de la compañía activa del shell al pedir `/api/categories/:id` cuando el selector dependa del contexto de compañía.

## Archivos de referencia

- Esquema: `prisma/schema.prisma` (`Category`, `CategoryItem`).
- Merge y auth tenant: `api/categoryTenantContext.ts`.
- Rutas tenant: `api/server.ts` (sección Categories).
- Rutas admin: `api/admin/router.ts`.
- UI tenant: `components/SettingsModule.tsx`, tablas en `components/settings/CategoriesSettingsTable.tsx`.
- UI admin: `components/admin/pages/CategoriesPage.tsx`.
