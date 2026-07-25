import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { adminFetch } from '../api';
import CategoriesSettingsTable, { type SettingsCategoryRow } from '@/components/settings/CategoriesSettingsTable';
import { Button } from '@/components/ui/button';
import { Alert, AlertContent, AlertDescription, AlertIcon } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

type ApiCategory = {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  module: string;
  status: string;
  sortingRule: string;
  _count?: { items: number };
};

type AdminCategoryItem = {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  status: string;
  sortOrder: number;
  categoryId: string;
};

type SelectedCategory = ApiCategory & { items: AdminCategoryItem[] };

const toSettingsRow = (c: ApiCategory): SettingsCategoryRow => {
  const sr = String(c.sortingRule || 'Manual');
  const sortingRule: SettingsCategoryRow['sortingRule'] =
    sr === 'Alpha_ASC' || sr === 'Alpha_DESC' || sr === 'Manual' ? sr : 'Manual';
  return {
    id: c.id,
    code: c.code ?? '',
    name: c.name,
    description: c.description ?? '',
    module: c.module,
    status: c.status === 'Inactive' ? 'Inactive' : 'Active',
    sortingRule,
    _count: c._count
  };
};

const parseAdminError = async (res: Response, fallback: string) => {
  try {
    const b = await res.json();
    const d = b?.details ? ` ${b.details}` : '';
    return `${b?.error || fallback}${d}`;
  } catch {
    return `${fallback} (${res.status})`;
  }
};

const CategoriesPage: React.FC = () => {
  const { t } = useTranslation();
  const [rawCategories, setRawCategories] = useState<ApiCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<SelectedCategory | null>(null);
  const [categoryItems, setCategoryItems] = useState<AdminCategoryItem[]>([]);

  const [categoryFormOpen, setCategoryFormOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ApiCategory | null>(null);
  const [categoryForm, setCategoryForm] = useState({
    code: '',
    name: '',
    description: '',
    module: '',
    status: 'Active',
    sortingRule: 'Manual'
  });

  const [itemFormOpen, setItemFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<AdminCategoryItem | null>(null);
  const [itemForm, setItemForm] = useState({
    code: '',
    name: '',
    description: '',
    status: 'Active',
    sortOrder: 0
  });

  const loadCategories = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await adminFetch('/api/admin/categories');
      if (!res.ok) {
        setLoadError(await parseAdminError(res, 'Failed to load categories'));
        setRawCategories([]);
        return;
      }
      const data = await res.json();
      setRawCategories(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : 'Load failed');
      setRawCategories([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCategoryDetail = async (id: string) => {
    try {
      const res = await adminFetch(`/api/admin/categories/${id}`);
      if (!res.ok) {
        setLoadError(await parseAdminError(res, 'Failed to load category'));
        setSelectedCategory(null);
        setCategoryItems([]);
        return;
      }
      const data = (await res.json()) as SelectedCategory;
      setSelectedCategory(data);
      setCategoryItems(data.items || []);
      setLoadError(null);
    } catch {
      setSelectedCategory(null);
      setCategoryItems([]);
    }
  };

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const tableRows: SettingsCategoryRow[] = rawCategories.map(toSettingsRow);

  const openCategoryModal = (category?: ApiCategory) => {
    if (category) {
      setEditingCategory(category);
      setCategoryForm({
        code: category.code || '',
        name: category.name || '',
        description: category.description || '',
        module: category.module || '',
        status: category.status || 'Active',
        sortingRule: category.sortingRule || 'Manual'
      });
    } else {
      setEditingCategory(null);
      setCategoryForm({
        code: '',
        name: '',
        description: '',
        module: '',
        status: 'Active',
        sortingRule: 'Manual'
      });
    }
    setCategoryFormOpen(true);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = editingCategory ? `/api/admin/categories/${editingCategory.id}` : '/api/admin/categories';
    const method = editingCategory ? 'PUT' : 'POST';
    const res = await adminFetch(url, { method, body: JSON.stringify(categoryForm) });
    if (!res.ok) {
      alert(await parseAdminError(res, 'Save failed'));
      return;
    }
    setCategoryFormOpen(false);
    await loadCategories();
    if (selectedCategory?.id) await loadCategoryDetail(selectedCategory.id);
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm(t('common.confirmDelete') || 'Delete this category?')) return;
    const res = await adminFetch(`/api/admin/categories/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      alert(await parseAdminError(res, 'Delete failed'));
      return;
    }
    setSelectedCategory(null);
    setCategoryItems([]);
    loadCategories();
  };

  const handleSelectCategory = (row: SettingsCategoryRow) => {
    const found = rawCategories.find((c) => c.id === row.id);
    if (!found) return;
    setSelectedCategory({ ...found, items: [] });
    loadCategoryDetail(found.id);
  };

  const openItemModal = (item?: AdminCategoryItem) => {
    if (item) {
      setEditingItem(item);
      setItemForm({
        code: item.code || '',
        name: item.name || '',
        description: item.description || '',
        status: item.status || 'Active',
        sortOrder: item.sortOrder ?? 0
      });
    } else {
      setEditingItem(null);
      setItemForm({ code: '', name: '', description: '', status: 'Active', sortOrder: 0 });
    }
    setItemFormOpen(true);
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCategory) return;
    const url = editingItem ? `/api/admin/category-items/${editingItem.id}` : '/api/admin/category-items';
    const method = editingItem ? 'PUT' : 'POST';
    const body = editingItem ? { ...itemForm } : { ...itemForm, categoryId: selectedCategory.id };
    const res = await adminFetch(url, { method, body: JSON.stringify(body) });
    if (!res.ok) {
      alert(await parseAdminError(res, 'Save failed'));
      return;
    }
    setItemFormOpen(false);
    await loadCategoryDetail(selectedCategory.id);
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm(t('common.confirmDelete') || 'Delete this item?')) return;
    const res = await adminFetch(`/api/admin/category-items/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      alert(await parseAdminError(res, 'Delete failed'));
      return;
    }
    if (selectedCategory) await loadCategoryDetail(selectedCategory.id);
  };

  const handleOnDragEnd = async (result: DropResult) => {
    if (!result.destination || !selectedCategory) return;
    const items = Array.from(categoryItems);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    setCategoryItems(items);
    try {
      const updates = items.map((item, index) => ({ id: item.id, sortOrder: index }));
      const reorderRes = await adminFetch('/api/admin/category-items/reorder', {
        method: 'PUT',
        body: JSON.stringify({ items: updates })
      });
      if (reorderRes.ok) {
        await loadCategoryDetail(selectedCategory.id);
      }
    } catch (err) {
      console.error('Failed to sync reorder:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        {t('common.loading')}
      </div>
    );
  }

  if (!selectedCategory) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        {loadError && (
          <Alert variant="destructive" appearance="light" size="md">
            <AlertIcon>
              <AlertCircle className="size-5" />
            </AlertIcon>
            <AlertContent>
              <AlertDescription>{loadError}</AlertDescription>
            </AlertContent>
          </Alert>
        )}
        <CategoriesSettingsTable
          categories={tableRows}
          showDevActions
          readOnlyCategoryDefinitions={false}
          onSelectCategory={handleSelectCategory}
          onEditCategory={(row) => {
            const c = rawCategories.find((x) => x.id === row.id);
            if (c) openCategoryModal(c);
          }}
          onDeleteCategory={handleDeleteCategory}
          onNewCategory={() => openCategoryModal()}
        />
      </div>
    );
  }

  const sortingRule = selectedCategory.sortingRule;

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-20">
      {loadError && (
        <Alert variant="destructive" appearance="light" size="md">
          <AlertIcon>
            <AlertCircle className="size-5" />
          </AlertIcon>
          <AlertContent>
            <AlertDescription>{loadError}</AlertDescription>
          </AlertContent>
        </Alert>
      )}

      <div className="w-full animate-in fade-in duration-500">
        <div className="mb-6">
          <button
            type="button"
            onClick={() => {
              setSelectedCategory(null);
              setCategoryItems([]);
            }}
            className="text-sm font-semibold text-primary hover:underline"
          >
            ← {t('settings.categoriesTitle')}
          </button>
        </div>
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div className="space-y-1">
            <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">{selectedCategory.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="font-medium text-slate-500">
                {t('settings.categoriesDesc')}
              </p>
              {sortingRule !== 'Manual' && (
                <span className="flex items-center gap-1 rounded border border-amber-100 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-600">
                  <i className="fa-solid fa-lock text-[9px]" />
                  {sortingRule === 'Alpha_ASC' ? 'A-Z' : 'Z-A'}
                </span>
              )}
            </div>
          </div>
          <Button type="button" onClick={() => openItemModal()} className="shrink-0">
            <i className="fa-solid fa-plus me-2 text-xs" />
            {t('settings.newItem')}
          </Button>
        </div>

        <div className="overflow-hidden overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <DragDropContext onDragEnd={handleOnDragEnd}>
            <table className="min-w-[800px] w-full text-left">
              <thead className="border-b border-foreground/10 bg-table-header">
                <tr>
                  <th className="w-10 px-6 py-3" />
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-table-header-foreground">
                    {t('settings.name')}
                  </th>
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-table-header-foreground">
                    {t('settings.code')}
                  </th>
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-table-header-foreground">
                    {t('settings.description')}
                  </th>
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-table-header-foreground">
                    {t('settings.status')}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-table-header-foreground">
                    {t('settings.actions')}
                  </th>
                </tr>
              </thead>
              <Droppable droppableId="admin-category-items">
                {(provided) => (
                  <tbody
                    {...provided.droppableProps}
                    ref={provided.innerRef}
                    className="divide-y divide-slate-100"
                  >
                    {categoryItems.map((item, index) => (
                      <Draggable
                        key={item.id}
                        draggableId={item.id}
                        index={index}
                        isDragDisabled={sortingRule !== 'Manual'}
                      >
                        {(dragProvided, snapshot) => (
                          <tr
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            className={`group transition-colors ${
                              snapshot.isDragging ? 'border-y border-primary/20 bg-primary/5 shadow-md' : 'hover:bg-slate-50/50'
                            }`}
                          >
                            <td className="px-6 py-5">
                              {sortingRule === 'Manual' ? (
                                <div
                                  {...dragProvided.dragHandleProps}
                                  className="cursor-grab text-slate-300 transition-colors hover:text-slate-500 active:cursor-grabbing"
                                >
                                  <i className="fa-solid fa-grip-vertical" />
                                </div>
                              ) : (
                                <div className="flex h-5 w-5 items-center justify-center rounded-md border border-slate-100 bg-slate-50 text-[10px] font-bold text-slate-400 shadow-inner">
                                  {index + 1}
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-5 font-bold text-slate-900 transition-colors group-hover:text-primary">
                              {item.name}
                            </td>
                            <td className="px-6 py-5 font-mono text-xs text-slate-500">{item.code || '—'}</td>
                            <td className="max-w-sm truncate px-6 py-5 font-medium text-slate-500">{item.description || '—'}</td>
                            <td className="px-6 py-5">
                              <span
                                className={`rounded-lg border px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${
                                  item.status === 'Active'
                                    ? 'border-emerald-100 bg-emerald-50 text-emerald-600'
                                    : 'border-border bg-slate-50 text-slate-400'
                                }`}
                              >
                                {item.status === 'Active' ? t('settings.active') : t('settings.inactive')}
                              </span>
                            </td>
                            <td className="px-6 py-5">
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => openItemModal(item)}
                                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 transition-all hover:border-indigo-100 hover:bg-slate-50 hover:text-indigo-600"
                                >
                                  <i className="fa-solid fa-pen-to-square text-xs" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteItem(item.id)}
                                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 transition-all hover:border-destructive/20 hover:bg-slate-50 hover:text-destructive"
                                >
                                  <i className="fa-solid fa-trash-can text-xs" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                    {categoryItems.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                          {t('settings.noItems')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                )}
              </Droppable>
            </table>
          </DragDropContext>
        </div>
      </div>

      {categoryFormOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setCategoryFormOpen(false)} />
          <div className="relative w-full max-w-md animate-in zoom-in-95 rounded-xl border border-white/20 bg-white shadow-xl duration-200">
            <div className="p-8">
              <div className="mb-6 flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900">
                  {editingCategory ? t('settings.editCategory') : t('settings.newCategory')}
                </h3>
                <button type="button" onClick={() => setCategoryFormOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <i className="fa-solid fa-xmark" />
                </button>
              </div>
              <form onSubmit={handleSaveCategory} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">{t('settings.name')}</label>
                  <input
                    required
                    type="text"
                    value={categoryForm.name}
                    onChange={(e) => setCategoryForm((p) => ({ ...p, name: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium shadow-sm transition-all placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">{t('settings.module')}</label>
                  <input
                    required
                    type="text"
                    value={categoryForm.module}
                    onChange={(e) => setCategoryForm((p) => ({ ...p, module: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium shadow-sm transition-all placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">{t('settings.code')}</label>
                  <input
                    type="text"
                    value={categoryForm.code}
                    onChange={(e) => setCategoryForm((p) => ({ ...p, code: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium shadow-sm transition-all placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">{t('settings.description')}</label>
                  <textarea
                    value={categoryForm.description}
                    onChange={(e) => setCategoryForm((p) => ({ ...p, description: e.target.value }))}
                    rows={3}
                    className="w-full resize-none rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium shadow-sm transition-all placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">{t('settings.status')}</label>
                  <select
                    value={categoryForm.status}
                    onChange={(e) => setCategoryForm((p) => ({ ...p, status: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium shadow-sm transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="Active">{t('settings.active')}</option>
                    <option value="Inactive">{t('settings.inactive')}</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Sorting</label>
                  <select
                    value={categoryForm.sortingRule}
                    onChange={(e) => setCategoryForm((p) => ({ ...p, sortingRule: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium shadow-sm transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="Manual">Manual</option>
                    <option value="Alpha_ASC">Alpha A-Z</option>
                    <option value="Alpha_DESC">Alpha Z-A</option>
                  </select>
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setCategoryFormOpen(false)}
                    className="rounded-lg border border-slate-200 bg-white px-6 py-2 text-sm font-medium text-slate-600 transition-all hover:bg-slate-50"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                  >
                    {t('common.save')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {itemFormOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setItemFormOpen(false)} />
          <div className="relative w-full max-w-md animate-in zoom-in-95 rounded-xl border border-white/20 bg-white shadow-xl duration-200">
            <div className="p-8">
              <div className="mb-6 flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900">{editingItem ? t('settings.editItem') : t('settings.newItem')}</h3>
                <button type="button" onClick={() => setItemFormOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <i className="fa-solid fa-xmark" />
                </button>
              </div>
              <form onSubmit={handleSaveItem} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">{t('settings.nameLabel')}</label>
                  <input
                    required
                    type="text"
                    value={itemForm.name}
                    onChange={(e) => setItemForm((p) => ({ ...p, name: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium shadow-sm transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">{t('settings.codeValue')} (global)</label>
                  <input
                    required
                    type="text"
                    value={itemForm.code}
                    onChange={(e) => setItemForm((p) => ({ ...p, code: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium shadow-sm transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">{t('settings.description')}</label>
                  <textarea
                    value={itemForm.description}
                    onChange={(e) => setItemForm((p) => ({ ...p, description: e.target.value }))}
                    rows={3}
                    className="w-full resize-none rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium shadow-sm transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">{t('settings.status')}</label>
                  <select
                    value={itemForm.status}
                    onChange={(e) => setItemForm((p) => ({ ...p, status: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium shadow-sm transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="Active">{t('settings.active')}</option>
                    <option value="Inactive">{t('settings.inactive')}</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Sort order</label>
                  <input
                    type="number"
                    value={itemForm.sortOrder}
                    onChange={(e) => setItemForm((p) => ({ ...p, sortOrder: Number(e.target.value) || 0 }))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium shadow-sm transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setItemFormOpen(false)}
                    className="rounded-lg border border-slate-200 bg-white px-6 py-2 text-sm font-medium text-slate-600 transition-all hover:bg-slate-50"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                  >
                    {t('common.save')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CategoriesPage;
