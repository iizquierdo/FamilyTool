import fs from 'fs';
import path from 'path';
import { MODULES_ROOT } from './paths';

export interface ModuleManifest {
  name: string;
  code: string;
  version?: string;
  description?: string;
  migrations?: string[];
  entry?: {
    api?: string;
    ui?: string;
    /** Optional SaaS admin API routes registered under /api/admin (see loadModuleAdminRoutes). */
    admin?: string;
  };
  api?: {
    basePath?: string;
    openapiPath?: string;
    docsPath?: string;
  };
}

export interface DiskModuleInfo {
  dir: string;
  folder: string;
  manifest: ModuleManifest;
}

export const modulesRoot = MODULES_ROOT;

const normalizeApiPath = (value?: string) => {
  const pathValue = String(value || '').trim();
  if (!pathValue) return '';
  return pathValue.startsWith('/') ? pathValue : `/${pathValue}`;
};

export const getDiskModules = (): DiskModuleInfo[] => {
  if (!fs.existsSync(modulesRoot)) return [];

  const seenCodes = new Set<string>();
  const result: DiskModuleInfo[] = [];
  const moduleDirs = fs
    .readdirSync(modulesRoot)
    .map((name) => path.join(modulesRoot, name))
    .filter((fullPath) => fs.statSync(fullPath).isDirectory());

  for (const dir of moduleDirs) {
    const manifestPath = path.join(dir, 'module.json');
    if (!fs.existsSync(manifestPath)) continue;

    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as ModuleManifest;
      const code = String(manifest?.code || '').toUpperCase().trim();
      const name = String(manifest?.name || '').trim();
      if (!code || !name || seenCodes.has(code)) continue;

      seenCodes.add(code);
      result.push({
        dir,
        folder: path.basename(dir),
        manifest: {
          ...manifest,
          code,
          name
        }
      });
    } catch (error) {
      console.error(`[MODULE] Invalid manifest in ${dir}:`, error);
    }
  }

  return result;
};

export const findDiskModule = (moduleCodeOrName: string): DiskModuleInfo | null => {
  const key = String(moduleCodeOrName || '').trim().toLowerCase();
  if (!key) return null;
  const modules = getDiskModules();
  return (
    modules.find(
      ({ folder, manifest }) =>
        manifest.code.toLowerCase() === key ||
        manifest.name.toLowerCase() === key ||
        folder.toLowerCase() === key
    ) || null
  );
};

export const getModuleApiBasePath = (info: DiskModuleInfo): string => {
  const { manifest, folder } = info;
  return normalizeApiPath(manifest?.api?.basePath) || `/api/${folder}`;
};

/** Maps tenant API base path (e.g. /api/clients) → SystemModule code for permission middleware. */
export const buildModuleRouteCodeMap = (): Record<string, string> => {
  const map: Record<string, string> = {};
  for (const info of getDiskModules()) {
    map[getModuleApiBasePath(info)] = info.manifest.code;
  }
  return map;
};
