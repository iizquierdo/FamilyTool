import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(here, '..');
const repoRoot = path.resolve(apiRoot, '..', '..');

// Load env from repo root first, then allow apps/api/.env to override.
dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(apiRoot, '.env'), override: true });

const { default: app } = await import('./server');

// Railway/Render/etc. inyectan PORT; en local usamos API_PORT.
const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);
const host = process.env.API_HOST ?? '0.0.0.0';

app.listen(port, host, () => {
  console.log(`[api] listening on http://${host}:${port}`);
});
