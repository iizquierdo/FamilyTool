import type { ModuleClientDefinition } from '@/modules/module-contract';
import type { MenuDisplayMode } from '@/lib/menu-display';
import { assertSafeMenuLinkUrl } from '@/lib/menu-link';

export type MenuNavTargetType = 'STATIC_VIEW' | 'MODULE_VIEW' | 'EXTERNAL_URL';

export interface MenuNavItemRow {
  id: string;
  groupId: string;
  label: string;
  icon: string;
  targetType: MenuNavTargetType;
  viewKey: string;
  moduleCode: string | null;
  linkUrl?: string | null;
  openInNewTab?: boolean;
  status: string;
  sortOrder: number;
  displayMode?: MenuDisplayMode;
}

export interface FilterMenuNavItemsOptions {
  blockedViewKeys?: string[];
}

/**
 * Same visibility as the sidebar: module views need active module + view; external links need a valid URL.
 */
export function filterMenuNavItems(
  items: MenuNavItemRow[],
  activeModuleCodes: string[],
  clientModules: ModuleClientDefinition[],
  options?: FilterMenuNavItemsOptions
): MenuNavItemRow[] {
  const activeCodeSet = new Set(activeModuleCodes.map((code) => String(code || '').toUpperCase()));
  const blockedViewSet = new Set((options?.blockedViewKeys || []).map((view) => String(view || '').trim()).filter(Boolean));
  const activeClientModules = clientModules.filter((m) =>
    activeCodeSet.has(String(m.code || '').toUpperCase())
  );
  const dynamicViewSet = new Set<string>();
  for (const mod of activeClientModules) {
    for (const v of Object.keys(mod.views || {})) {
      dynamicViewSet.add(v);
    }
  }

  return items
    .filter((item) => item.status === 'Active')
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter((item) => {
      if (item.targetType === 'MODULE_VIEW') {
        const moduleCode = String(item.moduleCode || '').toUpperCase();
        if (!moduleCode || !activeCodeSet.has(moduleCode)) return false;
        if (!dynamicViewSet.has(item.viewKey)) return false;
      }
      if (item.targetType === 'EXTERNAL_URL') {
        return Boolean(assertSafeMenuLinkUrl(item.linkUrl));
      }
      if (blockedViewSet.size > 0 && blockedViewSet.has(String(item.viewKey || '').trim())) {
        return false;
      }
      return true;
    });
}
