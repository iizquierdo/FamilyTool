# FamilyTool — Especificación Funcional

> Documento vivo. Se construye de forma conversacional antes de escribir código.
> Última actualización: 2026-07-24

---

## 1. Visión y objetivo

**FamilyTool** es una aplicación (PWA + panel de administración web) para gestionar
las tareas de una familia mediante **gamificación**. El objetivo es doble y está en
tensión deliberada:

1. **Motivar** a los miembros de la familia a colaborar, permitiéndoles **ganar dinero real**
   por ciertas tareas.
2. **Sin mercantilizar** las responsabilidades básicas del hogar: colaborar como miembro
   de la familia no debe convertirse en una simple transacción económica.

La app debe lograr que los participantes ganen recompensas **y** mantengan el sentido de
responsabilidad sobre sus tareas diarias.

**Principio de percepción:** los participantes ven casi siempre **puntos**, rara vez dinero.
La conversión a plata aparece solo en el momento del retiro. El foco mental debe estar en
"ganar puntos", no en "ganar dinero".

---

## 2. Modelo de negocio

- **SaaS multi-familia**: cualquier familia puede registrarse y crear su propio espacio.
- Cada familia es un "espacio" aislado con sus propios usuarios, tareas, puntos y config.

---

## 3. Usuarios y roles

| Rol | Descripción | Puede |
|-----|-------------|-------|
| **Administrador / Padre** | Gestiona el espacio familiar | Crear/asignar tareas, aprobar tareas sugeridas, validar tareas hechas, configurar tasa de conversión, delegar validación, **cargar puntos libremente a los integrantes (emisión)**, aprobar retiros. **También puede participar y ganar puntos.** |
| **Participante / Hijo** | Miembro que realiza tareas | Tomar tareas disponibles, hacer responsabilidades, sugerir tareas (a aprobar), transferir puntos, solicitar retiros. |

- El **padre es también un usuario jugador**: administra *y* participa.
- Cualquier participante puede **sugerir tareas**, que quedan pendientes de aprobación por un admin/padre.

---

## 4. Concepto de puntos y monedas — ✅ CONFIRMADO: dos monedas

Sistema de **dos monedas separadas**. El dinero nunca toca las responsabilidades.

| Moneda | Cómo se gana | Para qué sirve | ¿Canjeable a dinero? |
|--------|--------------|----------------|----------------------|
| **Monedas ($)** | Tareas **pagas** + emisión del padre | Se convierten en dinero real (al retirar) | ✅ Sí |
| **Reputación / XP** | Tareas de **responsabilidad** (voluntarias/no remuneradas) | Sube rango, alimenta metas familiares, insignias, rachas | ❌ No |

- **Solo se transfieren Monedas ($)** entre miembros de la misma familia (billetera P2P interna).
- El participante siempre ve **saldo en puntos**; el equivalente en dinero solo aparece al
  solicitar un retiro.

---

## 5. Tipos de tareas

1. **Tareas pagas** — otorgan **Monedas ($)** canjeables por dinero.
2. **Tareas de responsabilidad (no pagas / voluntarias)** — obligatorias por ser miembro de
   la familia. Otorgan **Reputación/XP** y **alimentan las metas familiares**. No dan dinero.
3. **Tareas sugeridas** — cualquier participante propone; un admin/padre las aprueba antes
   de que entren al pool.

---

## 6. Ciclo de vida de una tarea (máquina de estados)

| Estado | Nombre | Significado |
|--------|--------|-------------|
| `creada` | **Creada** | La tarea existe pero aún no está listada/disponible para tomar. |
| `en_espera` | **En espera** | Publicada y listada, con cuenta regresiva; alguien la puede tomar. |
| `doing` | **Haciendo** | Un miembro la tomó y está en progreso. |
| `done` | **Realizada** | El miembro la marcó como hecha; enviada para validación. |
| `aprobada` | **Aprobada** | Un padre/validador la aprobó. |
| `finalizada` | **Finalizada** | Cerrada; los puntos ya fueron entregados. |

```
[creada] → [en_espera] → [doing] → [done] → [aprobada] → [finalizada]
```

- **Cuenta regresiva:** en `en_espera`, la tarea tiene fecha/hora límite para ser **tomada**
  (ej: publicada hoy, disponible hasta mañana 12:45).
- **Vencimiento:** si la cuenta regresiva termina sin que nadie la tome, la tarea **vuelve a
  `creada`** (sale de la lista; el admin puede re-publicarla).
- **Cancelación:** una tarea en `doing` puede **cancelarse** y volver a `en_espera` para otro miembro.
- **Validación:** de `done` a `aprobada` la hace un padre/admin, o un validador **delegado**.
- Los **puntos se entregan** al pasar a `finalizada` (tras la aprobación).

---

## 7. Secciones de la PWA

1. **Billetera** — balance de puntos + historial de actividad (ganancias, retiros, transferencias).
2. **Actividades disponibles** — tareas **pagas** para tomar (con cuenta regresiva).
3. **Mis responsabilidades** — tareas **no pagas** (voluntarias) asignadas.
4. **Metas familiares** — objetivos colectivos con estadística de colaboración de cada uno.

---

## 8. Panel de administración (web)

Para admins/padres:
- Crear, editar y asignar tareas (pagas y responsabilidades), con cuenta regresiva.
- Aprobar/rechazar tareas sugeridas por participantes.
- Validar tareas realizadas (o delegar la validación).
- Configurar la **tasa de conversión** (X puntos = Y dinero).
- **Emitir/cargar puntos** libremente a cualquier integrante (no salen del saldo del padre).
- Aprobar **retiros** pendientes.
- Gestionar miembros y metas familiares.

---

## 9. Billetera, transferencias y retiros

### Billetera
- Cada usuario tiene saldo de **Monedas ($)** y de **Reputación/XP** (esta última no retirable).
- Historial de actividad visible.

### Transferencias
- **P2P** entre miembros de la misma familia (solo Monedas $).
- (A revisar) Visibilidad/control del padre para evitar el "efecto tercerización".

### Retiros (canje de puntos por dinero)
Flujo:
```
[Solicita retiro] → se calcula conversión (snapshot de plata) → [Pendiente]
     → padre aprueba → se descuentan los puntos → dinero entregado
```
- La conversión se **congela** al momento de solicitar el retiro.
- Queda en estado **pendiente** hasta que el padre lo aprueba.
- Al aprobar, se **descuentan** los puntos del saldo.
- **Candado pedagógico:** no se puede solicitar retiro salvo que se tengan las
  **responsabilidades del día al día** (o X cantidad de tareas voluntarias cumplidas).

---

## 10. Metas familiares

- Objetivos colectivos con un target (ej: ahorrar para vacaciones).
- **Se alimentan con Reputación/XP** generada por las tareas de responsabilidad de todos.
  Nadie "dona su plata": se avanza colaborando en lo cotidiano.
- **Estadística de colaboración:** gráfico (ej: torta) que muestra el aporte/esfuerzo de
  cada integrante a la meta.
  - *Nota de diseño:* enmarcar como contribución al logro común, no como competencia
    ganadores/perdedores (ver decisiones abiertas).

---

## 11. Gamificación

- **Rangos familiares** por Reputación: ej. Aprendiz → … → Maestro del Hogar.
- **Rachas (streaks):** cumplir responsabilidades días seguidos da bonus e insignias.
- **Insignias de valores:** generosidad (transferencias), constancia (rachas), iniciativa
  (sugerir tareas).
- **Transparencia total:** historial visible para toda la familia.

---

## 12. Stack técnico y arquitectura

FamilyTool se construye **sobre la plantilla existente "Sinapsis CRM/ERP"** (monorepo pnpm).
Ver [PLANTILLA_BASE.md](./PLANTILLA_BASE.md) para el detalle completo de lo que ya trae.

- **Monorepo pnpm** (Node ≥ 20).
- **Backend:** Express 5 + Prisma 7 + PostgreSQL (`apps/api`).
- **Panel admin web:** SPA React 19 + Vite, ya incluida en `apps/web` (`/admin`).
- **PWA (app de la familia):** **nueva app en `apps/pwa`** (a crear). React; se decidirá si
  reutiliza el shell de `apps/web` o es una app independiente optimizada para móvil/PWA.
- **Lógica de negocio:** como **módulo(s) plug-and-play** en `modules/*` (ej. un módulo
  `family` o adaptar/derivar del módulo `tasks`).

### 12.1 Mapeo FamilyTool ↔ plantilla (qué está resuelto y qué falta)

| Necesidad FamilyTool | Estado en la plantilla | Acción |
|----------------------|------------------------|--------|
| SaaS multi-familia | ✅ Multi-tenant `Organization → Company → User` | **Familia = tenant** (Organization/Company). Reusar. |
| Roles padre / hijo | ✅ RBAC (`Role`, `Permission`, `SystemModule`) | Definir roles "Padre/Admin" e "Hijo/Participante". |
| Panel admin de padres | ✅ Panel `/admin` + UI de tenant | Reusar/adaptar. |
| Gestión de tareas | 🟡 Módulo `tasks` (Task + TaskShare, estados, kanban) | **Base sólida**, pero hay que extender el modelo (puntos, monedas, cuenta regresiva, validación/aprobación, tomar/cancelar). |
| Billetera y puntos | ❌ No existe | **Construir**: saldos (Monedas $ + XP), historial, transferencias P2P, retiros. |
| Tasa de conversión puntos→dinero | ❌ No existe | **Construir** (config por familia). |
| Metas familiares | ❌ No existe | **Construir** (target + aportes por XP + estadística). |
| Gamificación (rangos, rachas, insignias) | ❌ No existe | **Construir**. |
| Branding / theming | ✅ `Core` + tokens CSS | Reusar. |
| i18n (es/en) | ✅ i18next | Reusar. |
| Menús dinámicos | ✅ `MenuGroup`/`MenuItem` | Reusar para armar las secciones de la PWA. |
| Notificaciones (cuenta regresiva, aprobaciones) | ❌ No existe | **Construir** (a definir mecanismo). |
| Auth segura | 🔴 Passwords en texto plano | **Endurecer** antes de producción (hashing). |

> **Decisión pendiente de arquitectura:** ¿la PWA consume la misma API (`apps/api`) y la
> lógica vive en un módulo, o se hace una app más autónoma? Recomendación inicial: reusar
> `apps/api` + un módulo nuevo, para aprovechar tenant/RBAC/menús ya resueltos.

---

## 13. Decisiones abiertas / pendientes

- [ ] Mecanismo/encuadre de la **estadística de metas familiares** (colaboración vs. competencia).
- [ ] Visibilidad/control del padre sobre **transferencias** (efecto tercerización).
- [ ] Definir exactamente cómo el admin configura la recompensa de responsabilidades (XP).
- [ ] Diseño visual / mecánica de juego por rango de edad.
- [ ] Detalle del "candado pedagógico": ¿qué cuenta como "responsabilidades al día"?
- [ ] **Arquitectura PWA:** ¿app en `apps/pwa` que consume `apps/api` + módulo nuevo, o app
      autónoma? (recomendación: reusar API + módulo).
- [ ] ¿Extender el módulo `tasks` existente o crear un módulo `family` nuevo desde cero?
- [ ] Endurecer autenticación (hashing de passwords) antes de exponer a familias reales.
