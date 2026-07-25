import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { pathToFileURL, fileURLToPath } from 'url';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(here, '..');
const repoRoot = path.resolve(apiRoot, '..', '..');

dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(apiRoot, '.env'), override: true });

const { Pool } = pg;

interface ModuleManifest {
  name: string;
  code: string;
  version: string;
  description?: string;
  migrations?: string[];
}

type Command = 'list' | 'install' | 'uninstall' | 'status';

const modulesRoot = process.env.MODULES_ROOT
  ? path.resolve(process.env.MODULES_ROOT)
  : path.join(repoRoot, 'modules');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ensureModuleMigrationsTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "_module_migrations" (
      id TEXT NOT NULL,
      module_code TEXT NOT NULL,
      migration_file TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT "_module_migrations_pkey" PRIMARY KEY (id),
      CONSTRAINT "_module_migrations_module_file_key" UNIQUE (module_code, migration_file)
    )
  `);
};

const readManifest = (moduleDir: string): ModuleManifest => {
  const manifestPath = path.join(moduleDir, 'module.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest not found: ${manifestPath}`);
  }

  const raw = fs.readFileSync(manifestPath, 'utf-8');
  return JSON.parse(raw) as ModuleManifest;
};

const getModuleDirs = (): string[] => {
  if (!fs.existsSync(modulesRoot)) return [];

  const seenCodes = new Set<string>();
  const dirs: string[] = [];

  for (const name of fs.readdirSync(modulesRoot)) {
    const fullPath = path.join(modulesRoot, name);
    if (!fs.statSync(fullPath).isDirectory()) continue;
    if (!fs.existsSync(path.join(fullPath, 'module.json'))) continue;

    try {
      const manifest = readManifest(fullPath);
      const code = String(manifest.code || '').toUpperCase().trim();
      if (!code || seenCodes.has(code)) continue;
      seenCodes.add(code);
      dirs.push(fullPath);
    } catch {
      continue;
    }
  }

  return dirs;
};

const findModuleDir = (moduleKey: string): string => {
  const dirs = getModuleDirs();
  const normalized = moduleKey.trim().toLowerCase();

  for (const dir of dirs) {
    const manifest = readManifest(dir);
    if (manifest.code.toLowerCase() === normalized || manifest.name.toLowerCase() === normalized || path.basename(dir).toLowerCase() === normalized) {
      return dir;
    }
  }

  throw new Error(`Module not found: ${moduleKey}`);
};

const executeModuleMigrations = async (moduleDir: string, manifest: ModuleManifest) => {
  const migrations = manifest.migrations || [];
  for (const relPath of migrations) {
    const migrationFile = path.join(moduleDir, relPath);
    if (!fs.existsSync(migrationFile)) {
      throw new Error(`Migration file not found: ${migrationFile}`);
    }

    const alreadyApplied = await pool.query(
      'SELECT 1 FROM "_module_migrations" WHERE module_code = $1 AND migration_file = $2 LIMIT 1',
      [manifest.code, relPath]
    );

    if (alreadyApplied.rows[0]) {
      continue;
    }

    const sql = fs.readFileSync(migrationFile, 'utf-8');
    await pool.query('BEGIN');
    try {
      await pool.query(sql);
      await pool.query(
        'INSERT INTO "_module_migrations" (id, module_code, migration_file, applied_at) VALUES ($1, $2, $3, NOW())',
        [cryptoRandomUUID(), manifest.code, relPath]
      );
      await pool.query('COMMIT');
      console.log(`Applied migration: ${manifest.code} -> ${relPath}`);
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  }
};

const cryptoRandomUUID = () => {
  if (typeof globalThis.crypto !== 'undefined' && 'randomUUID' in globalThis.crypto) {
    return globalThis.crypto.randomUUID();
  }

  // fallback for environments without web crypto
  const random = Math.random().toString(16).slice(2);
  return `mod-${Date.now()}-${random}`;
};

const maybeRunHook = async (moduleDir: string, hook: 'install' | 'uninstall', payload: Record<string, unknown>) => {
  const file = path.join(moduleDir, `${hook}.ts`);
  if (!fs.existsSync(file)) return;

  const imported = await import(pathToFileURL(file).href);
  const fn = imported.default;
  if (typeof fn !== 'function') {
    throw new Error(`${hook}.ts must export default function`);
  }

  await fn(payload);
};

const installModule = async (moduleKey: string) => {
  const moduleDir = findModuleDir(moduleKey);
  const manifest = readManifest(moduleDir);

  await ensureModuleMigrationsTable();
  await executeModuleMigrations(moduleDir, manifest);

  await maybeRunHook(moduleDir, 'install', {
    pool,
    moduleCode: manifest.code,
    moduleName: manifest.name,
    moduleDescription: manifest.description || null
  });

  console.log(`Module installed: ${manifest.name} (${manifest.code})`);
};

const uninstallModule = async (moduleKey: string, purgeData: boolean) => {
  const moduleDir = findModuleDir(moduleKey);
  const manifest = readManifest(moduleDir);

  await maybeRunHook(moduleDir, 'uninstall', {
    pool,
    moduleCode: manifest.code,
    moduleName: manifest.name,
    moduleDescription: manifest.description || null,
    purgeData
  });

  console.log(`Module uninstalled: ${manifest.name} (${manifest.code})${purgeData ? ' [purge]' : ''}`);
};

const listModules = async () => {
  const dirs = getModuleDirs();

  if (dirs.length === 0) {
    console.log('No modules found in /modules');
    return;
  }

  for (const dir of dirs) {
    const manifest = readManifest(dir);
    const row = await pool.query('SELECT status FROM "SystemModule" WHERE code = $1 LIMIT 1', [manifest.code]);
    const status = row.rows[0]?.status || 'Not Installed';
    console.log(`${manifest.code.padEnd(12)} ${status.padEnd(14)} ${manifest.name}`);
  }
};

const statusModule = async (moduleKey: string) => {
  const moduleDir = findModuleDir(moduleKey);
  const manifest = readManifest(moduleDir);

  const moduleRow = await pool.query('SELECT id, name, code, status, "updatedAt" FROM "SystemModule" WHERE code = $1 LIMIT 1', [manifest.code]);
  const migrations = await pool.query('SELECT migration_file, applied_at FROM "_module_migrations" WHERE module_code = $1 ORDER BY applied_at ASC', [manifest.code]);

  console.log(`Module: ${manifest.name} (${manifest.code})`);
  if (!moduleRow.rows[0]) {
    console.log('Status: Not Installed');
  } else {
    console.log(`Status: ${moduleRow.rows[0].status}`);
    console.log(`Updated: ${moduleRow.rows[0].updatedAt}`);
  }

  console.log(`Applied migrations: ${migrations.rows.length}`);
  for (const row of migrations.rows) {
    console.log(` - ${row.migration_file} (${row.applied_at})`);
  }
};

const printUsage = () => {
  console.log('Usage:');
  console.log('  npx tsx scripts/module-manager.ts list');
  console.log('  npx tsx scripts/module-manager.ts install <module>');
  console.log('  npx tsx scripts/module-manager.ts uninstall <module> [--purge]');
  console.log('  npx tsx scripts/module-manager.ts status <module>');
};

const main = async () => {
  const command = (process.argv[2] || '').trim().toLowerCase() as Command;
  const moduleKey = (process.argv[3] || '').trim();
  const purgeData = process.argv.includes('--purge');

  try {
    if (!command || !['list', 'install', 'uninstall', 'status'].includes(command)) {
      printUsage();
      process.exitCode = 1;
      return;
    }

    if (command === 'list') {
      await listModules();
      return;
    }

    if (!moduleKey) {
      printUsage();
      process.exitCode = 1;
      return;
    }

    if (command === 'install') {
      await installModule(moduleKey);
      return;
    }

    if (command === 'uninstall') {
      await uninstallModule(moduleKey, purgeData);
      return;
    }

    if (command === 'status') {
      await ensureModuleMigrationsTable();
      await statusModule(moduleKey);
    }
  } finally {
    await pool.end();
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

