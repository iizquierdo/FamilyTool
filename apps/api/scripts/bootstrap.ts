// OrganiHogar — Bootstrap seguro para deploy. Siembra los datos iniciales SOLO si la
// base está vacía (0 usuarios). En deploys posteriores no hace nada (no destruye datos).
// Se corre después de `prisma migrate deploy`.
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(here, '..');
const repoRoot = path.resolve(apiRoot, '..', '..');
dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(apiRoot, '.env'), override: true });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  let count = 0;
  try {
    const r = await pool.query('SELECT COUNT(*)::int AS n FROM "User"');
    count = Number(r.rows[0]?.n || 0);
  } catch (e: any) {
    console.error('[bootstrap] No se pudo consultar "User" (¿faltó migrate?):', e.message);
    await pool.end().catch(() => {});
    process.exit(1);
  }
  await pool.end().catch(() => {});

  if (count > 0) {
    console.log(`[bootstrap] La base ya tiene ${count} usuario(s) — no se siembra.`);
    return;
  }

  console.log('[bootstrap] Base vacía — creando datos iniciales (una sola vez)...');
  execSync('tsx prisma/seed.ts', {
    cwd: apiRoot,
    stdio: 'inherit',
    env: { ...process.env, ALLOW_DESTRUCTIVE_SEED: 'true' }
  });
  console.log('[bootstrap] Listo. Admin inicial: admin@sinapsis.app / Admin1234 (cambiá la contraseña).');
}

main().catch((e) => {
  console.error('[bootstrap] error:', e?.message || e);
  process.exit(1);
});
