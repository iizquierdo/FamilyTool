# OrganiHogar — Plan de construcción

> Cómo se construye OrganiHogar **extendiendo el módulo `tasks`** de la plantilla Sinapsis,
> con la PWA en `apps/pwa` consumiendo `apps/api`.
> Última actualización: 2026-07-24

## Decisiones de arquitectura (confirmadas)
- ✅ La PWA (`apps/pwa`) consume la misma API (`apps/api`).
- ✅ La lógica de OrganiHogar **extiende el módulo `tasks`** (no se crea módulo nuevo).
- ✅ Puertos: DB **5544** (base `familytool_db`, volumen `familytool_pgdata`, contenedor
  `familytool-db`), API **4099**, Web/Admin **3599**, PWA **3699**.
- ✅ Familia = tenant (Organization/Company). Roles Padre/Hijo = RBAC.

## Milestones

### M1 — Modelo de datos (cimiento) ✅ COMPLETO Y VERIFICADO
- Migración `modules/tasks/migrations/002_familytool.sql`:
  - Extender `Task`: `taskKind` (Paid/Responsibility), `rewardPoints`, `rewardXp`,
    `lifecycle` (creada→en_espera→doing→done→aprobada→finalizada), `availableUntil`
    (cuenta regresiva), `takenById`/`takenAt`, `submittedAt`, `validatorId` (delegado),
    `validatedById`/`validatedAt`, `rejectedReason`, `familyGoalId`.
  - `Wallet` (saldo por usuario: `moneyPoints` + `xpPoints`).
  - `WalletLedger` (historial de movimientos, moneda MONEY|XP, motivo, ref).
  - `FamilyConfig` (por company: tasa `pointsPerUnit`, moneda, candado pedagógico).
  - `Withdrawal` (retiros: puntos, snapshot de conversión, estado, aprobación).
  - `Transfer` (transferencias P2P visibles para el padre).
  - `FamilyGoal` + `FamilyGoalContribution` (metas + aportes de XP por usuario → torta).
- Actualizar `module.json` (registrar migración) e `install.ts` (seed de `FamilyConfig`).

### M2 — Backend: motor de economía + ciclo de vida ✅ COMPLETO Y VERIFICADO
- Servicio de wallet (acreditar/debitar con ledger, transacciones atómicas).
- Endpoints ciclo de vida de tarea: publicar (en_espera + countdown), tomar, cancelar
  (vuelve a en_espera), enviar (done), validar/rechazar (aprobada→finalizada = paga puntos).
- Job/verificación de vencimiento de countdown (vuelve a `creada`).
- Endpoints wallet: balance, historial, transferencias, retiros (solicitar/aprobar/rechazar),
  emisión de puntos por el padre.
- Endpoints metas familiares (CRUD + contribuciones + estadística).
- Candado pedagógico en la solicitud de retiro.

### M3 — Gamificación ✅ COMPLETO Y VERIFICADO
- [x] Rangos por XP (ya operativos), **rachas** (streaks) e **insignias** (badges).
- [x] Migración `003_gamification.sql` (`UserStreak`, `Badge`, `UserBadge`) + catálogo de 6 insignias.
- [x] Otorgamiento automático al validar tareas (racha + FIRST_TASK/STREAK_3/STREAK_7/HELPER_10),
      al transferir (GENEROUS) y al aprobar retiro (SAVER). Endpoint `/family/gamification`.
- [x] Surface en la Billetera de la PWA (racha 🔥 + grilla de insignias). Verificado en navegador.

### M4 — PWA (`apps/pwa`) ✅ SLICE VERTICAL FUNCIONANDO Y VERIFICADO
- [x] Scaffold PWA (React 19 + Vite 7 + Tailwind v4 + manifest + service worker). Puerto **3699**.
- [x] Login contra `apps/api`, sesión persistida, cliente HTTP con token.
- [x] Shell mobile-first con navegación inferior (4 secciones).
- [x] **Billetera:** saldo en puntos, rango con barra de progreso, historial, transferir y retirar (modales).
- [x] **Actividades:** tomar tareas pagas disponibles + tareas en curso (cancelar/marcar hecha).
- [x] **Responsabilidades:** listar/empezar/marcar hechas, con aviso de vencidas.
- [x] **Metas:** progreso + gráfico de torta de colaboración (recharts).
- [x] Percepción en puntos (el dinero solo aparece al retirar). Verificado en navegador con datos reales.
- Pendiente (polish): pull-to-refresh, empezar tareas desde notificación, vistas de "padre"
  dentro de la PWA (crear tareas, aprobar retiros) o dejarlas en el admin (M5).

> **Decisión de arquitectura (RBAC):** en OrganiHogar el módulo TASKS **es** la app, así que
> `install.ts` siembra permisos de TASKS para **todos los roles** (todo miembro accede). Las
> acciones "solo padre" (emitir puntos, aprobar retiros, editar config) se validan a nivel
> endpoint con `isParentUser`, no por RBAC de módulo.

### M5 — Panel del padre ✅ COMPLETO Y VERIFICADO
- [x] Área "Gestión" en la PWA (visible solo para padres, `isParent`), con pestañas:
  - **Aprobaciones:** validar/rechazar tareas + aprobar/rechazar retiros.
  - **Crear:** alta de tarea (paga/responsabilidad) con recompensas, countdown, meta y asignación.
  - **Puntos:** emisión (mint) a un miembro.
  - **Familia:** tasa de conversión, candado pedagógico, y CRUD de metas.
- [x] Verificado: validar "y pagar" desde la UI acredita la billetera del hijo.

### M6 — Endurecimiento 🟡 PARCIAL
- [x] **Hashing de passwords** (`apps/api/src/password.ts`, scrypt nativo) con **compatibilidad
      hacia atrás** y migración transparente en el primer login. Aplicado a login/register/
      reset/creación/edición/change-password. Verificado (200 legacy → hash → 200 hash → 401 wrong).
- [x] **Notificaciones** (`005_notifications.sql`): se generan al enviar/validar/rechazar tareas,
      transferir, emitir puntos y en retiros (solicitar/aprobar/rechazar). Campana con badge de
      no leídas + panel en el header de la PWA (polling cada 30s, marca leídas al abrir).
- [x] **Header + perfil de usuario** en la PWA: logo + nombre de la app, campana de
      notificaciones, y menú de usuario (avatar/foto, editar perfil, cerrar sesión). Editar
      perfil permite cambiar nombre y foto (endpoint `/tasks/family/profile`).
- [x] **Expiración + rotación deslizante de tokens de sesión** (TTL 30 días configurable con
      `SESSION_TTL_DAYS`). Se setea al login, se renueva en cada `/api/auth/session`, y se
      rechaza (401) en `/session`, en el middleware de módulos y en `resolveUserIdFromSessionToken`.
      Compat: sesiones viejas sin expiración (NULL) siguen válidas. La PWA cae al login ante un 401.

**M6 completo.** (Nota: `apps/api/src/server.ts` sigue siendo un monolito grande de la plantilla;
refactor opcional a futuro.)

## Estado
- [x] Puertos reasignados (5499/4099/3599) y DB levantada.
- [x] M1 — Modelo de datos (migración `002_familytool.sql` aplicada; 7 tablas nuevas +
      8 columnas en `Task`; `FamilyConfig` seedeado para 14 familias).
- [x] M2 — Backend economía + ciclo de vida (`modules/tasks/server/family.ts`).
      Probado end-to-end: mint, ciclo de vida completo con pago, transferencias, retiros
      con snapshot, candado pedagógico (423), metas + estadística.
- [x] M3 — Gamificación (rachas + insignias; rangos ya operativos).
- [x] M4 — PWA (`apps/pwa`): 4 secciones funcionando y verificadas en navegador.
- [x] M5 — Panel del padre (crear/validar tareas, config, aprobar retiros, emitir puntos, metas).
- [x] M6 — Hashing de passwords con compat. hacia atrás. (Pendiente: notificaciones, expiración de tokens.)

## Referencia rápida de la API (M2) — base `/api/tasks`
**Ciclo de vida** (sobre una tarea `:id`):
`POST /:id/publish` (creada→en_espera, body `availableUntil`) · `POST /:id/take` (body `userId`) ·
`POST /:id/cancel` (libera) · `POST /:id/submit` · `POST /:id/validate` (body `validatorId`, paga) ·
`POST /:id/reject` (body `reason`). Listado con filtros `?taskKind=Paid|Responsibility&lifecycle=...`.

**Economía** (`/api/tasks/family/...`):
- `GET /wallet?userId=` · `GET /wallet/history?userId=&limit=`
- `POST /wallet/transfer` `{fromUserId,toUserId,points,note}`
- `POST /wallet/mint` `{adminUserId,targetUserId,currency,amount}` (solo padre)
- `POST /wallet/withdrawals` `{userId,points}` (snapshot + candado) · `GET /wallet/withdrawals?userId=|companyId=&status=`
- `POST /wallet/withdrawals/:id/approve|reject|cancel`
- `GET|PUT /config?companyId=`
- `GET|POST /goals` · `PUT|DELETE /goals/:id` · `GET /goals/:id/stats` (torta)

> Nota: el smoke test dejó datos de prueba en la familia demo "Barrio Jardin" (saldos de
> Emma/Melody, un retiro aprobado, una meta "Vacaciones"). Reseedear si molesta.
