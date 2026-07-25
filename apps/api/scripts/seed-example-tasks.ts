// FamilyTool — Seed de tareas de ejemplo para la familia de demo.
// Idempotente: borra las tareas de ejemplo previas (code 'EJ-%') y las recrea.
// Uso: pnpm familytool:seed-tasks
import dotenv from 'dotenv';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(here, '..');
const repoRoot = path.resolve(apiRoot, '..', '..');
dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(apiRoot, '.env'), override: true });

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const hoursFromNow = (h: number) => new Date(Date.now() + h * 3600 * 1000).toISOString();

async function main() {
  // Familia de la demo = company de emma@sinapsis.app
  const emma = await pool.query('SELECT id, "companyId" FROM "User" WHERE email = $1 LIMIT 1', ['emma@sinapsis.app']);
  if (!emma.rows[0]) throw new Error('No existe emma@sinapsis.app');
  const companyId = emma.rows[0].companyId as string;
  const emmaId = emma.rows[0].id as string;

  const parent = await pool.query(
    `SELECT id FROM "User" WHERE "companyId" = $1 AND LOWER(role) IN ('administrator','admin') ORDER BY "createdAt" ASC LIMIT 1`,
    [companyId]
  );
  const creatorId = (parent.rows[0]?.id as string) || emmaId;

  const melody = await pool.query('SELECT id FROM "User" WHERE email = $1 AND "companyId" = $2 LIMIT 1', ['melody@sinapsis.app', companyId]);
  const melodyId = (melody.rows[0]?.id as string) || emmaId;

  const goal = await pool.query(`SELECT id FROM "FamilyGoal" WHERE "companyId" = $1 AND status = 'Active' ORDER BY "createdAt" DESC LIMIT 1`, [companyId]);
  const goalId = (goal.rows[0]?.id as string) || null;

  // Limpia ejemplos previos
  await pool.query(`DELETE FROM "Task" WHERE "companyId" = $1 AND code LIKE 'EJ-%'`, [companyId]);

  interface Sub {
    title: string;
    points: number;
    description?: string;
  }
  interface Seed {
    title: string;
    description?: string;
    kind: 'Paid' | 'Responsibility';
    points: number;
    xp: number;
    ownerId: string;
    availableUntil?: string | null;
    dueDate?: string | null;
    goal?: boolean;
    subs: Sub[];
  }

  const seeds: Seed[] = [
    // Actividades pagas disponibles para tomar (en_espera) — puntos por subtarea (MONEY)
    {
      title: 'Lavar el auto', description: 'Dejar el auto impecable por dentro y por fuera.', kind: 'Paid', points: 300, xp: 20, ownerId: creatorId, availableUntil: hoursFromNow(48),
      subs: [
        { title: 'Exterior con manguera y jabón', points: 120, description: 'Carrocería sin manchas ni jabón seco.' },
        { title: 'Llantas y ruedas', points: 60 },
        { title: 'Aspirar el interior', points: 80, description: 'Alfombras y asientos.' },
        { title: 'Vidrios y espejos', points: 40, description: 'Sin marcas.' }
      ]
    },
    {
      title: 'Cortar el pasto', description: 'Todo el jardín del frente y del fondo, parejo.', kind: 'Paid', points: 250, xp: 15, ownerId: creatorId, availableUntil: hoursFromNow(72),
      subs: [
        { title: 'Jardín del frente', points: 120 },
        { title: 'Jardín del fondo', points: 100 },
        { title: 'Juntar y embolsar el pasto', points: 30 }
      ]
    },
    {
      title: 'Ordenar el garage', description: 'Que quede transitable y ordenado.', kind: 'Paid', points: 400, xp: 30, ownerId: creatorId, availableUntil: hoursFromNow(24),
      subs: [
        { title: 'Guardar las herramientas en su lugar', points: 150 },
        { title: 'Barrer y trapear el piso', points: 120 },
        { title: 'Ordenar las cajas en los estantes', points: 130 }
      ]
    },
    {
      title: 'Pasear al perro', description: 'Vuelta larga y volver con el perro cansado y feliz.', kind: 'Paid', points: 80, xp: 10, ownerId: creatorId, availableUntil: hoursFromNow(12),
      subs: [
        { title: 'Vuelta completa a la plaza', points: 50 },
        { title: 'Levantar la caca', points: 30, description: '¡Siempre con bolsita!' }
      ]
    },
    {
      title: 'Ayudar con las compras', description: 'Acompañar al súper y ordenar todo al volver.', kind: 'Paid', points: 150, xp: 15, ownerId: creatorId, availableUntil: hoursFromNow(36),
      subs: [
        { title: 'Acompañar y ayudar a elegir', points: 50 },
        { title: 'Cargar las bolsas', points: 60 },
        { title: 'Guardar todo en la alacena y heladera', points: 40 }
      ]
    },

    // Responsabilidades de Emma (en_espera) — puntos por subtarea (XP)
    {
      title: 'Hacer la cama', kind: 'Responsibility', points: 0, xp: 15, ownerId: emmaId, dueDate: hoursFromNow(8), goal: true,
      subs: [{ title: 'Estirar las sábanas y el acolchado', points: 8 }, { title: 'Acomodar las almohadas', points: 7 }]
    },
    {
      title: 'Poner la mesa', kind: 'Responsibility', points: 0, xp: 10, ownerId: emmaId, dueDate: hoursFromNow(5), goal: true,
      subs: [{ title: 'Platos y cubiertos', points: 6 }, { title: 'Vasos y servilletas', points: 4 }]
    },
    {
      title: 'Lavar los platos', kind: 'Responsibility', points: 0, xp: 15, ownerId: emmaId, dueDate: hoursFromNow(10), goal: true,
      subs: [{ title: 'Lavar', points: 8 }, { title: 'Secar', points: 4 }, { title: 'Guardar', points: 3 }]
    },

    // Responsabilidades de Melody
    {
      title: 'Ordenar tu cuarto', kind: 'Responsibility', points: 0, xp: 20, ownerId: melodyId, dueDate: hoursFromNow(8), goal: true,
      subs: [{ title: 'Ropa en el placard', points: 8 }, { title: 'Juguetes en su lugar', points: 7 }, { title: 'Ordenar el escritorio', points: 5 }]
    },
    {
      title: 'Sacar la basura', kind: 'Responsibility', points: 0, xp: 10, ownerId: melodyId, dueDate: hoursFromNow(6), goal: true,
      subs: [{ title: 'Juntar los tachos de la casa', points: 5 }, { title: 'Llevar al contenedor', points: 5 }]
    }
  ];

  let i = 0;
  for (const s of seeds) {
    i += 1;
    const code = `EJ-${String(i).padStart(3, '0')}`;
    const taskId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO "Task" (id, code, title, description, status, priority, category, "startDate", "dueDate", "completedAt", visibility,
         "companyId", "createdById", "ownerId", "taskKind", "rewardPoints", "rewardXp", lifecycle, "availableUntil", "familyGoalId", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, 'Todo', 'Medium', NULL, NULL, $5::timestamp, NULL, 'Private',
         $6, $7, $8, $9, $10, $11, 'en_espera', $12::timestamp, $13, NOW(), NOW())`,
      [
        taskId,
        code,
        s.title,
        s.description || null,
        s.dueDate || null,
        companyId,
        creatorId,
        s.ownerId,
        s.kind,
        s.points,
        s.xp,
        s.availableUntil || null,
        s.goal ? goalId : null
      ]
    );
    let order = 0;
    for (const sub of s.subs) {
      await pool.query(
        `INSERT INTO "TaskSubtask" (id, "taskId", title, description, points, "sortOrder", "doneByChild", approved, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, FALSE, NULL, NOW(), NOW())`,
        [crypto.randomUUID(), taskId, sub.title, sub.description || null, sub.points, order]
      );
      order += 1;
    }
  }

  const summary = await pool.query(
    `SELECT lifecycle, "taskKind", COUNT(*)::int AS c FROM "Task" WHERE "companyId" = $1 AND code LIKE 'EJ-%' GROUP BY lifecycle, "taskKind"`,
    [companyId]
  );
  console.log(`✅ Seed de ${seeds.length} tareas de ejemplo creado para la familia.`);
  summary.rows.forEach((r: any) => console.log(`   ${r.taskKind} / ${r.lifecycle}: ${r.c}`));
  console.log(`   Emma: ${seeds.filter((s) => s.ownerId === emmaId && s.kind === 'Responsibility').length} responsabilidades · ${seeds.filter((s) => s.kind === 'Paid').length} actividades pagas disponibles`);
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error('Error en el seed:', err.message);
    pool.end();
    process.exit(1);
  });
