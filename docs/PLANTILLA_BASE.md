# Plantilla base — "Sinapsis CRM/ERP"

> Documentación del template existente sobre el que se construirá **FamilyTool**.
> Generado a partir de una exploración del código (backend, frontend y sistema de módulos).
> Última actualización: 2026-07-24
>
> ⚠️ Esta plantilla es un producto genérico CRM/ERP. FamilyTool la reutiliza como
> **base técnica** (multi-tenant, RBAC, módulos plug-and-play). No todo lo que aquí se
> documenta se usará; ver [ESPECIFICACION_FUNCIONAL.md](./ESPECIFICACION_FUNCIONAL.md)
> para el mapeo FamilyTool ↔ plantilla.

---

## 1. Panorama general

Monorepo **pnpm** (`packageManager pnpm@10`, Node ≥ 20). Nombre interno del paquete raíz:
`sinapsis-app`.

```
apps/
  web/    Vite + React 19 (SPA / UI del tenant + panel /admin)   → puerto dev 3509
  api/    Express 5 + Prisma 7 + Postgres (HTTP API)             → puerto dev 4000
packages/
  shared-types/         Tipos TS compartidos entre web y api
  module-sdk-client/    Contrato UI de los módulos (ModuleClientDefinition)
  module-sdk-server/    Helpers de tenant, numeración y catálogos para módulos
modules/
  <name>/               Módulo plug-and-play: client/ + server/ + migrations/ +
                        install.ts + module.json
```

- **Base de datos:** PostgreSQL (docker-compose incluido, `postgres:15-alpine`).
- **Arranque:** `docker compose up -d` · `pnpm install` · `pnpm prisma:migrate` ·
  `pnpm prisma:seed` (opcional) · `pnpm dev` (web + api en paralelo).
- **Dev proxy:** Vite proxea `/api` y `/storage` → `http://localhost:4000`.

### Convención de UI del proyecto (AGENTS.md)
- **Todos los formularios de creación se abren en un diálogo modal.** No inline.
- Botón de acción primaria claro (`Nuevo`, `Agregar`) que abre el modal, con
  `Cancelar` y `Guardar/Crear`, y refresco de la lista al guardar.

---

## 2. Backend — `apps/api` (`@sinapsis/api`)

ESM ejecutado directo desde TypeScript con `tsx` (sin build). Depende de
`@sinapsis/module-sdk-server` y `@sinapsis/shared-types`.

### 2.1 Arranque
- **`src/main.ts`** — carga `.env` (raíz + override de `apps/api`), importa `./server`,
  `app.listen(port, host)`. Puerto `API_PORT` (default 4000), host `API_HOST` (default 0.0.0.0).
- **`src/server.ts`** — **monolito (~3850 líneas)** que construye y exporta la app Express:
  1. `pg.Pool` desde `DATABASE_URL`; Prisma 7 vía adaptador `PrismaPg`
     (`PrismaClient` cargado con `createRequire` por compatibilidad ESM en Node 20).
  2. Middleware global: `express.json()`, `cors()` (abierto), estáticos en `/storage`.
  3. Monta `/api/public/core` (tema sin auth) y el router `/api/admin`.
  4. Define todas las rutas core inline.
  5. Aplica `moduleAuthorizationMiddleware` por módulo y llama `loadServerModules()`.
  6. Bootstrap de migraciones runtime + autoinstala el módulo `SUBSCRIPTION_PLANS`.
- **`src/paths.ts`** — `REPO_ROOT`, `MODULES_ROOT`, `STORAGE_ROOT`, resolución de manifests.
- ⚠️ **Drift de schema en runtime:** además de Prisma, muchos handlers ejecutan
  `CREATE TABLE/ALTER TABLE IF NOT EXISTS` idempotentes vía SQL crudo
  (`ensureUserColumns`, `ensureOrganizationColumns`, `ensureMenuConfigTables`, etc.).
  Errores se loguean en `apps/api/server-errors.txt`.

### 2.2 Autenticación y autorización (DOS sistemas separados)

**Auth de tenant (app)** — tokens de sesión opacos (no JWT):
- `POST /api/auth/login` — busca usuario por email, **compara password en texto plano**
  ⚠️, genera `sessionToken` (48 bytes hex) guardado en `User.sessionToken`, devuelve `{token, user}`.
- También: `register`, `forgot-password` / `reset-password` (token 1h, email por SMTP),
  `GET /session`, `POST /logout`.
- Token viaja como `Authorization: Bearer <sessionToken>`.
- Handlers protegidos usan `loadTenantAuthContext` → `resolveTenantAuthContext(pool, userId)`
  devolviendo `TenantAuthContext { organizationId, primaryCompanyId, accessCompanyIds }`.
- **Permisos de módulo:** `moduleAuthorizationMiddleware(moduleCode)` mapea método HTTP →
  permiso (GET→canRead, POST→canCreate, PUT/PATCH→canWrite, DELETE→canDelete). Atajo legacy:
  si `User.role` es `administrator/admin`, saltea todos los checks.

**Auth de admin de plataforma (`/admin`)** — token HMAC propio (`src/admin/auth.ts`):
- Credenciales **solo por env** (`ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_JWT_SECRET`), con
  **fallbacks inseguros** ⚠️ (`admin@saas.local` / `change-me` / `replace-with-...`).
- `POST /api/admin/login` → token `base64url(payload).HMAC-SHA256`, TTL 12h. `adminOnly`
  protege todas las rutas admin.

### 2.3 Multi-tenancy
Jerarquía **Organization → Company → User**. Cada org tiene un `subscriptionPlanId`; cada
usuario pertenece a una company (`companyId`) y opcionalmente a varias (`accessCompanyIds`).
- El scope se deriva del **token de sesión**, nunca de IDs enviados por el cliente.
- Toda query filtra por `ctx.organizationId`; acceso a company validado con
  `assertCompanyInTenantScope`.

### 2.4 Sistema de módulos (servidor)
- **Discovery** (`src/diskModules.ts`): `getDiskModules()` escanea `modules/*/module.json`
  (`ModuleManifest`: `name, code, version, migrations[], entry.{api,ui,admin}, api.{basePath,...}`).
- **Montaje de rutas** (`loadServerModules`): importa `entry.api` (default `server/index.ts`),
  llama el **default export** `register({ app, pool, prisma })`, que monta un router y
  devuelve `{ basePath, openapiPath, docsPath }`.
- **Rutas admin por módulo** (`loadModuleAdminRoutes`): importa `server/adminRoutes.ts` →
  `registerModuleAdminRoutes(router, prisma, pool, uploadMemory)` bajo `/api/admin`.
- **Migraciones:** SQL listadas en el manifest, aplicadas idempotentemente contra la tabla
  `_module_migrations` (cada una en transacción).
- **CLI** (`scripts/module-manager.ts`), scripts npm:
  `pnpm module:list | module:install -- <m> | module:uninstall -- <m> [--purge] | module:status -- <m>`.
  También expuesto por HTTP (`/api/modules/*`).

### 2.5 Grupos de endpoints core (`/api`)
- **Público/sin auth:** `/public/core`, `/openapi.json`, `/docs`, `/system/module-apis`.
- **Auth:** `/auth/login|register|forgot-password|reset-password|session|logout`.
- **Organización:** `GET|PUT /organization`.
- **SMTP:** `GET|PUT /smtp-config`, `POST /smtp-config/test`.
- **Módulos:** `/modules`, `/modules/catalog`, `/modules/install`, `/modules/:id/uninstall`.
- **Menú:** `/menu-config` (+ `/groups`, `/items`, `/reorder`).
- **Roles:** `/roles`. **Companies:** `/companies` (+ logo, pdf, status).
- **Categorías / category-items / references.**
- **Users:** `/users` (+ change-password, avatar).
- **Traducciones:** `/translations/overrides`.
- **API pública externa** (token-guarded): `/public/clients`, `/public/notes`, `/public/files`.
- **Router admin** (`/api/admin`): organizations, core (branding), settings, translations,
  categories, references; módulos/menú se redirigen a las rutas legacy.

### 2.6 Dependencias notables (backend)
Express 5, Prisma 7 + adapter-pg + pg, multer (uploads), nodemailer + AWS SES (mail),
jsPDF (PDF server-side), zod (validación), crypto (tokens).

### 2.7 Seed (`prisma/seed.ts`)
**Destructivo** (aborta salvo `ALLOW_DESTRUCTIVE_SEED=true`, borra todo primero). Crea:
plan FREE, org "izk Labs" con 2 companies, 6 SystemModules, 4 roles, 5 usuarios (⚠️
**passwords en texto plano**), categorías, references y el `Core` singleton.

---

## 3. Frontend — `apps/web` (`@sinapsis/web`)

SPA Vite + React 19. Puerto dev **3509**. Consume `@sinapsis/shared-types` y
`@sinapsis/module-sdk-client`. Los módulos se autodescubren en build.

### 3.1 Bootstrap y routing (híbrido)
- `src/index.tsx` — `installFetchRewrite()`, i18n, monta `<App/>` dentro de providers
  (`next-themes`, `HelmetProvider`, loading bar, `Toaster` de Sonner).
- `src/App.tsx` — usa `BrowserRouter` **solo** para dos ramas: `/admin/*` → `<AdminApp/>`
  y `*` → app del tenant. Dentro del tenant la navegación **NO** es por router: es un
  **sistema de vistas custom** con estado `currentView` (`ViewType`), persistido en
  `localStorage` (`sinapsis.app.currentView`). Las vistas se renderizan con una cadena de
  `currentView === 'X' && <Component/>` (estáticas hardcodeadas; features con `React.lazy`).
- **Layout:** `SinapsisShell` (estilo Metronic) dentro de `LayoutProvider`: sidebar +
  header + breadcrumb + `<main>` + footer.

### 3.2 Registry de módulos (cliente)
- `src/module-registry.ts` — `import.meta.glob('../../../modules/*/client/index.ts', {eager:true})`;
  cada default export es un `ModuleClientDefinition`, dedup por `code`. `getClientModules()`.
- **Doble gating de activación:** (a) `activeModuleCodes` desde `/api/modules` (status Active),
  (b) permiso de lectura por usuario (`readableModuleCodes`). Las `views` de módulos activos
  se aplanan en `dynamicModuleViews[currentView]`.

### 3.3 Auth UI y capa de API
- `components/AuthFlow.tsx` — login/registro/reset (prefill dev `admin@sinapsis.app`/`Admin1234`).
- Token en `localStorage` (`sinapsis.auth.session`), validado con `GET /api/auth/session`.
- **Inyección de token:** monkey-patch global de `window.fetch` que añade `Authorization: Bearer`
  y `X-User-Id` a `/api/*` (excepto `/api/admin/*`). `lib/api-base.ts` prefija `API_BASE` en prod.

### 3.4 Menú dinámico (desde DB)
`GET /api/menu-config` → grupos con `placement` (`sidebar|header|footer`) e items con
`targetType` (`STATIC_VIEW|MODULE_VIEW|EXTERNAL_URL`). Tres renderers: `Sidebar.tsx`
(rail de iconos + panel), `AppHeaderNav.tsx`, `footer.tsx`. El sidebar además tiene el
switcher de organización/company.

### 3.5 Theming / branding
- **Tokens estáticos:** Tailwind v4 + variables CSS en `styles/globals.css` (`--primary`,
  `--brand`, etc.). Dark mode por `next-themes` (clase `.dark`). Marca default rojo `#eb4d4b`.
- **Branding runtime:** `GET /api/public/core` inyecta colores/logo/favicon/idioma/formatos
  en `document.documentElement` antes del login.

### 3.6 Panel admin (`/admin`)
SPA separada (`components/admin/`) con router y sesión propios (`sinapsis.admin.session`,
`adminFetch`). Páginas: Organizations, SubscriptionPlans, Assets, y settings (Modules, SMTP,
Storage, Translations, Menus, Configuration, Categories, References).

### 3.7 i18n
`i18next` + `react-i18next`, idiomas `en`/`es`. Merge de traducciones de módulos activos
(`mergeModuleTranslations`) y overrides runtime desde `/api/translations/overrides`.

### 3.8 Dependencias notables (frontend)
`react-router-dom` v7, `@tanstack/react-query` + `react-table`, `recharts`/`apexcharts`,
UI shadcn-style sobre `radix-ui` + `react-aria` (`components/ui/*`), `react-hook-form` + `zod`,
`@dnd-kit` + `@hello-pangea/dnd` (kanban), `sonner`, `date-fns`, `jspdf`, `leaflet`,
`@google/genai` (card de "AI Insights" con `gemini-3-flash-preview`).

> ⚠️ Notas de higiene: hay logs de debug dejados en `App.tsx`/`AuthFlow.tsx`, datos mock
> en el Dashboard (no conectados a la API) y libs i18n redundantes.

---

## 4. Sistema de módulos — contrato

### 4.1 SDK cliente (`packages/module-sdk-client`)
Un módulo registra su UI con un **`ModuleClientDefinition`** (default export de
`modules/<name>/client/index.ts`):
- `code` — coincide con `SystemModule.code`.
- `mainNav: { id, icon }` — icono FontAwesome del rail.
- `views: Partial<Record<ViewType, (ctx) => JSX.Element>>` — **corazón del contrato**:
  mapa `viewKey → render`. `ModuleRenderContext = { setView, currentUser, companyId, onSubTitleChange }`.
- `sidebarSections`, `breadcrumbs?`, `translations?` (por locale).
- **Patrón real:** un único componente React con prop `view`, envuelto una vez por vista.

### 4.2 SDK servidor (`packages/module-sdk-server`)
Provee **tenant scoping, catálogos y numeración** (no hay helper de mailing):
- `moduleContext.ts` — tipos `ModuleApiContext { app, pool }`, `InstallContext`, `UninstallContext`.
- `categoryTenantContext.ts` — `resolveUserIdFromSessionToken`, `resolveTenantAuthContext`,
  `userCanAccessCompany`, `resolveCompanyContextForRequest`, y merge de `CategoryItem` en
  3 niveles (sistema/org/company) para dropdowns (`fetchMergedItemsByCategoryCodes`).
- `referenceScope.ts` — numeración legible por company sobre la tabla `Reference`:
  `formatReferenceCode`, `ensureCoreReferenceTemplate`, `reserveNextReference` (transaccional).
- **Flujo de registro:** cada `server/index.ts` default-exporta `register({ app, pool, prisma })`,
  arma un `express.Router()`, y cada ruta llama `ensureActive()` (409 si el módulo está inactivo).

### 4.3 Los 7 módulos existentes

| Módulo | Code | UI tenant | Propósito |
|--------|------|-----------|-----------|
| **tasks** | `TASKS` | ✅ | Planificación de tareas: lista, calendario, kanban, compartir |
| **clients** | `CLIENTS` | ✅ | Gestión de clientes y su ciclo de vida |
| **crm** | `CRM` | ✅ | Pipeline de oportunidades + actividades |
| **expenses** | `EXPENSES` | ✅ | Gastos, recurrencias, monedas y tipos de cambio |
| **financial-documents** | `FIN_DOCS` | ✅ | Facturas, notas, órdenes de compra, recibos, remitos |
| **assets** | `ASSETS` | ❌ (solo admin) | Catálogo de activos e instancias multi-company |
| **subscription-plans** | `SUBSCRIPTION_PLANS` | ❌ (solo admin) | Catálogo de planes SaaS + asignación por org |

#### Módulo `tasks` (el más relevante para FamilyTool)
- **Tablas:**
  - `Task`: `id`, `code` (único, vía `reserveNextReference`), `title`, `description`,
    `status` (default `Todo`), `priority` (default `Medium`), `category`, `startDate`,
    `dueDate`, `completedAt`, `visibility` (`Private`/`Shared`), `companyId`, `createdById`,
    `ownerId`, timestamps.
  - `TaskShare`: join `taskId`×`userId` (compartir tareas), único `(taskId,userId)`.
- **Endpoints** (`/api/tasks`): `GET /meta`, `GET /` (filtros `mode=my|shared|all`, status,
  priority, search, from/to), `GET /:id`, `POST /`, `PUT /:id`, `PATCH /:id/status`
  (auto `completedAt` cuando pasa a `Done`), `DELETE /:id`, `/openapi.json`, `/docs`.
- **UI** (`client/TaskModule.tsx`): un componente con prop `view`, 4 vistas registradas:
  `Tasks` (lista), `TaskCalendar` (mes), `Kanban` (drag & drop por status con persistencia
  optimista), `TaskDetails`. Modal de crear/editar con owner + "compartir con" multiusuario.

*(Detalle de los otros 6 módulos disponible en el mapeo interno; se documentan bajo demanda
cuando se decida cuáles reutilizar o quitar en FamilyTool.)*

### 4.4 Convenciones transversales
- Todo route de tenant valida `ensureActive()` (status del `SystemModule`).
- Los `code` legibles vienen del sistema de `Reference` (`reserveNextReference`).
- Metadata de dropdowns (`/meta`) desde el catálogo `CategoryItem` mergeado en 3 niveles.
- Cliente data-driven: un componente por módulo, multiplexado en varias `views`.

---

## 5. Modelo de datos core (Prisma)

Modelos en `apps/api/prisma/schema.prisma`:
`Organization`, `SubscriptionPlan`, `Core` (singleton branding), `Company`, `Category`,
`CategoryItem`, `User`, `SystemModule`, `Role`, `Permission`, `Reference`, `MenuGroup`,
`MenuItem`, `PlatformSetting`, `TranslationOverride`.
(Las tablas de cada módulo — `Task`, `Client`, `CrmOpportunity`, etc. — se crean por
migraciones SQL del módulo, fuera del schema Prisma.)

---

## 6. Riesgos / deuda técnica a tener en cuenta

- 🔴 **Passwords en texto plano** (login y seed). Hay que introducir hashing (bcrypt/argon2).
- 🔴 **Credenciales admin con fallback conocido** si faltan las env vars.
- 🟠 `cors()` totalmente abierto; tokens de sesión sin expiración/rotación.
- 🟠 `server.ts` monolítico (~3850 líneas) mezcla routing, DDL runtime y lógica.
- 🟡 Logs de debug y datos mock dejados en el frontend.
