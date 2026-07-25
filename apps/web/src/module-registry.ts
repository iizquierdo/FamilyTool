import type { ModuleClientDefinition } from '@sinapsis/module-sdk-client';

const moduleFiles = import.meta.glob('../../../modules/*/client/index.ts', {
  eager: true
}) as Record<string, { default?: ModuleClientDefinition; module?: ModuleClientDefinition }>;

const uniqueByCode = new Map<string, ModuleClientDefinition>();
for (const mod of Object.values(moduleFiles)) {
  const definition = mod.default || mod.module;
  if (!definition?.code) continue;
  const code = String(definition.code).toUpperCase();
  if (!uniqueByCode.has(code)) {
    uniqueByCode.set(code, definition);
  }
}

const loadedModules: ModuleClientDefinition[] = Array.from(uniqueByCode.values());

export const getClientModules = (): ModuleClientDefinition[] => loadedModules;
