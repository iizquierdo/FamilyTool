import type express from 'express';
import type { Pool } from 'pg';

export interface ModuleApiContext {
  app: express.Express;
  pool: Pool;
}

export interface InstallContext {
  pool: Pool;
  moduleCode: string;
  moduleName: string;
  moduleDescription?: string | null;
}

export interface UninstallContext extends InstallContext {
  purgeData?: boolean;
}
