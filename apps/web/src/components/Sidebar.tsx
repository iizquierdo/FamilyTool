import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ViewType } from '../types';
import { ModuleClientDefinition } from '../modules/module-contract';
import {
  normalizeDisplayMode,
  showIconInMenu,
  showTextInMenu,
  type MenuDisplayMode
} from '@/lib/menu-display';
import { assertSafeMenuLinkUrl, navigateMenuLink } from '@/lib/menu-link';
import { cn } from '@/lib/utils';

/** Marca por defecto del rail (icono claro sobre fondo oscuro, p. ej. fondo #000). */
function DefaultSidebarRailLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      className={cn('size-8 shrink-0 text-white', className)}
      aria-hidden
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M10 30 L20 8 L30 30"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="30" r="4" fill="currentColor" />
      <circle cx="20" cy="8" r="4" fill="currentColor" />
      <circle cx="30" cy="30" r="4" fill="currentColor" />
    </svg>
  );
}

interface SidebarProps {
  currentView: ViewType;
  setView: (view: ViewType) => void;
  selectedCompanyId: string;
  onCompanyChange: (id: string) => void;
  allowedCompanyIds?: string[];
  userCompanyId?: string;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  onCompanyLabelChange?: (name: string) => void;
  activeModuleCodes: string[];
  clientModules: ModuleClientDefinition[];
  /** Fondo del rail estrecho izquierdo (Core; por defecto #000000). */
  sidebarBackgroundColor?: string | null;
  /** Logo del rail opcional (Core); si falta, se muestra la marca por defecto. */
  sidebarLogoUrl?: string | null;
}

interface MenuConfigItem {
  id: string;
  groupId: string;
  label: string;
  icon: string;
  targetType: 'STATIC_VIEW' | 'MODULE_VIEW' | 'EXTERNAL_URL';
  viewKey: ViewType;
  moduleCode: string | null;
  linkUrl?: string | null;
  openInNewTab?: boolean;
  status: 'Active' | 'Inactive';
  sortOrder: number;
  displayMode?: MenuDisplayMode;
}

interface MenuConfigGroup {
  id: string;
  key: string;
  label: string;
  icon: string;
  status: 'Active' | 'Inactive';
  sortOrder: number;
  placement?: string;
  displayMode?: MenuDisplayMode;
  items: MenuConfigItem[];
}

interface ResolvedMenuItem {
  id: string;
  name: string;
  view: ViewType;
  icon: string;
  displayMode: MenuDisplayMode;
  targetType: 'STATIC_VIEW' | 'MODULE_VIEW' | 'EXTERNAL_URL';
  externalUrl?: string;
  openInNewTab?: boolean;
}

interface ResolvedMenuGroup {
  id: string;
  key: string;
  label: string;
  icon: string;
  items: ResolvedMenuItem[];
  sortOrder: number;
  groupDisplayMode: MenuDisplayMode;
}

const TENANT_BLOCKED_SETTINGS_VIEWS = new Set<ViewType>([
  'ModuleSettings',
  'SMTPSettings',
  'LanguageSettings',
  'StorageSettings',
  'MenuSettings'
]);

const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  setView,
  selectedCompanyId,
  onCompanyChange,
  allowedCompanyIds = [],
  userCompanyId,
  mobileOpen = false,
  onMobileClose,
  onCompanyLabelChange,
  activeModuleCodes,
  clientModules,
  sidebarBackgroundColor,
  sidebarLogoUrl
}) => {
  const { t } = useTranslation();
  const [selectedMain, setSelectedMain] = useState<string>('dashboard');
  const [isCompanyOpen, setIsCompanyOpen] = useState(false);
  const [organization, setOrganization] = useState<{ id: string; name: string } | null>(null);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [menuConfigGroups, setMenuConfigGroups] = useState<MenuConfigGroup[]>([]);

  const activeCodeSet = useMemo(
    () => new Set(activeModuleCodes.map((code) => String(code || '').toUpperCase())),
    [activeModuleCodes]
  );

  const activeClientModules = useMemo(
    () => clientModules.filter((module) => activeCodeSet.has(String(module.code || '').toUpperCase())),
    [clientModules, activeCodeSet]
  );

  const dynamicViewSet = useMemo(() => {
    const views = new Set<string>();
    for (const module of activeClientModules) {
      for (const view of Object.keys(module.views || {})) {
        views.add(view);
      }
    }
    return views;
  }, [activeClientModules]);

  const fetchMenuConfig = async () => {
    try {
      const response = await fetch('/api/menu-config');
      if (!response.ok) throw new Error('Failed to load menu configuration');
      const data = await response.json();
      const groups = Array.isArray(data?.groups) ? data.groups : [];
      setMenuConfigGroups(groups);
    } catch {
      setMenuConfigGroups([]);
    }
  };

  useEffect(() => {
    fetchMenuConfig();
  }, []);

  const resolvedMenuGroups = useMemo(() => {
    const groups: ResolvedMenuGroup[] = [];
    const configuredGroups = (menuConfigGroups || [])
      .filter((group) => group.status === 'Active')
      .filter((group) => (group.placement || 'sidebar') === 'sidebar')
      .sort((a, b) => a.sortOrder - b.sortOrder);

    for (const group of configuredGroups) {
      const resolvedItems = (group.items || [])
        .filter((item) => item.status === 'Active')
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .filter((item) => {
          if (item.targetType === 'MODULE_VIEW') {
            const moduleCode = String(item.moduleCode || '').toUpperCase();
            if (!moduleCode || !activeCodeSet.has(moduleCode)) return false;
            if (!dynamicViewSet.has(item.viewKey)) return false;
          }
          if (item.targetType !== 'EXTERNAL_URL' && TENANT_BLOCKED_SETTINGS_VIEWS.has(item.viewKey)) {
            return false;
          }
          if (item.targetType === 'EXTERNAL_URL') {
            return Boolean(assertSafeMenuLinkUrl(item.linkUrl));
          }
          return true;
        })
        .map((item) => {
          const dm = normalizeDisplayMode(item.displayMode);
          if (item.targetType === 'EXTERNAL_URL') {
            const url = assertSafeMenuLinkUrl(item.linkUrl);
            return {
              id: item.id,
              name: item.label,
              view: '' as ViewType,
              icon: item.icon,
              displayMode: dm,
              targetType: 'EXTERNAL_URL' as const,
              externalUrl: url || '',
              openInNewTab: Boolean(item.openInNewTab)
            };
          }
          return {
            id: item.id,
            name: item.label,
            view: item.viewKey,
            icon: item.icon,
            displayMode: dm,
            targetType: item.targetType === 'MODULE_VIEW' ? ('MODULE_VIEW' as const) : ('STATIC_VIEW' as const)
          };
        });

      groups.push({
        id: group.id,
        key: group.key,
        label: group.label,
        icon: group.icon,
        items: resolvedItems,
        sortOrder: group.sortOrder,
        groupDisplayMode: normalizeDisplayMode(group.displayMode)
      });
    }

    const orderedGroups = groups
      .filter((group) => group.items.length > 0 || group.key === 'dashboard' || group.key === 'settings')
      .sort((a, b) => a.sortOrder - b.sortOrder);

    if (!orderedGroups.length) {
      return [
        {
          id: 'fallback-dashboard',
          key: 'dashboard',
          label: 'Dashboard',
          icon: 'fa-chart-line',
          items: [
            {
              id: 'fallback-dashboard-item',
              name: 'Dashboard',
              view: 'Dashboard',
              icon: 'fa-chart-pie',
              displayMode: 'icon_and_text' as MenuDisplayMode,
              targetType: 'STATIC_VIEW' as const
            }
          ],
          sortOrder: 10,
          groupDisplayMode: 'icon_and_text' as MenuDisplayMode
        }
      ];
    }

    return orderedGroups;
  }, [menuConfigGroups, activeCodeSet, dynamicViewSet]);

  const viewToMain = useMemo(() => {
    const map: Record<string, string> = {};
    for (const group of resolvedMenuGroups) {
      for (const item of group.items) {
        if (item.targetType === 'EXTERNAL_URL') continue;
        if (item.view) map[item.view] = group.key;
      }
    }
    return map;
  }, [resolvedMenuGroups]);

  const fetchData = () => {
    fetch('/api/organization')
      .then((res) => res.json())
      .then((data) => setOrganization(data))
      .catch(() => setOrganization({ id: 'org', name: 'Sinapsis Org' }));

    fetch('/api/companies?status=Active')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: { id: string; name: string }[]) => {
        const allowedSet = new Set<string>([
          ...allowedCompanyIds,
          ...(userCompanyId ? [userCompanyId] : [])
        ].filter(Boolean));

        const filtered = allowedSet.size > 0
          ? data.filter((company) => allowedSet.has(company.id))
          : [];

        setCompanies(filtered);
      })
      .catch(() => setCompanies([]));
  };

  useEffect(() => {
    fetchData();
    window.addEventListener('companiesUpdated', fetchData);
    window.addEventListener('menusUpdated', fetchMenuConfig);
    return () => {
      window.removeEventListener('companiesUpdated', fetchData);
      window.removeEventListener('menusUpdated', fetchMenuConfig);
    };
  }, [JSON.stringify(allowedCompanyIds), userCompanyId]);

  useEffect(() => {
    if (selectedCompanyId !== 'org' && !companies.some((c) => c.id === selectedCompanyId)) {
      onCompanyChange('org');
    }
  }, [selectedCompanyId, companies, onCompanyChange]);

  useEffect(() => {
    const targetMain = viewToMain[currentView];
    if (targetMain) {
      setSelectedMain(targetMain);
      return;
    }
    setSelectedMain(resolvedMenuGroups[0]?.key || 'dashboard');
  }, [currentView, viewToMain, resolvedMenuGroups]);

  const railBackground = (sidebarBackgroundColor || '#000000').trim() || '#000000';

  const selectedItemName = selectedCompanyId === 'org'
    ? (organization?.name || 'Loading...')
    : (companies.find((c) => c.id === selectedCompanyId)?.name || 'Select Company');

  useEffect(() => {
    if (onCompanyLabelChange) onCompanyLabelChange(selectedItemName);
  }, [selectedItemName, onCompanyLabelChange]);

  const mainIcons = resolvedMenuGroups.map((group) => ({ id: group.key, icon: group.icon }));
  const selectedGroup = resolvedMenuGroups.find((group) => group.key === selectedMain) || resolvedMenuGroups[0];

  const handleNavigate = (view: ViewType) => {
    setView(view);
    if (onMobileClose) onMobileClose();
  };

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close sidebar overlay"
          onClick={onMobileClose}
          className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-[1px] lg:hidden"
        />
      )}

      <div className={`fixed bottom-0 left-0 top-0 z-40 flex shrink-0 border-r border-border bg-background transition-transform duration-300 lg:static lg:inset-auto lg:z-auto lg:h-full ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
        <aside
          className="flex w-[56px] shrink-0 flex-col items-center border-r border-white/10 py-4 shadow-2xl"
          style={{ backgroundColor: railBackground }}
        >
          <div className="mb-6 flex h-9 w-9 cursor-pointer items-center justify-center" onClick={() => handleNavigate('Dashboard')}>
            {sidebarLogoUrl?.trim() ? (
              <img
                src={sidebarLogoUrl.trim()}
                alt=""
                className="h-7 w-7 object-contain transition-transform duration-300 hover:scale-110"
              />
            ) : (
              <DefaultSidebarRailLogo className="h-7 w-7" />
            )}
          </div>

          <nav className="flex-1 space-y-3.5">
            {mainIcons.map((item) => (
              <button
                key={item.id}
                onClick={() => setSelectedMain(item.id)}
                className={`flex size-9 items-center justify-center rounded-xl transition-all duration-300 ${selectedMain === item.id
                  ? 'border border-white/20 bg-white/10 text-white shadow-[0_0_12px_rgba(255,255,255,0.08)]'
                  : 'text-white/40 hover:bg-white/5 hover:text-white/80'
                  }`}
              >
                <i className={`fa-solid ${item.icon} text-sm`}></i>
              </button>
            ))}
          </nav>
          <div className="mt-auto pb-4"></div>
        </aside>

        <aside className="flex w-[63.75vw] flex-col bg-white sm:w-[13.6rem] lg:max-w-none">
          <div className="border-b border-slate-100 px-4 py-3 lg:hidden">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-bold text-slate-900">Menu</span>
              <button
                type="button"
                onClick={onMobileClose}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500"
                aria-label="Close menu"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
          </div>

          <div className="relative p-4">
            <button
              onClick={() => setIsCompanyOpen(!isCompanyOpen)}
              className="group flex w-full items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-2 transition-colors hover:bg-slate-100"
            >
              <div className="flex items-center gap-2">
                <div className="flex h-5 w-5 items-center justify-center rounded border border-white/20 bg-primary shadow-sm">
                  <i className={`fa-solid ${selectedCompanyId === 'org' ? 'fa-sitemap' : 'fa-building'} text-[10px] text-white`}></i>
                </div>
                <span className="max-w-[150px] truncate text-sm font-semibold text-slate-700">{selectedItemName}</span>
              </div>
              <i className={`fa-solid fa-chevron-down text-[10px] text-slate-400 transition-transform ${isCompanyOpen ? 'rotate-180' : ''}`}></i>
            </button>

            {isCompanyOpen && (
              <div className="absolute left-4 right-4 z-50 mt-1 animate-in fade-in slide-in-from-top-2 rounded-xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-200/50 duration-200">
                <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">{t('sidebar.selectCompany')}</p>
                <div className="mt-1 max-h-[300px] space-y-1 overflow-y-auto">
                  <button
                    onClick={() => {
                      onCompanyChange('org');
                      setIsCompanyOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition-all ${selectedCompanyId === 'org'
                      ? 'bg-primary/10 text-primary'
                      : 'text-slate-600 hover:bg-slate-50'
                      }`}
                  >
                    <i className="fa-solid fa-sitemap text-[10px] opacity-70"></i>
                    {organization?.name || 'Organization'}
                    {selectedCompanyId === 'org' && <i className="fa-solid fa-check ml-auto text-primary"></i>}
                  </button>

                  <div className="mx-2 my-1 h-[1px] bg-slate-100"></div>

                  {companies.map((company) => (
                    <button
                      key={company.id}
                      onClick={() => {
                        onCompanyChange(company.id);
                        setIsCompanyOpen(false);
                      }}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-all ${selectedCompanyId === company.id
                        ? 'bg-primary/10 text-primary'
                        : 'text-slate-600 hover:bg-slate-50'
                        }`}
                    >
                      <i className="fa-solid fa-building text-[10px] opacity-40"></i>
                      <span className="truncate">{company.name}</span>
                      {selectedCompanyId === company.id && <i className="fa-solid fa-check ml-auto text-primary"></i>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <nav className="flex-1 space-y-6 overflow-y-auto px-4 py-2">
            {selectedGroup && (
              <div>
                {showTextInMenu(selectedGroup.groupDisplayMode) ? (
                  <h3 className="mb-3 ml-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">{t(selectedGroup.label)}</h3>
                ) : null}
                <div className="space-y-1">
                  {selectedGroup.items.map((item) => {
                    const si = showIconInMenu(item.displayMode);
                    const st = showTextInMenu(item.displayMode);
                    const compact = si !== st;
                    const isExternal = item.targetType === 'EXTERNAL_URL';
                    const isActive = !isExternal && currentView === item.view;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        title={!st ? t(item.name) : undefined}
                        aria-label={t(item.name)}
                        onClick={() => {
                          if (isExternal && item.externalUrl) {
                            navigateMenuLink(item.externalUrl, item.openInNewTab ?? false);
                            if (onMobileClose) onMobileClose();
                            return;
                          }
                          if (item.view === 'CompanySettings') window.dispatchEvent(new CustomEvent('resetCompanySelection'));
                          if (item.view === 'UserSettings') window.dispatchEvent(new CustomEvent('resetUserSelection'));
                          handleNavigate(item.view);
                        }}
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 ${isActive
                          ? 'bg-primary/10 text-primary'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                          } ${compact ? 'justify-center px-2' : ''}`}
                      >
                        {si ? (
                          <i className={`fa-solid ${item.icon} w-4 shrink-0 text-center opacity-70`} aria-hidden />
                        ) : null}
                        {st ? <span className="truncate">{t(item.name)}</span> : null}
                        {!st ? <span className="sr-only">{t(item.name)}</span> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </nav>
        </aside>
      </div>
    </>
  );
};

export default Sidebar;
