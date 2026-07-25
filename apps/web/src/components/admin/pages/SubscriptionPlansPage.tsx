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

export interface SubscriptionPlanRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: string;
  sortOrder: number;
  billingPeriod: string;
  priceCents: number;
  currency: string;
  trialDays: number;
  badgeLabel: string | null;
  maxUsers: number | null;
  maxCompanies: number | null;
  maxStorageMb: number | null;
  maxApiCallsPerDay: number | null;
  features: unknown;
  createdAt: string;
  updatedAt: string;
  _count?: { organizations: number };
}

const emptyForm = (): Record<string, string> => ({
  code: '',
  name: '',
  description: '',
  status: 'Active',
  sortOrder: '0',
  billingPeriod: 'Monthly',
  priceCents: '0',
  currency: 'USD',
  trialDays: '0',
  badgeLabel: '',
  maxUsers: '',
  maxCompanies: '',
  maxStorageMb: '',
  maxApiCallsPerDay: '',
  featuresJson: ''
});

const parseAdminError = async (res: Response, fallback: string) => {
  try {
    const b = await res.json();
    const d = b?.details ? ` ${b.details}` : '';
    return `${b?.error || fallback}${d}`;
  } catch {
    return `${fallback} (${res.status})`;
  }
};

const SubscriptionPlansPage: React.FC = () => {
  const { t } = useTranslation();
  const [rows, setRows] = useState<SubscriptionPlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await adminFetch('/api/admin/subscription-plans');
      if (!res.ok) {
        setLoadError(await parseAdminError(res, 'Failed to load plans'));
        setRows([]);
        return;
      }
      const data = await res.json();
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

  const filteredRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const hay = [row.code, row.name, row.description || '', row.status].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [rows, searchTerm]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setModalOpen(true);
    setStatus(null);
  };

  const openEdit = (row: SubscriptionPlanRow) => {
    setEditingId(row.id);
    let featuresJson = '';
    try {
      featuresJson = row.features != null ? JSON.stringify(row.features, null, 2) : '';
    } catch {
      featuresJson = '';
    }
    setForm({
      code: row.code,
      name: row.name,
      description: row.description || '',
      status: row.status || 'Active',
      sortOrder: String(row.sortOrder ?? 0),
      billingPeriod: row.billingPeriod || 'Monthly',
      priceCents: String(row.priceCents ?? 0),
      currency: row.currency || 'USD',
      trialDays: String(row.trialDays ?? 0),
      badgeLabel: row.badgeLabel || '',
      maxUsers: row.maxUsers != null ? String(row.maxUsers) : '',
      maxCompanies: row.maxCompanies != null ? String(row.maxCompanies) : '',
      maxStorageMb: row.maxStorageMb != null ? String(row.maxStorageMb) : '',
      maxApiCallsPerDay: row.maxApiCallsPerDay != null ? String(row.maxApiCallsPerDay) : '',
      featuresJson
    });
    setModalOpen(true);
    setStatus(null);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
  };

  const toNullableIntPayload = (raw: string): number | null | undefined => {
    const t = raw.trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? Math.trunc(n) : undefined;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = String(form.code || '').trim().toUpperCase();
    const name = String(form.name || '').trim();
    if (!code || !name) {
      setStatus({ type: 'error', message: t('admin.subscriptionPlansCodeNameRequired') });
      return;
    }

    let features: unknown = undefined;
    if (form.featuresJson.trim()) {
      try {
        features = JSON.parse(form.featuresJson) as unknown;
      } catch {
        setStatus({ type: 'error', message: t('admin.subscriptionPlansInvalidFeaturesJson') });
        return;
      }
    }

    const payload: Record<string, unknown> = {
      code,
      name,
      description: String(form.description || '').trim() || null,
      status: form.status || 'Active',
      sortOrder: Number(form.sortOrder) || 0,
      billingPeriod: form.billingPeriod || 'Monthly',
      priceCents: Number(form.priceCents) || 0,
      currency: String(form.currency || 'USD').toUpperCase(),
      trialDays: Number(form.trialDays) || 0,
      badgeLabel: String(form.badgeLabel || '').trim() || null,
      maxUsers: toNullableIntPayload(form.maxUsers ?? ''),
      maxCompanies: toNullableIntPayload(form.maxCompanies ?? ''),
      maxStorageMb: toNullableIntPayload(form.maxStorageMb ?? ''),
      maxApiCallsPerDay: toNullableIntPayload(form.maxApiCallsPerDay ?? '')
    };
    if (form.featuresJson.trim()) payload.features = features;

    setSaving(true);
    setStatus(null);
    try {
      const url = editingId ? `/api/admin/subscription-plans/${editingId}` : '/api/admin/subscription-plans';
      const res = await adminFetch(url, {
        method: editingId ? 'PUT' : 'POST',
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(await parseAdminError(res, 'Save failed'));
      await load();
      closeModal();
      setStatus({ type: 'success', message: t('admin.subscriptionPlansSaved') });
    } catch (err: unknown) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: SubscriptionPlanRow) => {
    const msg = t('admin.subscriptionPlansDeleteConfirm', { code: row.code });
    if (!window.confirm(msg)) return;
    setStatus(null);
    try {
      const res = await adminFetch(`/api/admin/subscription-plans/${row.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await parseAdminError(res, 'Delete failed'));
      await load();
      setStatus({ type: 'success', message: t('admin.subscriptionPlansDeleted') });
    } catch (err: unknown) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Delete failed' });
    }
  };

  const formatPrice = (cents: number, currency: string) => {
    const v = (Number(cents) || 0) / 100;
    return `${currency} ${v.toFixed(2)}`;
  };

  const columns = useMemo<ColumnDef<SubscriptionPlanRow>[]>(
    () => [
      {
        id: 'code',
        accessorFn: (r) => r.code,
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('admin.subscriptionPlansColCode')} />,
        cell: ({ row }) => (
          <div>
            <p className="text-sm font-semibold text-foreground">{row.original.code}</p>
            <p className="text-muted-foreground text-[11px]">{row.original.name}</p>
          </div>
        )
      },
      {
        id: 'price',
        accessorFn: (r) => r.priceCents,
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('admin.subscriptionPlansColPrice')} />,
        cell: ({ row }) => <span className="text-sm tabular-nums">{formatPrice(row.original.priceCents, row.original.currency)}</span>
      },
      {
        id: 'status',
        accessorFn: (r) => r.status,
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('settings.status')} />,
        cell: ({ row }) => <span className="text-sm">{row.original.status}</span>
      },
      {
        id: 'orgs',
        accessorFn: (r) => r._count?.organizations ?? 0,
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('admin.subscriptionPlansColOrgs')} />,
        cell: ({ row }) => <span className="text-sm tabular-nums">{row.original._count?.organizations ?? 0}</span>
      },
      {
        id: 'actions',
        enableSorting: false,
        meta: { headerClassName: 'text-end', cellClassName: 'text-end' },
        header: () => <span className="inline-flex w-full justify-end text-[0.8125rem] font-medium uppercase">{t('settings.actions')}</span>,
        cell: ({ row }) => (
          <div className="flex flex-wrap justify-end gap-1">
            <Button type="button" mode="icon" size="sm" variant="outline" className="size-8" onClick={() => openEdit(row.original)}>
              <Pencil className="size-3.5" />
            </Button>
            <Button
              type="button"
              mode="icon"
              size="sm"
              variant="outline"
              className="size-8 text-destructive hover:bg-destructive/10"
              onClick={() => void remove(row.original)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        )
      }
    ],
    [t]
  );

  const table = useReactTable({
    data: filteredRows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel()
  });

  const selectClass = cn(inputVariants({ variant: 'md' }), 'cursor-pointer');

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-500">
      <div className="mb-2">
        <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">{t('admin.subscriptionPlansTitle')}</h2>
        <p className="mt-1 mb-6 text-sm font-medium text-slate-500">{t('admin.subscriptionPlansDesc')}</p>
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
            <CardTitle>{t('admin.subscriptionPlansCardTitle')}</CardTitle>
          </CardHeading>
          <CardToolbar className="w-full flex-wrap justify-stretch gap-2 sm:w-auto sm:justify-end">
            <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
              <Search className="text-muted-foreground absolute start-3 top-1/2 size-4 -translate-y-1/2" aria-hidden />
              <Input
                type="search"
                placeholder={t('admin.subscriptionPlansSearch')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="ps-9"
              />
            </div>
            <Button type="button" variant="primary" onClick={openCreate}>
              {t('admin.subscriptionPlansNew')}
            </Button>
          </CardToolbar>
        </CardHeader>
        <CardTable className="p-0">
          <DataGrid
            table={table}
            recordCount={filteredRows.length}
            isLoading={loading}
            loadingMessage={t('admin.subscriptionPlansLoading')}
            emptyMessage={rows.length === 0 ? t('admin.subscriptionPlansEmpty') : t('admin.subscriptionPlansNoMatch')}
            tableLayout={{ rowBorder: true, headerBackground: true, headerBorder: true, width: 'auto' }}
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
            <DialogTitle>{editingId ? t('admin.subscriptionPlansEdit') : t('admin.subscriptionPlansCreate')}</DialogTitle>
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
            <form id="subscription-plan-form" className="space-y-4" onSubmit={(e) => void submit(e)}>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t('admin.subscriptionPlansColCode')} *</Label>
                  <Input value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))} disabled={Boolean(editingId)} />
                </div>
                <div className="space-y-2">
                  <Label>{t('settings.name')} *</Label>
                  <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>{t('settings.description')}</Label>
                  <Textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={2} />
                </div>
                <div className="space-y-2">
                  <Label>{t('settings.status')}</Label>
                  <select
                    className={selectClass}
                    value={form.status}
                    onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>{t('admin.subscriptionPlansSortOrder')}</Label>
                  <Input value={form.sortOrder} onChange={(e) => setForm((p) => ({ ...p, sortOrder: e.target.value }))} type="number" />
                </div>
                <div className="space-y-2">
                  <Label>{t('admin.subscriptionPlansBillingPeriod')}</Label>
                  <select
                    className={selectClass}
                    value={form.billingPeriod}
                    onChange={(e) => setForm((p) => ({ ...p, billingPeriod: e.target.value }))}
                  >
                    <option value="Monthly">Monthly</option>
                    <option value="Yearly">Yearly</option>
                    <option value="Lifetime">Lifetime</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>{t('admin.subscriptionPlansPriceCents')}</Label>
                  <Input value={form.priceCents} onChange={(e) => setForm((p) => ({ ...p, priceCents: e.target.value }))} type="number" min={0} />
                </div>
                <div className="space-y-2">
                  <Label>{t('admin.subscriptionPlansCurrency')}</Label>
                  <Input value={form.currency} onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))} maxLength={8} />
                </div>
                <div className="space-y-2">
                  <Label>{t('admin.subscriptionPlansTrialDays')}</Label>
                  <Input value={form.trialDays} onChange={(e) => setForm((p) => ({ ...p, trialDays: e.target.value }))} type="number" min={0} />
                </div>
                <div className="space-y-2">
                  <Label>{t('admin.subscriptionPlansBadge')}</Label>
                  <Input value={form.badgeLabel} onChange={(e) => setForm((p) => ({ ...p, badgeLabel: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>{t('admin.subscriptionPlansMaxUsers')}</Label>
                  <Input
                    value={form.maxUsers}
                    onChange={(e) => setForm((p) => ({ ...p, maxUsers: e.target.value }))}
                    placeholder={t('admin.subscriptionPlansUnlimitedPlaceholder')}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('admin.subscriptionPlansMaxCompanies')}</Label>
                  <Input
                    value={form.maxCompanies}
                    onChange={(e) => setForm((p) => ({ ...p, maxCompanies: e.target.value }))}
                    placeholder={t('admin.subscriptionPlansUnlimitedPlaceholder')}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('admin.subscriptionPlansMaxStorageMb')}</Label>
                  <Input
                    value={form.maxStorageMb}
                    onChange={(e) => setForm((p) => ({ ...p, maxStorageMb: e.target.value }))}
                    placeholder={t('admin.subscriptionPlansUnlimitedPlaceholder')}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('admin.subscriptionPlansMaxApiCalls')}</Label>
                  <Input
                    value={form.maxApiCallsPerDay}
                    onChange={(e) => setForm((p) => ({ ...p, maxApiCallsPerDay: e.target.value }))}
                    placeholder={t('admin.subscriptionPlansUnlimitedPlaceholder')}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>{t('admin.subscriptionPlansFeaturesJson')}</Label>
                  <Textarea
                    value={form.featuresJson}
                    onChange={(e) => setForm((p) => ({ ...p, featuresJson: e.target.value }))}
                    rows={4}
                    className="font-mono text-xs"
                    placeholder="{}"
                  />
                </div>
              </div>
            </form>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeModal}>
              {t('settings.cancel')}
            </Button>
            <Button type="submit" form="subscription-plan-form" variant="primary" disabled={saving}>
              {saving ? '…' : t('settings.saveChanges')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SubscriptionPlansPage;
