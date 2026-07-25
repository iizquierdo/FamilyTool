import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ViewType } from '@/types';
import type { ModuleClientDefinition } from '@/modules/module-contract';
import {
  normalizeDisplayMode,
  showIconInMenu,
  showTextInMenu,
  type MenuDisplayMode
} from '@/lib/menu-display';
import { filterMenuNavItems, type MenuNavItemRow } from '@/lib/menu-nav';
import { assertSafeMenuLinkUrl, navigateMenuLink } from '@/lib/menu-link';

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

interface AppHeaderNavProps {
  setView: (view: ViewType) => void;
  currentView?: string;
  activeModuleCodes: string[];
  clientModules: ModuleClientDefinition[];
  blockedViewKeys?: string[];
}

export const AppHeaderNav: React.FC<AppHeaderNavProps> = ({
  setView,
  currentView,
  activeModuleCodes,
  clientModules,
  blockedViewKeys = []
}) => {
  const [groups, setGroups] = useState<MenuConfigGroup[]>([]);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; minWidth: number } | null>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/menu-config');
      if (!res.ok) return;
      const data = await res.json();
      const list: MenuConfigGroup[] = Array.isArray(data?.groups) ? data.groups : [];
      setGroups(list);
    } catch {
      setGroups([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onMenusUpdated = () => load();
    window.addEventListener('menusUpdated', onMenusUpdated);
    return () => window.removeEventListener('menusUpdated', onMenusUpdated);
  }, [load]);

  useEffect(() => {
    if (!openDropdownId) return;
    const onClose = (e: MouseEvent) => {
      const t = e.target as Node;
      if (portalRef.current?.contains(t)) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest('[data-header-nav-trigger]')) return;
      setOpenDropdownId(null);
      setDropdownPos(null);
    };
    window.addEventListener('click', onClose);
    return () => window.removeEventListener('click', onClose);
  }, [openDropdownId]);

  const headerGroups = useMemo(() => {
    return (groups || [])
      .filter((g) => g.status === 'Active')
      .filter((g) => (g.placement || 'sidebar') === 'header')
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((g) => ({
        ...g,
        resolvedItems: filterMenuNavItems(g.items || [], activeModuleCodes, clientModules, {
          blockedViewKeys
        })
      }))
      .filter((g) => g.resolvedItems.length > 0);
  }, [groups, activeModuleCodes, clientModules, blockedViewKeys]);

  const openDropdownForGroup = (groupId: string, anchor: HTMLElement) => {
    const r = anchor.getBoundingClientRect();
    setDropdownPos({
      top: r.bottom + 6,
      left: r.left,
      minWidth: Math.max(176, r.width)
    });
    setOpenDropdownId(groupId);
  };

  const closeDropdown = () => {
    setOpenDropdownId(null);
    setDropdownPos(null);
  };

  const openGroup = headerGroups.find((g) => g.id === openDropdownId);
  const openItems = openGroup?.resolvedItems || [];

  if (!headerGroups.length) {
    return null;
  }

  const dropdownPortal =
    openDropdownId && dropdownPos && openItems.length
      ? createPortal(
          <div
            ref={portalRef}
            className="fixed z-[300] rounded-xl border border-border bg-popover py-1 shadow-xl"
            style={{
              top: dropdownPos.top,
              left: dropdownPos.left,
              minWidth: dropdownPos.minWidth
            }}
            role="menu"
          >
            {openItems.map((item) => {
              const isExt = item.targetType === 'EXTERNAL_URL';
              const active = !isExt && currentView === item.viewKey;
              const dm = normalizeDisplayMode(item.displayMode);
              const si = showIconInMenu(dm);
              const st = showTextInMenu(dm);
              const compact = si !== st;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    if (isExt && item.linkUrl) {
                      const u = assertSafeMenuLinkUrl(item.linkUrl);
                      if (u) navigateMenuLink(u, item.openInNewTab ?? false);
                      closeDropdown();
                      return;
                    }
                    setView(item.viewKey as ViewType);
                    closeDropdown();
                  }}
                  title={!st ? item.label : undefined}
                  aria-label={item.label}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium ${
                    active ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-accent'
                  } ${compact ? 'justify-center px-2' : ''}`}
                >
                  {si ? (
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-background">
                      <i className={`fa-solid ${item.icon} text-[11px]`} aria-hidden />
                    </span>
                  ) : null}
                  {st ? <span className="truncate">{item.label}</span> : null}
                  {!st ? <span className="sr-only">{item.label}</span> : null}
                </button>
              );
            })}
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <nav
        ref={navRef}
        aria-label="Header shortcuts"
        className="hidden min-w-0 flex-1 flex-wrap items-center justify-start gap-1 overflow-visible sm:flex"
      >
        {headerGroups.map((group) => {
          const items = group.resolvedItems;
          const single = items.length === 1 ? items[0] : null;
          const gdm = normalizeDisplayMode(group.displayMode);
          const gIcon = showIconInMenu(gdm);
          const gText = showTextInMenu(gdm);

          if (single) {
            const isExt = single.targetType === 'EXTERNAL_URL';
            const active = !isExt && currentView === single.viewKey;
            const dm = normalizeDisplayMode(single.displayMode);
            const si = showIconInMenu(dm);
            const st = showTextInMenu(dm);
            const compact = si !== st;
            return (
              <button
                key={group.id}
                type="button"
                title={single.label}
                aria-label={single.label}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isExt && single.linkUrl) {
                    const u = assertSafeMenuLinkUrl(single.linkUrl);
                    if (u) navigateMenuLink(u, single.openInNewTab ?? false);
                    return;
                  }
                  setView(single.viewKey as ViewType);
                }}
                className={`inline-flex h-9 max-w-[14rem] shrink-0 items-center gap-2 rounded-lg border px-2 text-sm transition-colors ${
                  compact ? (st ? 'px-2.5' : 'w-9 justify-center px-0') : 'px-2.5'
                } ${
                  active
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-transparent text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                {si ? (
                  <i className={`fa-solid ${single.icon || group.icon} shrink-0`} aria-hidden />
                ) : null}
                {st ? <span className="truncate text-xs font-semibold">{single.label}</span> : null}
                {!st ? <span className="sr-only">{single.label}</span> : null}
              </button>
            );
          }

          const open = openDropdownId === group.id;
          const childActive = items.some(
            (it) => it.targetType !== 'EXTERNAL_URL' && it.viewKey === currentView
          );
          const triggerCompact = gIcon !== gText;

          return (
            <div key={group.id} className="relative shrink-0">
              <button
                type="button"
                data-header-nav-trigger
                aria-expanded={open}
                aria-haspopup="menu"
                aria-label={gText ? group.label : `${group.label} menu`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (open) closeDropdown();
                  else openDropdownForGroup(group.id, e.currentTarget);
                }}
                className={`inline-flex h-9 max-w-[14rem] items-center gap-1.5 px-2.5 text-xs font-semibold transition-colors ${
                  triggerCompact ? 'max-w-none px-2' : ''
                } ${
                  open || childActive
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                } ${!gText && gIcon ? 'justify-center' : ''}`}
              >
                {gIcon ? <i className={`fa-solid ${group.icon} text-[11px]`} aria-hidden /> : null}
                {gText ? <span className="truncate">{group.label}</span> : null}
                {!gText ? <span className="sr-only">{group.label}</span> : null}
                <i className="fa-solid fa-chevron-down shrink-0 text-[9px] opacity-60" aria-hidden />
              </button>
            </div>
          );
        })}
      </nav>
      {dropdownPortal}
    </>
  );
};
