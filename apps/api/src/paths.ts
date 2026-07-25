import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** apps/api/ — root of this Node app. Used for storage, server-errors.txt, prisma client lookup. */
export const API_ROOT = path.resolve(here, '..');

/** Monorepo root (two levels up from apps/api). */
export const REPO_ROOT = path.resolve(API_ROOT, '..', '..');

/** Root where module folders are scanned from. Override with MODULES_ROOT. */
export const MODULES_ROOT = process.env.MODULES_ROOT
  ? path.resolve(process.env.MODULES_ROOT)
  : path.resolve(REPO_ROOT, 'modules');

/** Tenant uploads root. Override with STORAGE_ROOT. */
export const STORAGE_ROOT = process.env.STORAGE_ROOT
  ? path.resolve(process.env.STORAGE_ROOT)
  : path.resolve(API_ROOT, 'storage');

/** Resolves a path that comes from module.json (manifest entries). Anchored at MODULES_ROOT's parent so values like `modules/foo/server/index.ts` keep working. */
export const resolveManifestPath = (relative: string) => path.resolve(REPO_ROOT, relative);
