# Deploy en Railway — FamilyTool

Tres servicios en el mismo proyecto de Railway, todos apuntando al **mismo repo de GitHub**:
**Postgres** · **API** (backend) · **PWA** (frontend).

> Cambios de código ya aplicados para que el deploy funcione:
> - El API respeta el `PORT` que inyecta Railway (`apps/api/src/main.ts`).
> - La PWA apunta al API por `VITE_API_BASE_URL` en producción (`apps/pwa/src/api.ts`).
> - Scripts nuevos en el `package.json` raíz: `deploy:prepare`, `start:api`, `start:pwa`, `build:pwa`.

---

## 1) Postgres
Railway → **New** → **Database** → **PostgreSQL**.
Queda disponible la variable `DATABASE_URL` de ese servicio.

## 2) API (backend)
Railway → **New** → **GitHub Repo** → elegí el repo.

- **Settings → Root Directory:** `/` (es un monorepo; el API necesita `modules/` y `packages/`).
  ⚠️ Si Railway ya tiene esto seteado a `apps/api`, cambialo a `/` — si no, `pnpm run` no
  encuentra los scripts de la raíz (error `Missing script`).
- **Settings → Build Command:** `pnpm --filter @sinapsis/api run prisma:generate`
  (⚠️ NO pongas el seed en el build — es destructivo y el cliente de Prisma no existe aún).
- **Settings → Start Command:**
  ```
  pnpm -w run deploy:prepare && pnpm -w run start:api
  ```
  El flag **`-w`** (workspace root) hace que pnpm encuentre los scripts de la raíz del
  monorepo sin importar cuál sea el working directory real del contenedor — es la forma
  robusta de evitar el error `ERR_PNPM_NO_SCRIPT Missing script`.

  `deploy:prepare` es **idempotente** y hace, en orden: `prisma generate` → `prisma migrate deploy`
  → **bootstrap** (siembra los datos iniciales SOLO si la base está vacía) → instala el módulo
  `tasks` → provisiona FamilyTool. Se corre en cada deploy sin romper nada.
- **Variables:**
  | Variable | Valor |
  |---|---|
  | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (referencia al servicio Postgres) |
  | `ADMIN_EMAIL` | tu email de admin de plataforma |
  | `ADMIN_PASSWORD` | una contraseña fuerte |
  | `ADMIN_JWT_SECRET` | un secreto aleatorio largo |
  | `VAPID_PUBLIC_KEY` | (la del `.env`) |
  | `VAPID_PRIVATE_KEY` | (la del `.env`) |
  | `VAPID_SUBJECT` | `mailto:tu@email.com` |
  | `NODE_ENV` | `production` |
  | `PORT` | *(lo inyecta Railway solo)* |
- **Settings → Networking → Generate Domain.** Anotá la URL, ej: `https://familytool-api.up.railway.app`.

## 3) PWA (frontend)
Railway → **New** → **GitHub Repo** → el mismo repo (otro servicio).

- **Root Directory:** `/`
- **Build Command:** `pnpm install && pnpm -w run build:pwa`
- **Start Command:** `pnpm -w run start:pwa`
- **Variables:**
  | Variable | Valor |
  |---|---|
  | `VITE_API_BASE_URL` | la URL pública del **API** (paso 2). ⚠️ Es build-time: si la cambiás, hay que rebuildear. |
- **Networking → Generate Domain.** Esa es la URL de la app para la familia.

---

## 4) Datos iniciales — automático ✅
No hace falta correr nada a mano. En el **primer** deploy, `deploy:prepare` detecta que la base
está vacía y siembra los datos iniciales (una sola vez). En deploys siguientes lo saltea (no
destruye nada).

Crea un admin inicial: **admin@sinapsis.app / Admin1234**.
- ⚠️ **Cambiá esa contraseña apenas entres** (avatar → Editar perfil).

---

## 5) Notas importantes
- **CORS:** el API tiene CORS abierto, así que la PWA (otro dominio) le pega sin problema. La auth es por token Bearer (no cookies), sin líos de cross-site.
- **Web Push:** funciona sobre el HTTPS de Railway con las VAPID keys. En iPhone requiere instalar la PWA (Agregar a inicio, iOS 16.4+).
- **Prisma:** `deploy:prepare` corre `prisma generate` en Railway, así que el binario queda para el SO de Railway (Linux). No dependas del generate local.
- **Crear miembros de la familia (hijos):** hoy la PWA **no** tiene alta de usuarios. Para crear los hijos necesitás el panel web (`apps/web`, que tiene Users/Roles) o llamar a la API `POST /api/users`. Si querés, se puede **agregar el alta de miembros al panel del padre en la PWA** (recomendado para no depender del web).
- **pnpm:** el `packageManager` del `package.json` fija pnpm 10; Railway lo usa vía corepack.
