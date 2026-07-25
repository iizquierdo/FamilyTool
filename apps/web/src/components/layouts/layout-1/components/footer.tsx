import { useCallback, useEffect, useMemo, useState } from 'react';
import { generalSettings } from '@/config/general.config';
import type { ViewType } from '@/types';
import type { ModuleClientDefinition } from '@/modules/module-contract';
import { filterMenuNavItems, type MenuNavItemRow, type MenuNavTargetType } from '@/lib/menu-nav';
import { assertSafeMenuLinkUrl, navigateMenuLink } from '@/lib/menu-link';
import {
  normalizeDisplayMode,
  showIconInMenu,
  showTextInMenu,
  type MenuDisplayMode
} from '@/lib/menu-display';

interface MenuConfigGroup {
  id: string;
  key: string;
  label: string;
  icon: string;
  status: string;
  sortOrder: number;
  placement?: string;
  displayMode?: MenuDisplayMode;
  items: MenuNavItemRow[];
}

export interface AppFooterNavigationProps {
  setView: (view: ViewType) => void;
  currentView?: string;
  activeModuleCodes: string[];
  clientModules: ModuleClientDefinition[];
  blockedViewKeys?: string[];
}

interface FooterProps {
  /** When set, footer links come from menu groups with placement "footer" (menu management). */
  appNavigation?: AppFooterNavigationProps | null;
  /** Shown after the year in the copyright line. */
  appName?: string;
}

export function Footer({ appNavigation, appName = 'Sinapsis CRM/ERP' }: FooterProps) {
  const currentYear = new Date().getFullYear();
  const [groups, setGroups] = useState<MenuConfigGroup[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/menu-config');
      if (!res.ok) return;
      const data = await res.json();
      setGroups(Array.isArray(data?.groups) ? data.groups : []);
    } catch {
      setGroups([]);
    }
  }, []);

  useEffect(() => {
    if (!appNavigation) return;
    load();
  }, [appNavigation, load]);

  useEffect(() => {
    if (!appNavigation) return;
    const onMenusUpdated = () => load();
    window.addEventListener('menusUpdated', onMenusUpdated);
    return () => window.removeEventListener('menusUpdated', onMenusUpdated);
  }, [appNavigation, load]);

  const footerLinks = useMemo(() => {
    if (!appNavigation) return [];
    const { activeModuleCodes, clientModules, blockedViewKeys = [] } = appNavigation;
    const rows: Array<{
      id: string;
      label: string;
      viewKey: string;
      icon: string;
      displayMode: MenuDisplayMode;
      targetType: MenuNavTargetType;
      linkUrl?: string | null;
      openInNewTab?: boolean;
    }> = [];
    const footerGroups = (groups || [])
      .filter((g) => g.status === 'Active')
      .filter((g) => (g.placement || 'sidebar') === 'footer')
      .sort((a, b) => a.sortOrder - b.sortOrder);

    for (const group of footerGroups) {
      const items = filterMenuNavItems(group.items || [], activeModuleCodes, clientModules, {
        blockedViewKeys
      });
      for (const item of items) {
        rows.push({
          id: item.id,
          label: item.label,
          viewKey: item.viewKey,
          icon: item.icon,
          displayMode: normalizeDisplayMode(item.displayMode),
          targetType: item.targetType,
          linkUrl: item.linkUrl,
          openInNewTab: item.openInNewTab
        });
      }
    }
    return rows;
  }, [groups, appNavigation]);

  const showLegacyLinks = !appNavigation;
  const hasDynamicFooter = Boolean(appNavigation && footerLinks.length > 0);

  return (
    <footer className="footer">
      <div className="container">
        <div className="flex flex-col md:flex-row justify-center md:justify-between items-center gap-1.5 py-1.5">
          <div className="flex order-2 flex-wrap items-center gap-2 font-normal text-xs md:order-1">
            <span className="text-muted-foreground">
              {currentYear} &copy; {appName}
            </span>
          </div>
          <nav
            className="text-muted-foreground flex order-1 flex-wrap justify-center gap-4 text-xs md:order-2"
            aria-label="Footer"
          >
            {hasDynamicFooter &&
              footerLinks.map((link) => {
                const isExt = link.targetType === 'EXTERNAL_URL';
                const active = !isExt && appNavigation?.currentView === link.viewKey;
                const si = showIconInMenu(link.displayMode);
                const st = showTextInMenu(link.displayMode);
                const compact = si !== st;
                return (
                  <button
                    key={link.id}
                    type="button"
                    title={!st ? link.label : undefined}
                    aria-label={link.label}
                    onClick={() => {
                      if (isExt && link.linkUrl) {
                        const u = assertSafeMenuLinkUrl(link.linkUrl);
                        if (u) navigateMenuLink(u, link.openInNewTab ?? false);
                        return;
                      }
                      appNavigation?.setView(link.viewKey as ViewType);
                    }}
                    className={`inline-flex items-center gap-1.5 ${
                      active
                        ? 'font-semibold text-primary hover:text-primary/90'
                        : 'hover:text-primary'
                    } ${compact ? 'p-1' : ''}`}
                  >
                    {si ? <i className={`fa-solid ${link.icon} text-[11px] opacity-80`} aria-hidden /> : null}
                    {st ? <span>{link.label}</span> : null}
                    {!st ? <span className="sr-only">{link.label}</span> : null}
                  </button>
                );
              })}
            {showLegacyLinks && generalSettings.docsLink ? (
              <a href={generalSettings.docsLink} target="_blank" rel="noreferrer" className="hover:text-primary">
                Docs
              </a>
            ) : null}
            {showLegacyLinks ? (
              <a href={generalSettings.faqLink} target="_blank" rel="noreferrer" className="hover:text-primary">
                FAQ
              </a>
            ) : null}
            {showLegacyLinks ? (
              <a href={generalSettings.devsLink} target="_blank" rel="noreferrer" className="hover:text-primary">
                Support
              </a>
            ) : null}
          </nav>
        </div>
      </div>
    </footer>
  );
}
