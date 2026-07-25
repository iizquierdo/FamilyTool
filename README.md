<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Sinapsis CRM/ERP

Monorepo pnpm con frontend y backend separados.

```
apps/
  web/        Vite + React 19 (UI)
  api/        Express + Prisma (HTTP API)
packages/
  shared-types/         Tipos compartidos entre web y api
  module-sdk-client/    Contrato + helpers para la mitad UI de los módulos
  module-sdk-server/    Helpers de tenant, referencias, mailing para módulos
modules/
  <name>/               Plug-and-play: client/ + server/ + migrations/ + install.ts + module.json
```

## Prerrequisitos

- Node.js ≥ 20
- pnpm ≥ 10 (`corepack enable` o `npm i -g pnpm`)
- Docker (para Postgres)

## Arranque

```bash
docker compose up -d
pnpm install
pnpm prisma:migrate         # crea/actualiza el schema
pnpm prisma:seed            # opcional, datos iniciales
pnpm dev                    # arranca web (3599) y api (4099) en paralelo
```

Sólo el front: `pnpm dev:web` · Sólo el back: `pnpm dev:api`.

El dev server de Vite proxea `/api` y `/storage` hacia `http://localhost:4099` (configurable con `VITE_API_PROXY_TARGET`). Postgres corre en el puerto `5544` (base `familytool_db`, configurable con `COMPOSE_PROJECT_PORT` / `POSTGRES_DB`).

## Sistema de módulos (plug-and-play)

Cada módulo vive en `modules/<module-name>` y contiene:

- `module.json` (manifest)
- `migrations/*.sql` (DB migrations específicas del módulo)
- `install.ts` / `uninstall.ts` (hooks de seed/cleanup)
- `client/` (UI: importa `@sinapsis/module-sdk-client`)
- `server/` (API: importa `@sinapsis/module-sdk-server`)

Comandos disponibles (se delegan a `apps/api`):

```bash
pnpm module:list
pnpm module:install -- tasks
pnpm module:status -- tasks
pnpm module:uninstall -- tasks
pnpm module:uninstall -- tasks --purge
```

- `install` aplica sólo las migraciones pendientes (registradas en `_module_migrations`).
- `uninstall` sin `--purge` desactiva el módulo pero conserva los datos.
- `uninstall --purge` elimina los datos/artefactos.

## Convenciones UI

- Los formularios de creación deben abrirse en diálogos modales.
- Ver [AGENTS.md](./AGENTS.md) para la regla y el checklist.
