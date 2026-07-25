import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type ColumnDef,
  type SortingState,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable
} from '@tanstack/react-table';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  CardHeading,
  CardTable,
  CardTitle,
  CardToolbar
} from '@/components/ui/card';
import { DataGrid } from '@/components/ui/data-grid';
import { DataGridColumnHeader } from '@/components/ui/data-grid-column-header';
import { DataGridTable } from '@/components/ui/data-grid-table';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { adminFetch } from '@/components/admin/api';

interface Reference {
  id: string;
  companyId: string | null;
  module: string;
  code: string | null;
  reference: number;
  prefix: string | null;
  sufix: string | null;
  digits: number;
  clone: number;
}

interface ReferenceManagementProps {
  companyFilter?: string;
  /** SaaS Admin: manage core templates only (`/api/admin/references`). */
  adminMode?: boolean;
}

const ReferenceManagement: React.FC<ReferenceManagementProps> = ({ companyFilter, adminMode }) => {
  const { t } = useTranslation();
  const isTenant = !adminMode;
  const [references, setReferences] = useState<Reference[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingReference, setEditingReference] = useState<Reference | null>(null);
  const [formData, setFormData] = useState<Omit<Reference, 'id'>>({
    companyId: null,
    module: '',
    code: '',
    reference: 0,
    prefix: '',
    sufix: '',
    digits: 4,
    clone: 0
  });

  useEffect(() => {
    fetchReferences();
  }, [companyFilter, adminMode]);

  const fetchReferences = async () => {
    try {
      const url = adminMode
        ? `/api/admin/references?t=${Date.now()}`
        : companyFilter
          ? `/api/references?companyId=${companyFilter}&t=${Date.now()}`
          : `/api/references?t=${Date.now()}`;
      const res = adminMode ? await adminFetch(url) : await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setReferences(data);
      }
    } catch (error) {
      console.error('Error fetching references:', error);
    }
  };

  const openModal = useCallback(
    (reference?: Reference) => {
      if (reference) {
        setEditingReference(reference);
        setFormData({
          companyId: reference.companyId || null,
          module: reference.module || '',
          code: reference.code || '',
          reference: reference.reference ?? 0,
          prefix: reference.prefix || '',
          sufix: reference.sufix || '',
          digits: reference.digits || 4,
          clone: reference.clone || 0
        });
      } else {
        setEditingReference(null);
        setFormData({
          companyId: adminMode ? null : companyFilter || null,
          module: '',
          code: '',
          reference: 0,
          prefix: '',
          sufix: '',
          digits: 4,
          clone: 0
        });
      }
      setIsModalOpen(true);
    },
    [adminMode, companyFilter]
  );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isTenant && !editingReference) {
        return;
      }

      const method = editingReference ? 'PUT' : 'POST';
      const base = adminMode ? '/api/admin/references' : '/api/references';
      const url = editingReference ? `${base}/${editingReference.id}` : base;

      const codeTrim = String(formData.code || '').trim();
      if (adminMode && !editingReference && !codeTrim) {
        alert(t('settings.codeValue') + ' (code) is required for templates.');
        return;
      }

      const companyId = adminMode ? null : formData.companyId || companyFilter || null;
      if (!adminMode && !companyId) {
        alert('Select a company in the header filter to manage references.');
        return;
      }

      const payload = {
        ...formData,
        companyId,
        code: codeTrim || null,
        reference: Number.isFinite(Number(formData.reference)) ? Number(formData.reference) : 0,
        digits: parseInt(formData.digits.toString(), 10) || 4,
        clone: parseInt(formData.clone.toString(), 10) || 0
      };

      if (isTenant && editingReference) {
        delete (payload as { module?: string; code?: string | null }).module;
        delete (payload as { module?: string; code?: string | null }).code;
      }

      const res = adminMode
        ? await adminFetch(url, {
            method,
            body: JSON.stringify(payload)
          })
        : await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

      if (res.ok) {
        fetchReferences();
        setIsModalOpen(false);
      } else {
        let msg = 'Error saving reference';
        try {
          const j = await res.json();
          msg = j?.error || j?.details || msg;
        } catch {
          /* ignore */
        }
        alert(msg);
      }
    } catch (error) {
      console.error('Error saving reference:', error);
    }
  };

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm(t('common.confirmDelete'))) return;
      try {
        const base = adminMode ? '/api/admin/references' : '/api/references';
        const res = adminMode ? await adminFetch(`${base}/${id}`, { method: 'DELETE' }) : await fetch(`${base}/${id}`, { method: 'DELETE' });
        if (res.ok) {
          setReferences((prev) => prev.filter((r) => r.id !== id));
        }
      } catch (error) {
        console.error('Error deleting reference:', error);
      }
    },
    [adminMode, t]
  );

  const filteredReferences = useMemo(
    () =>
      references.filter(
        (ref) =>
          ref.module.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (ref.code && ref.code.toLowerCase().includes(searchTerm.toLowerCase())) ||
          (ref.prefix && ref.prefix.toLowerCase().includes(searchTerm.toLowerCase())) ||
          (ref.sufix && ref.sufix.toLowerCase().includes(searchTerm.toLowerCase()))
      ),
    [references, searchTerm]
  );

  const columns = useMemo<ColumnDef<Reference>[]>(
    () => [
      {
        accessorKey: 'module',
        meta: { headerTitle: t('settings.module') },
        header: ({ column }) => (
          <DataGridColumnHeader column={column} title={t('settings.module')} />
        ),
        cell: ({ row }) => (
          <div>
            <p className="text-sm font-semibold uppercase text-foreground">{row.original.module}</p>
            <p className="text-muted-foreground text-[11px] font-medium">{row.original.code || '—'}</p>
          </div>
        )
      },
      {
        id: 'prefix',
        accessorFn: (row) => row.prefix || '',
        meta: { headerTitle: t('settings.prefix') },
        header: ({ column }) => (
          <DataGridColumnHeader column={column} title={t('settings.prefix')} />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-sm text-muted-foreground">{row.original.prefix || '—'}</span>
        )
      },
      {
        id: 'sufix',
        accessorFn: (row) => row.sufix || '',
        meta: { headerTitle: t('settings.sufix') },
        header: ({ column }) => (
          <DataGridColumnHeader column={column} title={t('settings.sufix')} />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-sm text-muted-foreground">{row.original.sufix || '—'}</span>
        )
      },
      {
        accessorKey: 'digits',
        meta: { headerTitle: t('settings.digits') },
        header: ({ column }) => (
          <DataGridColumnHeader column={column} title={t('settings.digits')} />
        ),
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.digits}</span>
      },
      {
        id: 'nextRef',
        accessorFn: (row) =>
          `${row.prefix || ''}${String(row.reference).padStart(row.digits, '0')}${row.sufix || ''}`,
        meta: { headerTitle: t('settings.nextRef') },
        header: ({ column }) => (
          <DataGridColumnHeader column={column} title={t('settings.nextRef')} />
        ),
        cell: ({ row }) => {
          const numStr = String(row.original.reference ?? 0).padStart(row.original.digits, '0');
          const nextVal = `${row.original.prefix || ''}${numStr}${row.original.sufix || ''}`;
          return (
            <Badge variant="info" appearance="light" size="md" className="font-mono font-semibold tracking-wide">
              {nextVal}
            </Badge>
          );
        }
      },
      {
        id: 'actions',
        enableSorting: false,
        meta: {
          headerTitle: t('settings.actions'),
          headerClassName: 'text-end',
          cellClassName: 'text-end'
        },
        header: () => (
          <span className="inline-flex w-full justify-end text-[0.8125rem] font-medium uppercase tracking-wide text-table-header-foreground">
            {t('settings.actions')}
          </span>
        ),
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <Button
              type="button"
              mode="icon"
              size="sm"
              variant="outline"
              className="size-8"
              onClick={() => openModal(row.original)}
              aria-label={t('settings.edit')}
            >
              <Pencil className="size-3.5" />
            </Button>
            {adminMode ? (
              <Button
                type="button"
                mode="icon"
                size="sm"
                variant="outline"
                className="size-8 text-destructive hover:bg-destructive/10"
                onClick={() => handleDelete(row.original.id)}
                aria-label={t('common.delete')}
              >
                <Trash2 className="size-3.5" />
              </Button>
            ) : null}
          </div>
        )
      }
    ],
    [t, openModal, handleDelete, adminMode]
  );

  const table = useReactTable({
    data: filteredReferences,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel()
  });

  const emptyMessage =
    references.length === 0
      ? t('settings.noReferences')
      : t('settings.referencesNoMatch');

  return (
    <div className="w-full animate-in fade-in duration-500 pb-20">
      <div className="mb-6">
        <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">{t('settings.referencesTitle')}</h2>
        <p className="mt-1 font-medium text-slate-500">
          {isTenant ? t('settings.referencesTenantDesc') : t('settings.referencesDesc')}
        </p>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="min-h-0 flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <CardHeading>
            <CardTitle>{t('settings.referencesCardTitle')}</CardTitle>
          </CardHeading>
          <CardToolbar className="w-full flex-wrap justify-stretch gap-2 sm:w-auto sm:justify-end">
            <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
              <Search className="text-muted-foreground absolute start-3 top-1/2 size-4 -translate-y-1/2" aria-hidden />
              <Input
                type="search"
                placeholder={t('settings.searchReferencePlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={cn('ps-9')}
                aria-label={t('settings.searchReferencePlaceholder')}
              />
            </div>
            {adminMode ? (
              <Button type="button" variant="primary" onClick={() => openModal()}>
                <Plus className="size-4" />
                {t('settings.newReference')}
              </Button>
            ) : null}
          </CardToolbar>
        </CardHeader>
        <CardTable className="p-0">
          <DataGrid
            table={table}
            recordCount={filteredReferences.length}
            emptyMessage={emptyMessage}
            tableLayout={{
              rowBorder: true,
              headerBackground: true,
              headerBorder: true,
              width: 'auto'
            }}
          >
            <div className="overflow-x-auto">
              <DataGridTable />
            </div>
          </DataGrid>
        </CardTable>
      </Card>

      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
          <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 px-8 pb-5 pt-7">
              <div>
                <h3 className="text-xl font-bold text-slate-900">
                  {editingReference ? t('settings.edit') : adminMode ? t('settings.newReference') : t('settings.edit')}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-600"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <form onSubmit={handleSave} className="flex flex-1 flex-col overflow-hidden">
              <div className="flex-1 space-y-6 overflow-y-auto px-8 py-6">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                      {t('settings.module')}{' '}
                      {adminMode && !editingReference ? <span className="text-red-400">*</span> : null}
                    </label>
                    <input
                      required={Boolean(adminMode && !editingReference)}
                      readOnly={isTenant && Boolean(editingReference)}
                      type="text"
                      value={formData.module}
                      onChange={(e) => setFormData((p) => ({ ...p, module: e.target.value }))}
                      placeholder="Ej: Company, Invoice, Ticket"
                      title={isTenant && editingReference ? t('settings.referencesReadonlySystemField') : undefined}
                      className={cn(
                        'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium transition-all focus:outline-none focus:ring-1 focus:ring-red-400',
                        isTenant && editingReference
                          ? 'cursor-not-allowed bg-slate-100 text-slate-600 focus:border-slate-200'
                          : 'bg-white focus:border-red-400'
                      )}
                    />
                    {isTenant && editingReference ? (
                      <p className="text-[11px] text-muted-foreground">{t('settings.referencesReadonlySystemField')}</p>
                    ) : null}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                      {t('settings.prefix')}
                    </label>
                    <input
                      type="text"
                      value={formData.prefix || ''}
                      onChange={(e) => setFormData((p) => ({ ...p, prefix: e.target.value }))}
                      placeholder="Ej: C"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm transition-all focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                      {t('settings.sufix')}
                    </label>
                    <input
                      type="text"
                      value={formData.sufix || ''}
                      onChange={(e) => setFormData((p) => ({ ...p, sufix: e.target.value }))}
                      placeholder="Ej: AX"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm transition-all focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                      {t('settings.digits')}
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={15}
                      value={formData.digits}
                      onChange={(e) => setFormData((p) => ({ ...p, digits: parseInt(e.target.value, 10) || 4 }))}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm transition-all focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                      {t('settings.nextRef')}
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={formData.reference}
                      onChange={(e) => setFormData((p) => ({ ...p, reference: parseInt(e.target.value, 10) || 0 }))}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm transition-all focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
                    />
                  </div>

                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                      {t('settings.codeValue')}
                      {adminMode && !editingReference ? ' (Opcional)' : ''}
                    </label>
                    <input
                      type="text"
                      readOnly={isTenant && Boolean(editingReference)}
                      value={formData.code || ''}
                      onChange={(e) => setFormData((p) => ({ ...p, code: e.target.value }))}
                      title={isTenant && editingReference ? t('settings.referencesReadonlySystemField') : undefined}
                      className={cn(
                        'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium transition-all focus:outline-none focus:ring-1 focus:ring-red-400',
                        isTenant && editingReference
                          ? 'cursor-not-allowed bg-slate-100 text-slate-600 focus:border-slate-200'
                          : 'bg-white focus:border-red-400'
                      )}
                    />
                  </div>

                  <div className="mt-2 space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Vista Previa
                    </label>
                    <div className="inline-block rounded-lg border border-indigo-100 bg-white px-4 py-2 font-mono text-lg font-bold text-indigo-600 shadow-sm">
                      {formData.prefix || ''}
                      {String(formData.reference).padStart(formData.digits, '0')}
                      {formData.sufix || ''}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-3 rounded-b-2xl border-t border-slate-100 bg-slate-50 px-8 py-5">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-lg border border-slate-200 bg-white px-6 py-2 text-sm font-medium text-slate-600 transition-all hover:bg-slate-50"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-red-500 px-6 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                >
                  {t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReferenceManagement;
