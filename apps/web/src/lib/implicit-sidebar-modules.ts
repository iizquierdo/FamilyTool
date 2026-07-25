import type { ModuleClientDefinition, ModuleMenuItem } from '@/modules/module-contract';

/**
 * Detects module views that are not yet stored as menu items (used in Menu Management only).
 * The sidebar does not inject these automatically; entries appear only when configured in the DB.
 */

/** Sidebar groups from API (subset of fields needed for implicit detection). */
export type ConfiguredMenuGroupForImplicit = {
  key: string;
  status: string;
  placement?: string;
  items?: Array<{
    status: string;
    targetType: string;
    viewKey: string;
    moduleCode: string | null;
  }>;
};

export type ImplicitSidebarContribution =
  | {
      kind: 'standalone';
      module: ModuleClientDefinition;
      items: ModuleMenuItem[];
    }
  | {
      kind: 'merge';
      module: ModuleClientDefinition;
      items: ModuleMenuItem[];
      targetGroupKey: string;
    };

/**
 * Views already represented by MODULE_VIEW rows in sidebar menu config (any group/item status).
 * Inactive entries still count so we do not suggest "add to menu" after the admin hid them.
 */
function collectConfiguredModuleViews(
  sidebarPlacementGroups: ConfiguredMenuGroupForImplicit[],
  activeCodeSet: Set<string>,
  dynamicViewSet: Set<string>
): Set<string> {
  const used = new Set<string>();
  for (const group of sidebarPlacementGroups) {
    for (const item of group.items || []) {
      if (item.targetType !== 'MODULE_VIEW') continue;
      const moduleCode = String(item.moduleCode || '').toUpperCase();
      if (!moduleCode || !activeCodeSet.has(moduleCode)) continue;
      if (!dynamicViewSet.has(item.viewKey)) continue;
      used.add(item.viewKey);
    }
  }
  return used;
}

/**
 * Module views that have no MODULE_VIEW menu row in the sidebar placement yet (only those
 * appear as suggestions in Menu Management).
 */
export function getImplicitSidebarContributions(
  configuredGroups: ConfiguredMenuGroupForImplicit[],
  clientModules: ModuleClientDefinition[],
  activeModuleCodes: string[]
): ImplicitSidebarContribution[] {
  const activeCodeSet = new Set(activeModuleCodes.map((c) => String(c || '').toUpperCase()));
  const activeClientModules = clientModules.filter((m) =>
    activeCodeSet.has(String(m.code || '').toUpperCase())
  );
  const dynamicViewSet = new Set<string>();
  for (const mod of activeClientModules) {
    for (const v of Object.keys(mod.views || {})) {
      dynamicViewSet.add(v);
    }
  }

  const sidebarPlacementGroups = (configuredGroups || []).filter(
    (g) => (g.placement || 'sidebar') === 'sidebar'
  );

  const usedModuleViews = collectConfiguredModuleViews(
    sidebarPlacementGroups,
    activeCodeSet,
    dynamicViewSet
  );
  const groupKeys = new Set(sidebarPlacementGroups.map((g) => g.key));

  const out: ImplicitSidebarContribution[] = [];
  for (const mod of activeClientModules) {
    const items: ModuleMenuItem[] = [];
    for (const section of mod.sidebarSections || []) {
      for (const item of section.items || []) {
        if (usedModuleViews.has(item.view)) continue;
        usedModuleViews.add(item.view);
        items.push(item);
      }
    }
    if (!items.length) continue;

    if (groupKeys.has(mod.mainNav.id)) {
      out.push({ kind: 'merge', module: mod, items, targetGroupKey: mod.mainNav.id });
    } else {
      out.push({ kind: 'standalone', module: mod, items });
    }
  }
  return out;
}
