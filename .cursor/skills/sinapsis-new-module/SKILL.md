---
name: sinapsis-new-module
description: Scaffolds a new Sinapsis disk module under modules/ with module.json, SQL migrations, install/uninstall hooks, tenant API server, optional SaaS admin routes, and conventions that avoid per-module edits in api/admin/router.ts or manual MODULE_ROUTE_CODE_MAP entries. Use when adding a new module, extending modules/, or the user asks how to create or register a module.
---

# Sinapsis: crear un módulo nuevo (disk module)

## Principio de modularidad

- **Todo el código del dominio del módulo** vive bajo `modules/<carpeta>/` (SQL, `install.ts`, `server/`, `client/` opcional).
- **No** se añaden imports por módulo en [`api/admin/router.ts`](../../../api/admin/router.ts): las rutas admin opcionales se cargan con [`api/admin/loadModuleAdminRoutes.ts`](../../../api/admin/loadModuleAdminRoutes.ts).
- **No** se edita a mano el mapa de permisos en [`api/server.ts`](../../../api/server.ts): `MODULE_ROUTE_CODE_MAP` se construye con **`buildModuleRouteCodeMap()`** desde [`api/diskModules.ts`](../../../api/diskModules.ts) usando cada `module.json` → `api.basePath` + `code`.
- Descubrimiento de módulos en disco: **`getDiskModules()`** en `api/diskModules.ts` (no duplicar lógica en otro sitio).

## Estructura de carpetas recomendada

```
modules/<nombre-carpeta>/
  module.json
  install.ts
  uninstall.ts
  migrations/
    001_init_<feature>.sql
  server/
    index.ts              # API tenant (register default export)
    adminRoutes.ts        # opcional: SaaS Admin bajo /api/admin
  client/                 # opcional: UI del módulo en la app tenant
    ...
```

## 1. `module.json` (obligatorio)

- **`name`**, **`code`** (único, mayúsculas en uso interno), **`version`**, **`description`**.
- **`migrations`**: lista de rutas relativas al módulo, p. ej. `"migrations/001_init.sql"`.
- **`entry.api`**: ruta al servidor tenant, p. ej. `"modules/mi-modulo/server/index.ts"`.
- **`entry.ui`** (opcional): componente cliente tenant.
- **`entry.admin`** (opcional): si no usas la ruta por defecto, apunta al archivo admin; por defecto se usa `server/adminRoutes.ts` si existe.
- **`api.basePath`**: prefijo HTTP del módulo tenant, p. ej. `"/api/mi-modulo"` — **necesario** para permisos (`MODULE_ROUTE_CODE_MAP` dinámico).
- **`api.openapiPath`** / **`api.docsPath`** (opcional): documentación OpenAPI del módulo.

Convención de `basePath`: suele ser `/api/<carpeta>` si no hay conflicto.

### Versionado (`version`, SemVer)

- **`version`** es **independiente por carpeta** `modules/<carpeta>/`: no se alinea con releases globales de la app ni con tags del repo salvo decisión explícita de producto.
- **Módulo nuevo**: empezar en **`1.0.0`**.
- **Cada nueva migración SQL** (nuevo archivo bajo `migrations/` **y** nueva entrada en `module.json` → `migrations`): **obligatorio** incrementar `version` (como mínimo **PATCH**).
- Criterio **SemVer** respecto de la **API HTTP del módulo** (rutas bajo `api.basePath` del tenant; cuerpos, códigos, query params y contratos que consumen clientes). Cambios solo en admin (`server/adminRoutes.ts`), UI o SQL sin efecto en ese contrato **no** cuentan para subir MAJOR/MINOR salvo que vayan acompañados de la regla de migración (siempre bump mínimo PATCH al añadir migración).
  - **PATCH** (`x.y.Z`): correcciones o cambios compatibles en la API HTTP; también el bump mínimo cuando solo añadís migración y el contrato HTTP sigue compatible.
  - **MINOR** (`x.Y.z`): nueva funcionalidad en la API HTTP **retrocompatible** (nuevos endpoints, campos opcionales nuevos, etc.).
  - **MAJOR** (`X.y.z`): cambio **rompedor** en la API HTTP (eliminar o renombrar rutas, cambiar forma obligatoria de request/response, códigos de error que rompen integraciones, etc.).

## 2. Migraciones SQL

- Archivos SQL idempotentes cuando sea posible (`CREATE TABLE IF NOT EXISTS`, `DO $$` para FKs).
- Las tablas de dominio del módulo **no** tienen por qué estar en `schema.prisma` si el resto del proyecto usa SQL en módulos (patrón Expenses, Clients, Assets).
- Registrar cada archivo en `module.json` → `migrations`, y **subir `version`** en el mismo cambio (ver versionado arriba).

## 3. `install.ts`

Patrón existente: [`modules/expenses/install.ts`](../../../modules/expenses/install.ts) y [`modules/assets/install.ts`](../../../modules/assets/install.ts).

- Upsert **`SystemModule`** (`code` = `module.json` `code`, `status` Active).
- **Categorías** (si aplica): ítems de **sistema** (`organizationId` / `companyId` null) con `ensureCategoryWithItems` o equivalente; ver skill [sinapsis-dropdown-categories](../sinapsis-dropdown-categories/SKILL.md).
- **Referencias** (si aplica): solo vía `ensureCoreReferenceTemplate` + `propagateReferenceTemplateToAllCompanies`; ver skill [sinapsis-module-references](../sinapsis-module-references/SKILL.md).
- El hook se ejecuta desde `POST /api/modules/install` después de aplicar migraciones (ver [`api/server.ts`](../../../api/server.ts) `maybeRunModuleHook`).

## 4. `uninstall.ts`

- Marcar `SystemModule` como Inactive (patrón actual).
- Si `purgeData`: borrar datos del módulo y filas `Reference` del `module` string acordado; **no** borrar categorías globales salvo decisión explícita de producto.

## 5. `server/index.ts` (API tenant)

- `export default function registerXxxModule({ app, pool, prisma }) { ... }`.
- Montar el router: `app.use('<basePath>', router)` donde `<basePath>` coincide con `module.json` `api.basePath` (o el objeto devuelto `{ basePath, openapiPath, docsPath }` como hacen otros módulos).
- Comprobar módulo activo con `SystemModule` / `code` si el resto del codebase lo hace.
- Auth tenant: token Bearer → `resolveUserIdFromSessionToken` + `resolveTenantAuthContext` desde [`api/categoryTenantContext.ts`](../../../api/categoryTenantContext.ts).
- Permisos: el middleware global usa el `code` del manifiesto para `Permission` / roles (ruta registrada vía `buildModuleRouteCodeMap`).

## 6. `server/adminRoutes.ts` (opcional, SaaS Admin)

- Archivo por defecto: **`modules/<carpeta>/server/adminRoutes.ts`** (o ruta en `entry.admin`).
- Export con nombre **`registerModuleAdminRoutes(router, prisma, pool, uploadMemory)`** o **default** con la misma firma.
- Todas las rutas quedan bajo **`/api/admin/...`** (el `router` ya pasa por `adminOnly` en el core).
- Imports típicos desde el módulo: `../../../api/categoryTenantContext`, `../../../api/referenceScope`, etc. (subir hasta `api/`).

No hace falta tocar [`api/admin/router.ts`](../../../api/admin/router.ts): [`loadModuleAdminRoutes`](../../../api/admin/loadModuleAdminRoutes.ts) importa cada archivo automáticamente.

## 7. Registro y arranque (core ya resuelto)

- **Carga del API tenant**: [`loadServerModules`](../../../api/server.ts) importa `modules/<carpeta>/server/index.ts` según `entry.api`.
- **Mapa de permisos tenant**: `buildModuleRouteCodeMap()` — asegúrate de **`api.basePath`** correcto en `module.json`.
- **Admin**: `createAdminRouter` hace `await loadModuleAdminRoutes(...)`.

## 8. Instalación en entorno

- UI tenant: **Settings → Modules** o `POST /api/modules/install` con `{ "code": "TU_CODE" }`.
- Tras añadir un módulo nuevo al repo, reiniciar el servidor de desarrollo para que Vite/Node recargue imports.

## 9. UI y AGENTS.md

- Formularios de **creación** en la app: en **modal**, no inline ([`AGENTS.md`](../../../AGENTS.md)).
- Pantallas solo SaaS Admin pueden vivir en `components/admin/pages/` o, si se unifica después, bajo `modules/<carpeta>/client/` con una ruta en `AdminApp` (eso es decisión de producto; el patrón mínimo modular es API + install bajo `modules/`).

## 10. Checklist rápido para el agente

1. Crear `modules/<carpeta>/module.json` con `code`, `api.basePath`, `migrations`, `entry.api`, **`version` `1.0.0`** (o bump acorde si extendés un módulo existente).
2. Añadir SQL en `migrations/` y listarlo en el manifest; **actualizar `version`** (cada migración nueva implica bump; SemVer según API HTTP del tenant).
3. Implementar `install.ts` / `uninstall.ts`.
4. Implementar `server/index.ts` y montar en `app` con el `basePath` del manifest.
5. Si hay ABM en `/admin`: `server/adminRoutes.ts` + `registerModuleAdminRoutes`.
6. No añadir filas manuales a `MODULE_ROUTE_CODE_MAP` ni imports de módulos en `api/admin/router.ts`.
7. Probar `POST /api/modules/install` y endpoints tenant/admin.

## Skills relacionadas

- Referencias numéricas: [sinapsis-module-references](../sinapsis-module-references/SKILL.md).
- Categorías / dropdowns: [sinapsis-dropdown-categories](../sinapsis-dropdown-categories/SKILL.md).
