import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { ModuleClientDefinition } from '../modules/module-contract';
import { normalizeDisplayMode, type MenuDisplayMode } from '@/lib/menu-display';
import {
  getImplicitSidebarContributions,
  type ImplicitSidebarContribution
} from '@/lib/implicit-sidebar-modules';

const DISPLAY_MODES: MenuDisplayMode[] = ['icon_only', 'text_only', 'icon_and_text'];

type MenuTargetType = 'STATIC_VIEW' | 'MODULE_VIEW' | 'EXTERNAL_URL';
type MenuStatus = 'Active' | 'Inactive';
type MenuPlacement = 'sidebar' | 'header' | 'footer';

const normalizePlacement = (value: string | undefined): MenuPlacement => {
  const v = String(value || '').toLowerCase();
  if (v === 'header' || v === 'footer') return v;
  return 'sidebar';
};

interface MenuItem {
  id: string;
  groupId: string;
  label: string;
  icon: string;
  targetType: MenuTargetType;
  viewKey: string;
  moduleCode: string | null;
  linkUrl?: string | null;
  openInNewTab?: boolean;
  status: MenuStatus;
  sortOrder: number;
  displayMode?: MenuDisplayMode;
}

interface MenuGroup {
  id: string;
  key: string;
  label: string;
  icon: string;
  status: MenuStatus;
  sortOrder: number;
  placement?: MenuPlacement;
  displayMode?: MenuDisplayMode;
  items: MenuItem[];
}

interface CatalogEntry {
  id: string;
  label: string;
  icon: string;
  viewKey: string;
  targetType: MenuTargetType;
  moduleCode: string | null;
  origin: 'core' | 'module';
  moduleLabel?: string;
  enabled: boolean;
}

interface GroupFormState {
  label: string;
  icon: string;
  status: MenuStatus;
  displayMode: MenuDisplayMode;
}

interface ItemFormState {
  groupId: string;
  label: string;
  icon: string;
  targetType: MenuTargetType;
  viewKey: string;
  moduleCode: string;
  linkUrl: string;
  openInNewTab: boolean;
  status: MenuStatus;
  displayMode: MenuDisplayMode;
}

interface MenuManagementProps {
  clientModules: ModuleClientDefinition[];
  activeModuleCodes: string[];
  apiBasePath?: string;
  defaultHeaders?: HeadersInit;
}

const CORE_CATALOG_BASE: Array<Omit<CatalogEntry, 'label'> & { labelKey: string }> = [
  { id: 'core:Dashboard', labelKey: 'sidebar.dashboard', icon: 'fa-chart-pie', viewKey: 'Dashboard', targetType: 'STATIC_VIEW', moduleCode: null, origin: 'core', enabled: true },
  { id: 'core:OrganizationSettings', labelKey: 'sidebar.organization', icon: 'fa-sitemap', viewKey: 'OrganizationSettings', targetType: 'STATIC_VIEW', moduleCode: null, origin: 'core', enabled: true },
  { id: 'core:MyPlanSettings', labelKey: 'sidebar.myPlan', icon: 'fa-rectangle-list', viewKey: 'MyPlanSettings', targetType: 'STATIC_VIEW', moduleCode: null, origin: 'core', enabled: true },
  { id: 'core:CompanySettings', labelKey: 'sidebar.companies', icon: 'fa-building-shield', viewKey: 'CompanySettings', targetType: 'STATIC_VIEW', moduleCode: null, origin: 'core', enabled: true },
  { id: 'core:UserSettings', labelKey: 'sidebar.users', icon: 'fa-user-gear', viewKey: 'UserSettings', targetType: 'STATIC_VIEW', moduleCode: null, origin: 'core', enabled: true },
  { id: 'core:RoleSettings', labelKey: 'sidebar.roles', icon: 'fa-user-shield', viewKey: 'RoleSettings', targetType: 'STATIC_VIEW', moduleCode: null, origin: 'core', enabled: true },
  { id: 'core:ModuleSettings', labelKey: 'sidebar.modules', icon: 'fa-cubes', viewKey: 'ModuleSettings', targetType: 'STATIC_VIEW', moduleCode: null, origin: 'core', enabled: true },
  { id: 'core:SMTPSettings', labelKey: 'sidebar.smtp', icon: 'fa-at', viewKey: 'SMTPSettings', targetType: 'STATIC_VIEW', moduleCode: null, origin: 'core', enabled: true },
  { id: 'core:LanguageSettings', labelKey: 'sidebar.translations', icon: 'fa-language', viewKey: 'LanguageSettings', targetType: 'STATIC_VIEW', moduleCode: null, origin: 'core', enabled: true },
  { id: 'core:StorageSettings', labelKey: 'sidebar.storage', icon: 'fa-database', viewKey: 'StorageSettings', targetType: 'STATIC_VIEW', moduleCode: null, origin: 'core', enabled: true },
  { id: 'core:CategorySettings', labelKey: 'sidebar.categories', icon: 'fa-tags', viewKey: 'CategorySettings', targetType: 'STATIC_VIEW', moduleCode: null, origin: 'core', enabled: true },
  { id: 'core:ReferenceSettings', labelKey: 'sidebar.references', icon: 'fa-hashtag', viewKey: 'ReferenceSettings', targetType: 'STATIC_VIEW', moduleCode: null, origin: 'core', enabled: true },
  { id: 'core:MenuSettings', labelKey: 'sidebar.menus', icon: 'fa-bars-staggered', viewKey: 'MenuSettings', targetType: 'STATIC_VIEW', moduleCode: null, origin: 'core', enabled: true }
];

const MenuManagement: React.FC<MenuManagementProps> = ({ clientModules, activeModuleCodes, apiBasePath = '/api/menu-config', defaultHeaders }) => {
  const { t } = useTranslation();
  const apiFetch = (path: string, init?: RequestInit) => {
    const headers = new Headers(defaultHeaders || {});
    const requestHeaders = new Headers(init?.headers || {});
    requestHeaders.forEach((value, key) => headers.set(key, value));
    return fetch(`${apiBasePath}${path}`, { ...(init || {}), headers });
  };

  const displayModeOptionLabel = (mode: MenuDisplayMode) => {
    if (mode === 'icon_only') return t('settings.menuDisplayIconOnly') || 'Icon only';
    if (mode === 'text_only') return t('settings.menuDisplayTextOnly') || 'Text only';
    return t('settings.menuDisplayIconAndText') || 'Icon and text';
  };

  const displayModeBadge = (mode: MenuDisplayMode | undefined) => {
    const m = mode || 'icon_and_text';
    if (m === 'icon_only') return t('settings.menuDisplayBadgeIcon') || 'Icon';
    if (m === 'text_only') return t('settings.menuDisplayBadgeText') || 'Text';
    return t('settings.menuDisplayBadgeBoth') || 'Both';
  };
  const [groups, setGroups] = useState<MenuGroup[]>([]);
  const [placementTab, setPlacementTab] = useState<MenuPlacement>('sidebar');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<MenuGroup | null>(null);
  const [groupForm, setGroupForm] = useState<GroupFormState>({
    label: '',
    icon: 'fa-folder',
    status: 'Active',
    displayMode: 'icon_and_text'
  });

  const [materializingKey, setMaterializingKey] = useState<string | null>(null);
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [itemForm, setItemForm] = useState<ItemFormState>({
    groupId: '',
    label: '',
    icon: 'fa-link',
    targetType: 'STATIC_VIEW',
    viewKey: '',
    moduleCode: '',
    linkUrl: '',
    openInNewTab: false,
    status: 'Active',
    displayMode: 'icon_and_text'
  });

  const fetchConfig = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('');
      if (!res.ok) throw new Error('Failed to load menu config');
      const data = await res.json();
      const raw: MenuGroup[] = Array.isArray(data?.groups) ? data.groups : [];
      const nextGroups = raw.map((g) => ({
        ...g,
        placement: normalizePlacement(g.placement),
        displayMode: normalizeDisplayMode(g.displayMode),
        items: (g.items || []).map((it) => ({
          ...it,
          displayMode: normalizeDisplayMode(it.displayMode)
        }))
      }));
      setGroups(nextGroups);
    } catch (err: any) {
      setError(err?.message || 'Failed to load menu config');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const visibleGroups = useMemo(
    () =>
      groups
        .filter((g) => normalizePlacement(g.placement) === placementTab)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [groups, placementTab]
  );

  const sidebarConfiguredGroups = useMemo(
    () => groups.filter((g) => normalizePlacement(g.placement) === 'sidebar'),
    [groups]
  );

  const implicitSidebarContributions = useMemo(
    () =>
      placementTab !== 'sidebar'
        ? []
        : getImplicitSidebarContributions(sidebarConfiguredGroups, clientModules, activeModuleCodes),
    [placementTab, sidebarConfiguredGroups, clientModules, activeModuleCodes]
  );

  useEffect(() => {
    setSelectedGroupId((prev) => {
      if (prev && visibleGroups.some((g) => g.id === prev)) return prev;
      return visibleGroups[0]?.id || '';
    });
  }, [placementTab, visibleGroups]);

  const selectedGroup = useMemo(
    () => visibleGroups.find((group) => group.id === selectedGroupId) || null,
    [visibleGroups, selectedGroupId]
  );

  const catalog = useMemo(() => {
    const enabledCodes = new Set(activeModuleCodes.map((code) => String(code || '').toUpperCase()));
    const moduleEntries: CatalogEntry[] = [];
    const coreEntries: CatalogEntry[] = CORE_CATALOG_BASE.map((entry) => ({
      ...entry,
      label: t(entry.labelKey)
    }));

    for (const module of clientModules) {
      const moduleCode = String(module.code || '').toUpperCase();
      for (const section of module.sidebarSections || []) {
        for (const item of section.items || []) {
          moduleEntries.push({
            id: `module:${moduleCode}:${item.view}`,
            label: t(item.name),
            icon: item.icon,
            viewKey: item.view,
            targetType: 'MODULE_VIEW',
            moduleCode,
            origin: 'module',
            moduleLabel: moduleCode,
            enabled: enabledCodes.has(moduleCode)
          });
        }
      }
    }

    return [...coreEntries, ...moduleEntries];
  }, [clientModules, activeModuleCodes, t]);

  const filteredCatalog = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter((entry) => {
      const hay = [
        entry.label,
        entry.viewKey,
        entry.moduleLabel || '',
        entry.moduleCode || '',
        entry.id
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [catalog, catalogSearch]);

  const openCreateGroupModal = () => {
    setEditingGroup(null);
    setGroupForm({ label: '', icon: 'fa-folder', status: 'Active', displayMode: 'icon_and_text' });
    setGroupModalOpen(true);
  };

  const openEditGroupModal = (group: MenuGroup) => {
    setEditingGroup(group);
    setGroupForm({
      label: group.label,
      icon: group.icon,
      status: group.status,
      displayMode: normalizeDisplayMode(group.displayMode)
    });
    setGroupModalOpen(true);
  };

  const saveGroup = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload = {
      label: groupForm.label.trim(),
      icon: groupForm.icon.trim() || 'fa-folder',
      status: groupForm.status,
      displayMode: groupForm.displayMode
    };
    if (!payload.label) return;

    const url = editingGroup ? `/groups/${editingGroup.id}` : '/groups';
    const method = editingGroup ? 'PUT' : 'POST';
    const body = editingGroup ? payload : { ...payload, placement: placementTab };
    const res = await apiFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (res.ok) {
      setGroupModalOpen(false);
      await fetchConfig();
      window.dispatchEvent(new CustomEvent('menusUpdated'));
    } else {
      alert(t('settings.menuErrorSaveGroup') || 'Error saving menu group');
    }
  };

  const deleteGroup = async (groupId: string) => {
    if (!confirm(t('settings.menuConfirmDeleteGroup') || 'Delete this group and its submenu items?')) return;
    const res = await apiFetch(`/groups/${groupId}`, { method: 'DELETE' });
    if (res.ok) {
      await fetchConfig();
      window.dispatchEvent(new CustomEvent('menusUpdated'));
    }
  };

  const moveGroup = async (groupId: string, direction: 'up' | 'down') => {
    const currentIndex = visibleGroups.findIndex((group) => group.id === groupId);
    if (currentIndex === -1) return;
    const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (nextIndex < 0 || nextIndex >= visibleGroups.length) return;

    const reordered = [...visibleGroups];
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(nextIndex, 0, moved);
    setGroups((prev) => {
      const others = prev.filter((g) => normalizePlacement(g.placement) !== placementTab);
      return [...others, ...reordered];
    });

    await apiFetch('/groups/reorder', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupIds: reordered.map((group) => group.id) })
    });
    await fetchConfig();
    window.dispatchEvent(new CustomEvent('menusUpdated'));
  };

  const persistGroupOrder = async (orderedIds: string[]) => {
    await apiFetch('/groups/reorder', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupIds: orderedIds })
    });
    await fetchConfig();
    window.dispatchEvent(new CustomEvent('menusUpdated'));
  };

  const mergePlacementGroups = (reordered: MenuGroup[]) => {
    setGroups((prev) => {
      const others = prev.filter((g) => normalizePlacement(g.placement) !== placementTab);
      return [...others, ...reordered];
    });
  };

  const openCreateItemModal = (entry?: CatalogEntry) => {
    setEditingItem(null);
    setItemForm({
      groupId: selectedGroupId || visibleGroups[0]?.id || '',
      label: entry?.label || '',
      icon: entry?.icon || 'fa-link',
      targetType: entry?.targetType || 'STATIC_VIEW',
      viewKey: entry?.viewKey || '',
      moduleCode: entry?.moduleCode || '',
      linkUrl: '',
      openInNewTab: false,
      status: 'Active',
      displayMode: 'icon_and_text'
    });
    setItemModalOpen(true);
  };

  const openFreeLinkItemModal = () => {
    setEditingItem(null);
    setItemForm({
      groupId: selectedGroupId || visibleGroups[0]?.id || '',
      label: '',
      icon: 'fa-arrow-up-right-from-square',
      targetType: 'EXTERNAL_URL',
      viewKey: '',
      moduleCode: '',
      linkUrl: '',
      openInNewTab: false,
      status: 'Active',
      displayMode: 'icon_and_text'
    });
    setItemModalOpen(true);
  };

  const openEditItemModal = (item: MenuItem) => {
    setEditingItem(item);
    setItemForm({
      groupId: item.groupId,
      label: item.label,
      icon: item.icon,
      targetType: item.targetType,
      viewKey: item.viewKey,
      moduleCode: item.moduleCode || '',
      linkUrl: item.linkUrl || '',
      openInNewTab: Boolean(item.openInNewTab),
      status: item.status,
      displayMode: normalizeDisplayMode(item.displayMode)
    });
    setItemModalOpen(true);
  };

  const saveItem = async (event: React.FormEvent) => {
    event.preventDefault();
    const isExt = itemForm.targetType === 'EXTERNAL_URL';
    if (!itemForm.groupId.trim() || !itemForm.label.trim()) return;
    if (!isExt && !itemForm.viewKey.trim()) return;
    if (isExt && !itemForm.linkUrl.trim()) {
      alert(t('settings.menuFreeLinkUrlRequired') || 'Enter a valid URL for the free link.');
      return;
    }

    const payload: Record<string, unknown> = {
      groupId: itemForm.groupId,
      label: itemForm.label.trim(),
      icon: itemForm.icon.trim() || 'fa-link',
      targetType: itemForm.targetType,
      status: itemForm.status,
      displayMode: itemForm.displayMode
    };

    if (isExt) {
      payload.linkUrl = itemForm.linkUrl.trim();
      payload.openInNewTab = itemForm.openInNewTab;
      payload.moduleCode = null;
    } else {
      payload.viewKey = itemForm.viewKey.trim();
      payload.moduleCode =
        itemForm.targetType === 'MODULE_VIEW' ? (itemForm.moduleCode.trim().toUpperCase() || null) : null;
      payload.linkUrl = null;
      payload.openInNewTab = false;
    }

    const url = editingItem ? `/items/${editingItem.id}` : '/items';
    const method = editingItem ? 'PUT' : 'POST';
    const res = await apiFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      setItemModalOpen(false);
      await fetchConfig();
      window.dispatchEvent(new CustomEvent('menusUpdated'));
    } else {
      alert(t('settings.menuErrorSaveItem') || 'Error saving menu item');
    }
  };

  const deleteItem = async (itemId: string) => {
    if (!confirm(t('settings.menuConfirmDeleteItem') || 'Delete this menu item?')) return;
    const res = await apiFetch(`/items/${itemId}`, { method: 'DELETE' });
    if (res.ok) {
      await fetchConfig();
      window.dispatchEvent(new CustomEvent('menusUpdated'));
    }
  };

  const moveItem = async (itemId: string, direction: 'up' | 'down') => {
    if (!selectedGroup) return;
    const list = selectedGroup.items || [];
    const currentIndex = list.findIndex((item) => item.id === itemId);
    if (currentIndex === -1) return;
    const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (nextIndex < 0 || nextIndex >= list.length) return;

    const reordered = [...list];
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(nextIndex, 0, moved);

    setGroups((prev) =>
      prev.map((group) => (group.id === selectedGroup.id ? { ...group, items: reordered } : group))
    );

    await apiFetch('/items/reorder', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        groupId: selectedGroup.id,
        itemIds: reordered.map((item) => item.id)
      })
    });
    await fetchConfig();
    window.dispatchEvent(new CustomEvent('menusUpdated'));
  };

  const persistItemOrder = async (groupId: string, orderedIds: string[]) => {
    await apiFetch('/items/reorder', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        groupId,
        itemIds: orderedIds
      })
    });
    await fetchConfig();
    window.dispatchEvent(new CustomEvent('menusUpdated'));
  };

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return;

    if (result.type === 'GROUP') {
      if (result.destination.index === result.source.index) return;
      const reordered = [...visibleGroups];
      const [moved] = reordered.splice(result.source.index, 1);
      reordered.splice(result.destination.index, 0, moved);
      mergePlacementGroups(reordered);
      await persistGroupOrder(reordered.map((group) => group.id));
      return;
    }

    if (result.type === 'ITEM') {
      if (!selectedGroup) return;
      if (result.destination.index === result.source.index) return;
      const reordered = [...(selectedGroup.items || [])];
      const [moved] = reordered.splice(result.source.index, 1);
      reordered.splice(result.destination.index, 0, moved);
      setGroups((prev) =>
        prev.map((group) => (group.id === selectedGroup.id ? { ...group, items: reordered } : group))
      );
      await persistItemOrder(selectedGroup.id, reordered.map((item) => item.id));
    }
  };

  const materializeImplicitContribution = async (contribution: ImplicitSidebarContribution) => {
    const mKey = `${contribution.kind}-${contribution.module.code}`;
    setMaterializingKey(mKey);
    try {
      let groupId: string | null = null;
      if (contribution.kind === 'standalone') {
        const res = await apiFetch('/groups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            label: contribution.module.code,
            icon: contribution.module.mainNav.icon,
            key: contribution.module.mainNav.id,
            placement: 'sidebar',
            status: 'Active',
            displayMode: 'icon_and_text'
          })
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          alert(err?.error || t('settings.menuErrorMaterialize') || 'Could not save group');
          return;
        }
        const created = (await res.json()) as { id: string };
        groupId = created.id;
      } else {
        const target = sidebarConfiguredGroups.find((g) => g.key === contribution.targetGroupKey);
        if (!target) {
          alert(t('settings.menuErrorMaterializeNoGroup') || 'Target group not found.');
          return;
        }
        groupId = target.id;
      }

      for (const item of contribution.items) {
        const itemRes = await apiFetch('/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            groupId,
            label: t(item.name),
            icon: item.icon,
            targetType: 'MODULE_VIEW',
            viewKey: item.view,
            moduleCode: String(contribution.module.code || '').toUpperCase(),
            status: 'Active',
            displayMode: 'icon_and_text'
          })
        });
        if (!itemRes.ok) {
          alert(t('settings.menuErrorMaterialize') || 'Could not save menu items');
          return;
        }
      }

      await fetchConfig();
      window.dispatchEvent(new CustomEvent('menusUpdated'));
    } finally {
      setMaterializingKey(null);
    }
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{t('settings.menusTitle') || 'Menu Management'}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {placementTab === 'sidebar' &&
              (t('settings.menusDescSidebar') ||
                t('settings.menusDesc') ||
                'Iconos principales y submenús del panel lateral.')}
            {placementTab === 'header' &&
              (t('settings.menusDescHeader') ||
                'Un solo ítem se muestra como icono; varios ítems bajo el mismo grupo forman un menú desplegable.')}
            {placementTab === 'footer' &&
              (t('settings.menusDescFooter') ||
                'Enlaces en el pie de página (orden: grupos e ítems).')}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex w-full flex-wrap items-center gap-3">
            <input
              type="search"
              value={catalogSearch}
              onChange={(event) => setCatalogSearch(event.target.value)}
              placeholder={t('settings.menuCatalogSearchPlaceholder') || 'Search catalog…'}
              aria-label={t('settings.menuCatalogSearchPlaceholder') || 'Search catalog'}
              className="min-h-[2.5rem] min-w-[min(100%,10rem)] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400"
            />
            <div className="ml-auto flex shrink-0 flex-wrap justify-end gap-2">
              {(['sidebar', 'header', 'footer'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlacementTab(p)}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                    placementTab === p
                      ? 'bg-red-500 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {p === 'sidebar' && (t('settings.menuPlacementSidebar') || 'Sidebar')}
                  {p === 'header' && (t('settings.menuPlacementHeader') || 'Header')}
                  {p === 'footer' && (t('settings.menuPlacementFooter') || 'Footer')}
                </button>
              ))}
            </div>
          </div>
        </div>

      {loading && <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">{t('settings.menusLoading') || 'Loading menu configuration...'}</div>}
      {error && !loading && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}

      {!loading && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <section className="xl:col-span-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">{t('settings.menuMainGroups') || 'Main Groups'}</h3>
              <button
                type="button"
                onClick={openCreateGroupModal}
                className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600"
              >
                {t('settings.menuAdd') || 'Add'}
              </button>
            </div>
            <Droppable droppableId="menu-groups" type="GROUP">
              {(provided) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="flex flex-col gap-2"
                >
                  {visibleGroups.map((group, index) => (
                    <Draggable key={group.id} draggableId={group.id} index={index}>
                      {(draggableProvided) => (
                        <div
                          ref={draggableProvided.innerRef}
                          {...draggableProvided.draggableProps}
                          className={`rounded-lg border p-2 ${selectedGroupId === group.id ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-slate-50'}`}
                        >
                          <div className="flex items-stretch gap-2">
                            <span
                              {...draggableProvided.dragHandleProps}
                              className="inline-flex w-7 shrink-0 cursor-grab touch-none items-center justify-center self-stretch rounded-md border border-slate-200 bg-white text-slate-600 active:cursor-grabbing"
                              aria-label={t('settings.menuDragReorder') || 'Drag to reorder'}
                            >
                              <i className="fa-solid fa-grip-vertical" aria-hidden />
                            </span>
                            <button
                              type="button"
                              onClick={() => setSelectedGroupId(group.id)}
                              className="flex min-w-0 flex-1 items-center gap-2 text-left"
                            >
                              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600">
                                <i className={`fa-solid ${group.icon}`}></i>
                              </span>
                              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700">{group.label}</span>
                              <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-bold ${group.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                                {group.status === 'Active' ? (t('settings.active') || 'Active') : (t('settings.inactive') || 'Inactive')}
                              </span>
                              {group.displayMode && group.displayMode !== 'icon_and_text' ? (
                                <span className="shrink-0 rounded bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                                  {displayModeBadge(group.displayMode)}
                                </span>
                              ) : null}
                            </button>
                          </div>
                          <div className="mt-2 flex justify-end gap-1">
                            <button type="button" onClick={() => moveGroup(group.id, 'up')} className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-100" title={t('settings.menuMoveUp') || 'Move up'}>
                              <i className="fa-solid fa-arrow-up"></i>
                            </button>
                            <button type="button" onClick={() => moveGroup(group.id, 'down')} className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-100" title={t('settings.menuMoveDown') || 'Move down'}>
                              <i className="fa-solid fa-arrow-down"></i>
                            </button>
                            <button type="button" onClick={() => openEditGroupModal(group)} className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-100" title={t('settings.edit') || 'Edit'}>
                              <i className="fa-solid fa-pen"></i>
                            </button>
                            <button type="button" onClick={() => deleteGroup(group.id)} className="rounded border border-rose-200 bg-white px-2 py-1 text-xs text-rose-600 hover:bg-rose-50" title={t('common.delete') || 'Delete'}>
                              <i className="fa-solid fa-trash"></i>
                            </button>
                          </div>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                  {!visibleGroups.length && (
                    <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-400">
                      {t('settings.menuNoGroups') || 'No groups yet.'}
                    </p>
                  )}
                </div>
              )}
            </Droppable>
            {placementTab === 'sidebar' && implicitSidebarContributions.length > 0 ? (
              <div className="mt-4 border-t border-amber-200 pt-4">
                <h4 className="mb-1 text-xs font-bold uppercase tracking-wider text-amber-900">
                  {t('settings.menuImplicitModuleTitle') || 'Module shortcuts not in the menu'}
                </h4>
                <p className="mb-3 text-xs leading-relaxed text-amber-950/80">
                  {t('settings.menuImplicitModuleHint') ||
                    'These views belong to active modules but are not in the menu configuration yet. They will not appear in the app until you save them here or add them from the catalog.'}
                </p>
                <div className="space-y-2">
                  {implicitSidebarContributions.map((contribution) => {
                    const rowKey = `${contribution.kind}-${contribution.module.code}`;
                    const busy = materializingKey === rowKey;
                    const mergeLabel =
                      contribution.kind === 'merge'
                        ? sidebarConfiguredGroups.find((g) => g.key === contribution.targetGroupKey)?.label ||
                          contribution.targetGroupKey
                        : null;
                    return (
                      <div
                        key={rowKey}
                        className="rounded-lg border border-amber-300/80 bg-amber-50/90 p-3 shadow-sm"
                      >
                        <div className="flex items-start gap-2">
                          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-amber-200 bg-white text-amber-900">
                            <i className={`fa-solid ${contribution.module.mainNav.icon}`} aria-hidden />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-slate-900">{contribution.module.code}</p>
                            <p className="text-xs text-slate-600">
                              {contribution.kind === 'merge' && mergeLabel
                                ? t('settings.menuImplicitMergeInto', { group: mergeLabel })
                                : t('settings.menuImplicitStandalone')}
                            </p>
                            <ul className="mt-2 list-inside list-disc text-xs text-slate-600">
                              {contribution.items.map((it) => (
                                <li key={it.view}>
                                  {t(it.name)} — <code className="text-[11px]">{it.view}</code>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                        <div className="mt-3 flex justify-end">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => materializeImplicitContribution(contribution)}
                            className="rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {busy
                              ? t('settings.menuMaterializing') || 'Saving…'
                              : contribution.kind === 'merge'
                                ? t('settings.menuMaterializeMerge') || 'Add items to menu'
                                : t('settings.menuMaterializeModule') || 'Save to menu config'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </section>

          <section className="xl:col-span-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">
                {selectedGroup ? `${t('settings.menuItemsIn') || 'Items in'} ${selectedGroup.label}` : (t('settings.menuSubmenuItems') || 'Submenu Items')}
              </h3>
              {selectedGroup && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openCreateItemModal()}
                    className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600"
                  >
                    {t('settings.menuAdd') || 'Add'}
                  </button>
                  <button
                    type="button"
                    onClick={() => openFreeLinkItemModal()}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {t('settings.menuAddFreeLink') || 'Free link'}
                  </button>
                </div>
              )}
            </div>
            <Droppable droppableId="menu-items" type="ITEM">
              {(provided) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="flex flex-col gap-2"
                >
                  {(selectedGroup?.items || []).map((item, index) => (
                    <Draggable key={item.id} draggableId={item.id} index={index}>
                      {(draggableProvided) => (
                        <div
                          ref={draggableProvided.innerRef}
                          {...draggableProvided.draggableProps}
                          className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                        >
                          <div className="flex items-center gap-3">
                            <span
                              {...draggableProvided.dragHandleProps}
                              className="inline-flex h-8 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 active:cursor-grabbing"
                              aria-label={t('settings.menuDragReorder') || 'Drag to reorder'}
                            >
                              <i className="fa-solid fa-grip-vertical" aria-hidden />
                            </span>
                            <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600">
                              <i className={`fa-solid ${item.icon}`}></i>
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-slate-800">{item.label}</p>
                              <p className="truncate text-xs text-slate-500">
                                {item.targetType === 'EXTERNAL_URL'
                                  ? `${item.targetType} — ${item.linkUrl || '—'}${item.openInNewTab ? ` (${t('settings.menuOpenInNewTabShort') || 'new tab'})` : ''}`
                                  : `${item.targetType} - ${item.viewKey}${item.moduleCode ? ` (${item.moduleCode})` : ''}`}
                              </p>
                            </div>
                            <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${item.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                              {item.status === 'Active' ? (t('settings.active') || 'Active') : (t('settings.inactive') || 'Inactive')}
                            </span>
                            {item.displayMode && item.displayMode !== 'icon_and_text' ? (
                              <span className="rounded bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                                {displayModeBadge(item.displayMode)}
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-2 flex justify-end gap-1">
                            <button type="button" onClick={() => moveItem(item.id, 'up')} className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-100" title={t('settings.menuMoveUp') || 'Move up'}>
                              <i className="fa-solid fa-arrow-up"></i>
                            </button>
                            <button type="button" onClick={() => moveItem(item.id, 'down')} className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-100" title={t('settings.menuMoveDown') || 'Move down'}>
                              <i className="fa-solid fa-arrow-down"></i>
                            </button>
                            <button type="button" onClick={() => openEditItemModal(item)} className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-100" title={t('settings.edit') || 'Edit'}>
                              <i className="fa-solid fa-pen"></i>
                            </button>
                            <button type="button" onClick={() => deleteItem(item.id)} className="rounded border border-rose-200 bg-white px-2 py-1 text-xs text-rose-600 hover:bg-rose-50" title={t('common.delete') || 'Delete'}>
                              <i className="fa-solid fa-trash"></i>
                            </button>
                          </div>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                  {!selectedGroup && <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-400">{t('settings.menuSelectGroup') || 'Select a group.'}</p>}
                  {selectedGroup && !(selectedGroup.items || []).length && <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-400">{t('settings.menuNoItems') || 'No submenu items in this group.'}</p>}
                </div>
              )}
            </Droppable>
          </section>

          <section className="xl:col-span-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">{t('settings.menuCatalog') || 'Access Catalog'}</h3>
            </div>
            <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
              {filteredCatalog.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-400">
                  {t('settings.menuCatalogNoResults') || 'No matching entries.'}
                </p>
              ) : null}
              {filteredCatalog.map((entry) => (
                <div key={entry.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600">
                      <i className={`fa-solid ${entry.icon}`}></i>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800">{entry.label}</p>
                      <p className="truncate text-xs text-slate-500">
                        {entry.origin === 'module' ? `${t('settings.menuCatalogModule') || 'Module'} ${entry.moduleLabel || ''}` : (t('settings.menuCatalogCore') || 'Core')} - {entry.viewKey}
                      </p>
                    </div>
                    {entry.origin === 'module' && (
                      <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${entry.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {entry.enabled ? (t('settings.active') || 'Active') : (t('settings.inactive') || 'Inactive')}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => openCreateItemModal(entry)}
                      disabled={!selectedGroupId}
                      className="rounded bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      {t('settings.menuAddToMenu') || 'Add to menu'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {groupModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setGroupModalOpen(false)}></div>
          <div className="relative w-full max-w-md rounded-xl border border-slate-100 bg-white shadow-xl">
            <form onSubmit={saveGroup}>
              <div className="border-b border-slate-100 px-6 py-4">
                <h3 className="text-lg font-bold text-slate-900">{editingGroup ? (t('settings.menuEditGroup') || 'Edit Group') : (t('settings.newMenuGroup') || 'New Group')}</h3>
              </div>
              <div className="space-y-4 px-6 py-5">
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('settings.name') || 'Name'}</label>
                  <input
                    required
                    value={groupForm.label}
                    onChange={(event) => setGroupForm((prev) => ({ ...prev, label: event.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('settings.menuIcon') || 'Icon'}</label>
                  <input
                    value={groupForm.icon}
                    onChange={(event) => setGroupForm((prev) => ({ ...prev, icon: event.target.value }))}
                    placeholder="fa-folder"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('settings.status') || 'Status'}</label>
                  <select
                    value={groupForm.status}
                    onChange={(event) => setGroupForm((prev) => ({ ...prev, status: event.target.value as MenuStatus }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400"
                  >
                    <option value="Active">{t('settings.active') || 'Active'}</option>
                    <option value="Inactive">{t('settings.inactive') || 'Inactive'}</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {t('settings.menuDisplayModeGroup') || 'How to show this group'}
                  </label>
                  <select
                    value={groupForm.displayMode}
                    onChange={(event) =>
                      setGroupForm((prev) => ({ ...prev, displayMode: event.target.value as MenuDisplayMode }))
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400"
                  >
                    {DISPLAY_MODES.map((mode) => (
                      <option key={mode} value={mode}>
                        {displayModeOptionLabel(mode)}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-500">{t('settings.menuDisplayModeGroupHint') || ''}</p>
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
                <button type="button" onClick={() => setGroupModalOpen(false)} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                  {t('common.cancel') || 'Cancel'}
                </button>
                <button type="submit" className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600">
                  {t('common.save') || 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {itemModalOpen && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setItemModalOpen(false)}></div>
          <div className="relative w-full max-w-xl rounded-xl border border-slate-100 bg-white shadow-xl">
            <form onSubmit={saveItem}>
              <div className="border-b border-slate-100 px-6 py-4">
                <h3 className="text-lg font-bold text-slate-900">{editingItem ? (t('settings.menuEditItem') || 'Edit Submenu') : (t('settings.newMenuItem') || 'New Submenu')}</h3>
              </div>
              <div className="grid grid-cols-1 gap-4 px-6 py-5 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('settings.menuGroup') || 'Group'}</label>
                  <select
                    required
                    value={itemForm.groupId}
                    onChange={(event) => setItemForm((prev) => ({ ...prev, groupId: event.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400"
                  >
                    <option value="">{t('settings.menuSelectGroupOption') || 'Select group'}</option>
                    {visibleGroups.map((group) => (
                      <option key={group.id} value={group.id}>{group.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('settings.status') || 'Status'}</label>
                  <select
                    value={itemForm.status}
                    onChange={(event) => setItemForm((prev) => ({ ...prev, status: event.target.value as MenuStatus }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400"
                  >
                    <option value="Active">{t('settings.active') || 'Active'}</option>
                    <option value="Inactive">{t('settings.inactive') || 'Inactive'}</option>
                  </select>
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('settings.nameLabel') || 'Label'}</label>
                  <input
                    required
                    value={itemForm.label}
                    onChange={(event) => setItemForm((prev) => ({ ...prev, label: event.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('settings.menuIcon') || 'Icon'}</label>
                  <input
                    value={itemForm.icon}
                    onChange={(event) => setItemForm((prev) => ({ ...prev, icon: event.target.value }))}
                    placeholder="fa-link"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('settings.menuTargetType') || 'Target Type'}</label>
                  <select
                    value={itemForm.targetType}
                    onChange={(event) => {
                      const next = event.target.value as MenuTargetType;
                      setItemForm((prev) => ({
                        ...prev,
                        targetType: next,
                        ...(next === 'EXTERNAL_URL'
                          ? { moduleCode: '', viewKey: '' }
                          : { linkUrl: '', openInNewTab: false })
                      }));
                    }}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400"
                  >
                    <option value="STATIC_VIEW">{t('settings.menuStaticView') || 'Static View'}</option>
                    <option value="MODULE_VIEW">{t('settings.menuModuleView') || 'Module View'}</option>
                    <option value="EXTERNAL_URL">{t('settings.menuExternalUrl') || 'Free link (URL)'}</option>
                  </select>
                </div>
                {itemForm.targetType === 'EXTERNAL_URL' ? (
                  <>
                    <div className="space-y-1 md:col-span-2">
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {t('settings.menuLinkUrl') || 'URL'}
                      </label>
                      <input
                        required
                        value={itemForm.linkUrl}
                        onChange={(event) => setItemForm((prev) => ({ ...prev, linkUrl: event.target.value }))}
                        placeholder="https://… o /ruta-interna"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400"
                      />
                      <p className="text-xs text-slate-500">{t('settings.menuLinkUrlHint') || ''}</p>
                    </div>
                    <div className="flex items-center gap-2 md:col-span-2">
                      <input
                        id="menu-item-open-new-tab"
                        type="checkbox"
                        checked={itemForm.openInNewTab}
                        onChange={(event) =>
                          setItemForm((prev) => ({ ...prev, openInNewTab: event.target.checked }))
                        }
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      <label htmlFor="menu-item-open-new-tab" className="text-sm text-slate-700">
                        {t('settings.menuOpenInNewTab') || 'Open in a new tab'}
                      </label>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {t('settings.menuViewKey') || 'View Key'}
                      </label>
                      <input
                        required
                        value={itemForm.viewKey}
                        onChange={(event) => setItemForm((prev) => ({ ...prev, viewKey: event.target.value }))}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {t('settings.moduleCode') || 'Module Code'}
                      </label>
                      <input
                        value={itemForm.moduleCode}
                        disabled={itemForm.targetType !== 'MODULE_VIEW'}
                        onChange={(event) => setItemForm((prev) => ({ ...prev, moduleCode: event.target.value.toUpperCase() }))}
                        placeholder="CRM"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400 disabled:bg-slate-100"
                      />
                    </div>
                  </>
                )}
                <div className="space-y-1 md:col-span-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {t('settings.menuDisplayModeItem') || 'How to show this item'}
                  </label>
                  <select
                    value={itemForm.displayMode}
                    onChange={(event) =>
                      setItemForm((prev) => ({ ...prev, displayMode: event.target.value as MenuDisplayMode }))
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400"
                  >
                    {DISPLAY_MODES.map((mode) => (
                      <option key={mode} value={mode}>
                        {displayModeOptionLabel(mode)}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-500">{t('settings.menuDisplayModeItemHint') || ''}</p>
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
                <button type="button" onClick={() => setItemModalOpen(false)} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                  {t('common.cancel') || 'Cancel'}
                </button>
                <button type="submit" className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600">
                  {t('common.save') || 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
    </DragDropContext>
  );
};

export default MenuManagement;
