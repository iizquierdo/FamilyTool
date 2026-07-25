import fs from 'fs';
import path from 'path';
import type express from 'express';
import type pg from 'pg';
import type multer from 'multer';
import { pathToFileURL } from 'url';
import { getDiskModules } from '../diskModules';
import { resolveManifestPath } from '../paths';

type PrismaLike = any;

/**
 * Loads optional `server/adminRoutes.ts` from each disk module (if present).
 * Export: `registerModuleAdminRoutes(router, prisma, pool, uploadMemory)` or default with the same signature.
 */
export const loadModuleAdminRoutes = async (
  router: express.Router,
  prisma: PrismaLike,
  pool: pg.Pool,
  uploadMemory: multer.Multer
) => {
  for (const { dir, manifest } of getDiskModules()) {
    const configured = manifest.entry?.admin ? resolveManifestPath(String(manifest.entry.admin)) : '';
    const defaultPath = path.join(dir, 'server', 'adminRoutes.ts');
    const adminEntry = configured && fs.existsSync(configured) ? configured : fs.existsSync(defaultPath) ? defaultPath : '';

    if (!adminEntry) continue;

    try {
      const imported = await import(pathToFileURL(adminEntry).href);
      const fn = imported?.registerModuleAdminRoutes ?? imported?.default;
      if (typeof fn !== 'function') {
        console.warn(`[ADMIN] ${adminEntry} has no registerModuleAdminRoutes or default export`);
        continue;
      }
      await fn(router, prisma, pool, uploadMemory);
      console.log(`[ADMIN] Loaded module admin routes: ${manifest.code} (${path.basename(adminEntry)})`);
    } catch (error: any) {
      console.error(`[ADMIN] Failed loading ${adminEntry}:`, error?.message || error);
    }
  }
};
