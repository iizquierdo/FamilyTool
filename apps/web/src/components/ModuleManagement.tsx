import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type ColumnDef,
  type SortingState,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable
} from '@tanstack/react-table';
import { RefreshCw, Search, Trash2 } from 'lucide-react';
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

interface ModuleCatalogItem {
  id: string | null;
  name: string;
  code: string;
  description?: string | null;
  status: 'Active' | 'Inactive' | null;
  installed: boolean;
  availableInFilesystem: boolean;
  folder?: string | null;
  version?: string | null;
}

interface ModuleManagementProps {
  apiBasePath?: string;
  defaultHeaders?: HeadersInit;
}

const ModuleManagement: React.FC<ModuleManagementProps> = ({ apiBasePath = '/api/modules', defaultHeaders }) => {
  const { t } = useTranslation();
  const [modules, setModules] = useState<ModuleCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);

  const apiFetch = (path: string, init?: RequestInit) => {
    const headers = new Headers(defaultHeaders || {});
    const requestHeaders = new Headers(init?.headers || {});
    requestHeaders.forEach((value, key) => headers.set(key, value));
    return fetch(`${apiBasePath}${path}`, { ...(init || {}), headers });
  };

  const fetchModules = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiFetch('/catalog');
      if (!res.ok) throw new Error('Failed to fetch module catalog');
      const data = await res.json();
      setModules(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch modules');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchModules();
  }, []);

  const handleInstall = async (mod: ModuleCatalogItem) => {
    try {
      setBusyCode(mod.code);
      const res = await apiFetch('/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: mod.code })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'No se pudo instalar el mùdulo');
      }
      await fetchModules();
      window.dispatchEvent(new CustomEvent('modulesUpdated'));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'No se pudo instalar el mùdulo');
    } finally {
      setBusyCode(null);
    }
  };

  const handleUninstall = async (mod: ModuleCatalogItem) => {
    if (!mod.id) return;
    try {
      setBusyCode(mod.code);
      const res = await apiFetch(`/${mod.id}/uninstall`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purgeData: false })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'No se pudo desinstalar el mùdulo');
      }
      await fetchModules();
      window.dispatchEvent(new CustomEvent('modulesUpdated'));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'No se pudo desinstalar el mùdulo');
    } finally {
      setBusyCode(null);
    }
  };

  const handleDelete = async (mod: ModuleCatalogItem) => {
    if (!mod.id) return;
    if (!confirm('Esto eliminarù el registro en la tabla modules. ùContinuar?')) return;

    try {
      setBusyCode(mod.code);
      const res = await apiFetch(`/${mod.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'No se pudo eliminar el mùdulo');
      }
      await fetchModules();
      window.dispatchEvent(new CustomEvent('modulesUpdated'));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'No se pudo eliminar el mùdulo');
    } finally {
      setBusyCode(null);
    }
  };

  const filteredModules = useMemo(
    () =>
      modules.filter((mod) => {
        const q = searchTerm.toLowerCase();
        return (
          mod.name.toLowerCase().includes(q) ||
          mod.code.toLowerCase().includes(q) ||
          (mod.description || '').toLowerCase().includes(q) ||
          (mod.folder || '').toLowerCase().includes(q)
        );
      }),
    [modules, searchTerm]
  );

  const statusLabel = (mod: ModuleCatalogItem) => {
    if (mod.installed && mod.status === 'Active') return t('settings.moduleStatusInstalled');
    if (mod.installed) return t('settings.moduleStatusRegistered');
    if (mod.availableInFilesystem) return t('settings.moduleStatusAvailable');
    return t('settings.moduleStatusUnavailable');
  };

  const columns: ColumnDef<ModuleCatalogItem>[] = [
    {
      id: 'name',
      accessorFn: (row) => row.name,
      meta: { headerTitle: t('settings.name') },
      header: ({ column }) => <DataGridColumnHeader column={column} title={t('settings.name')} />,
      cell: ({ row }) => {
        const mod = row.original;
        return (
          <div>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <p className="text-sm font-semibold uppercase text-foreground">{mod.name}</p>
              {mod.version && (
                <span className="text-[10px] font-medium text-muted-foreground">v{mod.version}</span>
              )}
            </div>
            <p className="text-muted-foreground text-[11px] font-medium">{mod.code || 'ù'}</p>
          </div>
        );
      }
    },
    {
      id: 'origin',
      accessorFn: (row) =>
        row.availableInFilesystem ? `/modules/${row.folder || ''}` : t('settings.modulesDbOnly'),
      meta: { headerTitle: t('settings.modulesOrigin') },
      header: ({ column }) => <DataGridColumnHeader column={column} title={t('settings.modulesOrigin')} />,
      cell: ({ row }) => (
        <p className="max-w-[14rem] truncate text-xs text-muted-foreground">
          {row.original.availableInFilesystem
            ? `/modules/${row.original.folder}`
            : t('settings.modulesDbOnly')}
        </p>
      )
    },
    {
      id: 'description',
      accessorFn: (row) => row.description || '',
      meta: { headerTitle: t('settings.description') },
      header: ({ column }) => <DataGridColumnHeader column={column} title={t('settings.description')} />,
      cell: ({ row }) => (
        <p className="max-w-xs truncate text-xs text-muted-foreground">{row.original.description || 'ù'}</p>
      )
    },
    {
      id: 'statusKey',
      accessorFn: (row) => statusLabel(row),
      meta: { headerTitle: t('settings.status') },
      header: ({ column }) => <DataGridColumnHeader column={column} title={t('settings.status')} />,
      cell: ({ row }) => {
        const mod = row.original;
        let variant: 'success' | 'warning' | 'info' | 'secondary' = 'secondary';
        if (mod.installed && mod.status === 'Active') variant = 'success';
        else if (mod.installed) variant = 'warning';
        else if (mod.availableInFilesystem) variant = 'info';
        return (
          <Badge variant={variant} appearance="light" size="sm" className="text-[10px] font-bold uppercase tracking-wide">
            {statusLabel(mod)}
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
      cell: ({ row }) => {
        const mod = row.original;
        const isBusy = busyCode === mod.code;
        return (
          <div className="flex flex-wrap justify-end gap-1">
            {mod.availableInFilesystem && (!mod.installed || mod.status !== 'Active') && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-[10px] font-bold uppercase tracking-wide"
                disabled={isBusy}
                onClick={() => handleInstall(mod)}
              >
                {t('settings.moduleInstall')}
              </Button>
            )}
            {mod.installed && mod.status === 'Active' && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-[10px] font-bold uppercase tracking-wide"
                disabled={isBusy}
                onClick={() => handleUninstall(mod)}
              >
                {t('settings.moduleUninstall')}
              </Button>
            )}
            {mod.installed && mod.id && (
              <Button
                type="button"
                mode="icon"
                size="sm"
                variant="outline"
                className="size-8 text-destructive hover:bg-destructive/10"
                disabled={isBusy}
                onClick={() => handleDelete(mod)}
                aria-label={t('common.delete')}
              >
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </div>
        );
      }
    }
  ];

  const table = useReactTable({
    data: filteredModules,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel()
  });

  const emptyMessage =
    modules.length === 0 && !loading ? t('settings.noModules') : t('settings.modulesNoMatch');

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-500">
      <div className="mb-2">
        <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">{t('settings.modulesTitle')}</h2>
        <p className="mt-1 text-sm font-medium text-slate-500">{t('settings.modulesDesc')}</p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-medium text-red-600">{error}</div>
      )}

      <Card className="overflow-hidden">
        <CardHeader className="min-h-0 flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <CardHeading>
            <CardTitle>{t('settings.modulesCardTitle')}</CardTitle>
          </CardHeading>
          <CardToolbar className="w-full flex-wrap justify-stretch gap-2 sm:w-auto sm:justify-end">
            <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
              <Search className="text-muted-foreground absolute start-3 top-1/2 size-4 -translate-y-1/2" aria-hidden />
              <Input
                type="search"
                placeholder={t('settings.searchModulesPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={cn('ps-9')}
                aria-label={t('settings.searchModulesPlaceholder')}
              />
            </div>
            <Button
              type="button"
              variant="destructive"
              className="bg-red-500 hover:bg-red-600"
              onClick={() => fetchModules()}
              disabled={loading}
            >
              <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
              {t('settings.modulesReload')}
            </Button>
          </CardToolbar>
        </CardHeader>
        <CardTable className="p-0">
          <DataGrid
            table={table}
            recordCount={filteredModules.length}
            isLoading={loading}
            loadingMessage={t('settings.modulesLoading')}
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
    </div>
  );
};

export default ModuleManagement;
