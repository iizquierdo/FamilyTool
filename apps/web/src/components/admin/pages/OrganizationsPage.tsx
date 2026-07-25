import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type ColumnDef,
  type SortingState,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable
} from '@tanstack/react-table';
import { AlertCircle, CheckCircle2, Pencil, Search, Trash2 } from 'lucide-react';
import { adminFetch } from '../api';
import { Alert, AlertContent, AlertDescription, AlertIcon } from '@/components/ui/alert';
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
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input, inputVariants } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface OrganizationRow {
  id: string;
  name: string;
  createdAt: string;
  currencyPosition: string;
  dateFormat: string;
  defaultLanguage: string;
  moneyFormat: string;
  timeFormat: string;
  timezone: string;
  baseCurrency: string | null;
  address: string | null;
  addressAdditional: string | null;
  zipcode: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  email: string | null;
  taxId: string | null;
  website: string | null;
  storageProvider: string;
  storageSettings: unknown;
  subscriptionPlanId?: string;
  subscriptionPlan?: { id: string; code: string; name: string; status: string } | null;
  _count?: { companies: number };
  usersCount?: number;
}

const emptyForm = (): Partial<OrganizationRow> => ({
  name: '',
  currencyPosition: 'Prefix',
  dateFormat: 'YYYY/MM/DD',
  defaultLanguage: 'es',
  moneyFormat: '1,234.56',
  timeFormat: 'HH:mm',
  timezone: 'UTC',
  baseCurrency: 'USD',
  address: '',
  addressAdditional: '',
  zipcode: '',
  city: '',
  state: '',
  country: '',
  email: '',
  taxId: '',
  website: '',
  storageProvider: 'Local',
  storageSettings: null,
  subscriptionPlanId: ''
});

const OrganizationsPage: React.FC = () => {
  const { t } = useTranslation();
  const [rows, setRows] = useState<OrganizationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<OrganizationRow>>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [storageJson, setStorageJson] = useState('');
  const [planOptions, setPlanOptions] = useState<{ id: string; code: string; name: string; status: string }[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setStatus(null);
    try {
      const res = await adminFetch('/api/admin/organizations');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load organizations');
      setRows(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!modalOpen) return;
    void (async () => {
      try {
        const res = await adminFetch('/api/admin/subscription-plans');
        const data = await res.json();
        if (!res.ok) return;
        setPlanOptions(
          Array.isArray(data)
            ? data.map((p: { id: string; code: string; name: string; status: string }) => ({
                id: p.id,
                code: p.code,
                name: p.name,
                status: p.status
              }))
            : []
        );
      } catch {
        setPlanOptions([]);
      }
    })();
  }, [modalOpen]);

  const filteredRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const hay = [
        row.name,
        row.email || '',
        row.city || '',
        row.country || '',
        row.timezone,
        String(row._count?.companies ?? ''),
        String(row.usersCount ?? '')
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, searchTerm]);

  const openCreate = useCallback(() => {
    setEditingId(null);
    setForm({ ...emptyForm(), subscriptionPlanId: '' });
    setStorageJson('');
    setModalOpen(true);
    setStatus(null);
  }, []);

  const openEdit = useCallback((row: OrganizationRow) => {
    setEditingId(row.id);
    setForm({
      name: row.name,
      currencyPosition: row.currencyPosition,
      dateFormat: row.dateFormat,
      defaultLanguage: row.defaultLanguage,
      moneyFormat: row.moneyFormat,
      timeFormat: row.timeFormat,
      timezone: row.timezone,
      baseCurrency: row.baseCurrency,
      address: row.address || '',
      addressAdditional: row.addressAdditional || '',
      zipcode: row.zipcode || '',
      city: row.city || '',
      state: row.state || '',
      country: row.country || '',
      email: row.email || '',
      taxId: row.taxId || '',
      website: row.website || '',
      storageProvider: row.storageProvider || 'Local',
      storageSettings: row.storageSettings,
      subscriptionPlanId: row.subscriptionPlan?.id || ''
    });
    try {
      setStorageJson(row.storageSettings ? JSON.stringify(row.storageSettings, null, 2) : '');
    } catch {
      setStorageJson('');
    }
    setModalOpen(true);
    setStatus(null);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditingId(null);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = String(form.name || '').trim();
    if (!name) {
      setStatus({ type: 'error', message: t('settings.organizationsNameRequired') });
      return;
    }
    let storageSettings: unknown = undefined;
    if (storageJson.trim()) {
      try {
        storageSettings = JSON.parse(storageJson);
      } catch {
        setStatus({ type: 'error', message: t('settings.organizationsStorageJsonInvalid') });
        return;
      }
    } else if (editingId) {
      storageSettings = null;
    }

    const payload: Record<string, unknown> = {
      name,
      currencyPosition: form.currencyPosition,
      dateFormat: form.dateFormat,
      defaultLanguage: form.defaultLanguage,
      moneyFormat: form.moneyFormat,
      timeFormat: form.timeFormat,
      timezone: form.timezone,
      baseCurrency: form.baseCurrency || null,
      address: form.address || null,
      addressAdditional: form.addressAdditional || null,
      zipcode: form.zipcode || null,
      city: form.city || null,
      state: form.state || null,
      country: form.country || null,
      email: form.email || null,
      taxId: form.taxId || null,
      website: form.website || null,
      storageProvider: form.storageProvider || 'Local'
    };
    if (storageJson.trim() || editingId) payload.storageSettings = storageSettings;

    const sid = String(form.subscriptionPlanId || '').trim();
    if (editingId && sid) payload.subscriptionPlanId = sid;
    if (!editingId && sid) payload.subscriptionPlanId = sid;

    setSaving(true);
    setStatus(null);
    try {
      const url = editingId ? `/api/admin/organizations/${editingId}` : '/api/admin/organizations';
      const res = await adminFetch(url, {
        method: editingId ? 'PUT' : 'POST',
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Save failed');
      await load();
      closeModal();
      if (!editingId && data?.bootstrap?.adminEmail && data?.bootstrap?.temporaryPassword) {
        setStatus({
          type: 'success',
          message: `${t('settings.organizationsCreated')} ${t('settings.organizationsBootstrapHint', {
            email: data.bootstrap.adminEmail,
            password: data.bootstrap.temporaryPassword
          })}`
        });
      } else {
        setStatus({ type: 'success', message: editingId ? t('settings.organizationsUpdated') : t('settings.organizationsCreated') });
      }
    } catch (e: unknown) {
      setStatus({ type: 'error', message: e instanceof Error ? e.message : 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  const remove = useCallback(
    async (row: OrganizationRow) => {
      const msg = t('settings.organizationsDeleteConfirm', { name: row.name });
      if (!window.confirm(msg)) return;
      setStatus(null);
      try {
        const res = await adminFetch(`/api/admin/organizations/${row.id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Delete failed');
        await load();
        setStatus({ type: 'success', message: t('settings.organizationsDeleted') });
      } catch (e: unknown) {
        setStatus({ type: 'error', message: e instanceof Error ? e.message : 'Delete failed' });
      }
    },
    [t, load]
  );

  const columns = useMemo<ColumnDef<OrganizationRow>[]>(
    () => [
      {
        id: 'name',
        accessorFn: (row) => row.name,
        meta: { headerTitle: t('settings.name') },
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('settings.name')} />,
        cell: ({ row }) => (
          <div>
            <p className="text-sm font-semibold uppercase text-foreground">{row.original.name}</p>
            <p className="text-muted-foreground text-[11px] font-medium">{row.original.timezone}</p>
          </div>
        )
      },
      {
        id: 'plan',
        accessorFn: (row) => row.subscriptionPlan?.code ?? '',
        meta: { headerTitle: t('settings.organizationsColPlan') },
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('settings.organizationsColPlan')} />,
        cell: ({ row }) => (
          <span className="text-sm font-medium">
            {row.original.subscriptionPlan ? `${row.original.subscriptionPlan.name} (${row.original.subscriptionPlan.code})` : '—'}
          </span>
        )
      },
      {
        id: 'companies',
        accessorFn: (row) => row._count?.companies ?? 0,
        meta: { headerTitle: t('settings.organizationsColCompanies') },
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('settings.organizationsColCompanies')} />,
        cell: ({ row }) => <span className="text-sm font-medium tabular-nums">{row.original._count?.companies ?? 0}</span>
      },
      {
        id: 'users',
        accessorFn: (row) => row.usersCount ?? 0,
        meta: { headerTitle: t('settings.organizationsColUsers') },
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('settings.organizationsColUsers')} />,
        cell: ({ row }) => <span className="text-sm font-medium tabular-nums">{row.original.usersCount ?? 0}</span>
      },
      {
        id: 'createdAt',
        accessorFn: (row) => row.createdAt,
        meta: { headerTitle: t('settings.organizationsColCreated') },
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('settings.organizationsColCreated')} />,
        cell: ({ row }) => (
          <span className="text-muted-foreground text-xs font-medium">
            {new Date(row.original.createdAt).toLocaleDateString()}
          </span>
        )
      },
      {
        id: 'actions',
        enableSorting: false,
        meta: {
          headerTitle: t('settings.organizationsColActions'),
          headerClassName: 'text-end',
          cellClassName: 'text-end'
        },
        header: () => (
          <span className="inline-flex w-full justify-end text-[0.8125rem] font-medium uppercase tracking-wide text-table-header-foreground">
            {t('settings.organizationsColActions')}
          </span>
        ),
        cell: ({ row }) => {
          const org = row.original;
          return (
            <div className="flex flex-wrap items-center justify-end gap-1">
              <Button
                type="button"
                mode="icon"
                size="sm"
                variant="outline"
                className="size-8"
                onClick={() => openEdit(org)}
                aria-label={t('settings.organizationsEdit')}
              >
                <Pencil className="size-3.5" />
              </Button>
              <Button
                type="button"
                mode="icon"
                size="sm"
                variant="outline"
                className="size-8 text-destructive hover:bg-destructive/10"
                onClick={() => void remove(org)}
                aria-label={t('settings.organizationsDelete')}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          );
        }
      }
    ],
    [t, openEdit, remove]
  );

  const table = useReactTable({
    data: filteredRows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel()
  });

  const emptyMessage =
    rows.length === 0 && !loading ? t('settings.organizationsEmpty') : t('settings.organizationsNoMatch');

  const selectClass = cn(inputVariants({ variant: 'md' }), 'cursor-pointer');

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-500">
      <div className="mb-2">
        <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">{t('settings.organizationsTitle')}</h2>
        <p className="mt-1 mb-10 text-sm font-medium text-slate-500">{t('settings.organizationsDesc')}</p>
      </div>

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

      {status && !modalOpen && (
        <Alert variant={status.type === 'success' ? 'success' : 'destructive'} appearance="light" size="md">
          <AlertIcon>
            {status.type === 'success' ? <CheckCircle2 className="size-5" /> : <AlertCircle className="size-5" />}
          </AlertIcon>
          <AlertContent>
            <AlertDescription>{status.message}</AlertDescription>
          </AlertContent>
        </Alert>
      )}

      <Card className="overflow-hidden">
        <CardHeader className="min-h-0 flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <CardHeading>
            <CardTitle>{t('settings.organizationsCardTitle')}</CardTitle>
          </CardHeading>
          <CardToolbar className="w-full flex-wrap justify-stretch gap-2 sm:w-auto sm:justify-end">
            <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
              <Search className="text-muted-foreground absolute start-3 top-1/2 size-4 -translate-y-1/2" aria-hidden />
              <Input
                type="search"
                placeholder={t('settings.searchOrganizationsPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={cn('ps-9')}
                aria-label={t('settings.searchOrganizationsPlaceholder')}
              />
            </div>
            <Button type="button" variant="primary" onClick={openCreate}>
              {t('settings.organizationsNew')}
            </Button>
          </CardToolbar>
        </CardHeader>
        <CardTable className="p-0">
          <DataGrid
            table={table}
            recordCount={filteredRows.length}
            isLoading={loading}
            loadingMessage={t('settings.organizationsLoading')}
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

      <Dialog
        open={modalOpen}
        onOpenChange={(open) => {
          if (!open) closeModal();
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" showCloseButton>
          <DialogHeader>
            <DialogTitle>
              {editingId ? t('settings.organizationsModalEdit') : t('settings.organizationsModalNew')}
            </DialogTitle>
          </DialogHeader>
          {status && modalOpen && (
            <Alert variant={status.type === 'success' ? 'success' : 'destructive'} appearance="light" size="sm" className="mb-2">
              <AlertIcon>
                {status.type === 'success' ? <CheckCircle2 className="size-4" /> : <AlertCircle className="size-4" />}
              </AlertIcon>
              <AlertContent>
                <AlertDescription>{status.message}</AlertDescription>
              </AlertContent>
            </Alert>
          )}
          <DialogBody>
            <form
              onSubmit={(e) => void submit(e)}
              id="admin-org-form"
              className="space-y-4"
            >
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="org-name" className="text-xs">
                    {t('settings.name')} *
                  </Label>
                  <Input
                    id="org-name"
                    required
                    value={form.name || ''}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="org-subscription-plan" className="text-xs">
                    {t('settings.organizationsPlan')}
                  </Label>
                  <select
                    id="org-subscription-plan"
                    className={selectClass}
                    value={String(form.subscriptionPlanId || '')}
                    onChange={(e) => setForm((f) => ({ ...f, subscriptionPlanId: e.target.value }))}
                  >
                    {!editingId && <option value="">{t('settings.organizationsPlanDefaultFree')}</option>}
                    {planOptions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.code}){p.status === 'Inactive' ? ' — ' + p.status : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="org-date-format" className="text-xs">
                    {t('settings.dateFormat')}
                  </Label>
                  <Input
                    id="org-date-format"
                    value={form.dateFormat || ''}
                    onChange={(e) => setForm((f) => ({ ...f, dateFormat: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="org-time-format" className="text-xs">
                    {t('settings.timeFormat')}
                  </Label>
                  <Input
                    id="org-time-format"
                    value={form.timeFormat || ''}
                    onChange={(e) => setForm((f) => ({ ...f, timeFormat: e.target.value }))}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="org-timezone" className="text-xs">
                    {t('settings.timezone')}
                  </Label>
                  <Input
                    id="org-timezone"
                    value={form.timezone || ''}
                    onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="org-base-currency" className="text-xs">
                    {t('settings.baseCurrency')}
                  </Label>
                  <Input
                    id="org-base-currency"
                    value={form.baseCurrency || ''}
                    onChange={(e) => setForm((f) => ({ ...f, baseCurrency: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="org-money-format" className="text-xs">
                    {t('settings.moneyFormat')}
                  </Label>
                  <Input
                    id="org-money-format"
                    value={form.moneyFormat || ''}
                    onChange={(e) => setForm((f) => ({ ...f, moneyFormat: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="org-currency-pos" className="text-xs">
                    {t('settings.currencyPosition')}
                  </Label>
                  <Input
                    id="org-currency-pos"
                    value={form.currencyPosition || ''}
                    onChange={(e) => setForm((f) => ({ ...f, currencyPosition: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="org-default-lang" className="text-xs">
                    {t('settings.defaultLanguage')}
                  </Label>
                  <Input
                    id="org-default-lang"
                    value={form.defaultLanguage || ''}
                    onChange={(e) => setForm((f) => ({ ...f, defaultLanguage: e.target.value }))}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="org-address" className="text-xs">
                    {t('settings.address')}
                  </Label>
                  <Input id="org-address" value={form.address || ''} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="org-address-add" className="text-xs">
                    {t('settings.addressAdditional')}
                  </Label>
                  <Input
                    id="org-address-add"
                    value={form.addressAdditional || ''}
                    onChange={(e) => setForm((f) => ({ ...f, addressAdditional: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="org-city" className="text-xs">
                    {t('settings.city')}
                  </Label>
                  <Input id="org-city" value={form.city || ''} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="org-state" className="text-xs">
                    {t('settings.stateProvince')}
                  </Label>
                  <Input id="org-state" value={form.state || ''} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="org-zip" className="text-xs">
                    {t('settings.zipcode')}
                  </Label>
                  <Input id="org-zip" value={form.zipcode || ''} onChange={(e) => setForm((f) => ({ ...f, zipcode: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="org-country" className="text-xs">
                    {t('settings.country')}
                  </Label>
                  <Input id="org-country" value={form.country || ''} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="org-email" className="text-xs">
                    {t('settings.email')}
                  </Label>
                  <Input
                    id="org-email"
                    type="email"
                    value={form.email || ''}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="org-tax" className="text-xs">
                    {t('settings.taxId')}
                  </Label>
                  <Input id="org-tax" value={form.taxId || ''} onChange={(e) => setForm((f) => ({ ...f, taxId: e.target.value }))} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="org-website" className="text-xs">
                    {t('settings.website')}
                  </Label>
                  <Input id="org-website" value={form.website || ''} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="org-storage-provider" className="text-xs">
                    {t('settings.storageProvider')}
                  </Label>
                  <select
                    id="org-storage-provider"
                    className={selectClass}
                    value={form.storageProvider || 'Local'}
                    onChange={(e) => setForm((f) => ({ ...f, storageProvider: e.target.value }))}
                  >
                    <option value="Local">Local</option>
                    <option value="S3">S3</option>
                    <option value="GoogleCloud">GoogleCloud</option>
                    <option value="Azure">Azure</option>
                  </select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="org-storage-json" className="text-xs">
                    {t('settings.organizationsStorageJson')}
                  </Label>
                  <Textarea
                    id="org-storage-json"
                    variant="md"
                    className="font-mono text-xs"
                    rows={4}
                    value={storageJson}
                    onChange={(e) => setStorageJson(e.target.value)}
                    placeholder="{}"
                  />
                </div>
              </div>
            </form>
          </DialogBody>
          <DialogFooter className="border-t border-border pt-4 sm:space-x-2">
            <Button type="button" variant="outline" onClick={closeModal} disabled={saving}>
              {t('settings.organizationsCancel')}
            </Button>
            <Button type="submit" form="admin-org-form" disabled={saving}>
              {saving ? t('settings.organizationsSaving') : t('settings.organizationsSave')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OrganizationsPage;
