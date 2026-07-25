import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type ColumnDef,
  type SortingState,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable
} from '@tanstack/react-table';
import { Eye, Pencil, Plus, Search, Trash2 } from 'lucide-react';
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

export interface CompaniesSettingsCompany {
  id: string;
  name: string;
  description?: string | null;
  city?: string;
  country?: string;
  type?: string | null;
  status: string;
  logoUrl?: string | null;
}

export interface CompaniesSettingsTableProps {
  companies: CompaniesSettingsCompany[];
  onSelectCompany: (id: string) => void;
  onEditCompany: (company: CompaniesSettingsCompany) => void;
  onDeleteCompany: (id: string) => void;
  onNewCompany: () => void;
}

const CompaniesSettingsTable: React.FC<CompaniesSettingsTableProps> = ({
  companies,
  onSelectCompany,
  onEditCompany,
  onDeleteCompany,
  onNewCompany
}) => {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);

  const filtered = useMemo(
    () =>
      companies.filter((c) => {
        const q = searchTerm.toLowerCase();
        return (
          (c.name || '').toLowerCase().includes(q) ||
          (c.description || '').toLowerCase().includes(q) ||
          (c.city || '').toLowerCase().includes(q) ||
          (c.country || '').toLowerCase().includes(q) ||
          (c.type || '').toLowerCase().includes(q)
        );
      }),
    [companies, searchTerm]
  );

  const columns = useMemo<ColumnDef<CompaniesSettingsCompany>[]>(
    () => [
      {
        id: 'name',
        accessorFn: (row) => row.name,
        meta: { headerTitle: t('settings.name') },
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('settings.name')} />,
        cell: ({ row }) => {
          const c = row.original;
          return (
            <div className="flex items-center gap-3">
              {c.logoUrl ? (
                <img
                  src={c.logoUrl}
                  alt={c.name}
                  className="h-9 w-9 flex-shrink-0 rounded-xl border border-border bg-background object-contain p-1"
                />
              ) : (
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-red-50 text-sm font-bold text-red-500">
                  {c.name[0]}
                </div>
              )}
              <div>
                <p className="text-sm font-semibold text-foreground">{c.name}</p>
                <p className="text-[11px] font-medium text-muted-foreground">{c.description || '—'}</p>
              </div>
            </div>
          );
        }
      },
      {
        id: 'cityCountry',
        accessorFn: (row) => [row.city, row.country].filter(Boolean).join(', ') || '',
        meta: { headerTitle: t('settings.cityCountry') },
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('settings.cityCountry')} />,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {[row.original.city, row.original.country].filter(Boolean).join(', ') || '—'}
          </span>
        )
      },
      {
        id: 'type',
        accessorFn: (row) => row.type || '',
        meta: { headerTitle: t('settings.type') },
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('settings.type')} />,
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.type || '—'}</span>
      },
      {
        id: 'status',
        accessorFn: (row) => row.status,
        meta: { headerTitle: t('settings.status') },
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('settings.status')} />,
        cell: ({ row }) => (
          <span
            className={cn(
              'rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider',
              row.original.status === 'Active' ? 'bg-emerald-50 text-emerald-600' : 'bg-muted text-muted-foreground'
            )}
          >
            {row.original.status === 'Active' ? t('settings.active') : t('settings.inactive')}
          </span>
        )
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
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button
              type="button"
              mode="icon"
              size="sm"
              variant="outline"
              className="size-8"
              onClick={() => onSelectCompany(row.original.id)}
              aria-label={t('settings.viewProfile')}
            >
              <Eye className="size-3.5" />
            </Button>
            <Button
              type="button"
              mode="icon"
              size="sm"
              variant="outline"
              className="size-8"
              onClick={() => onEditCompany(row.original)}
              aria-label={t('settings.edit')}
            >
              <Pencil className="size-3.5" />
            </Button>
            <Button
              type="button"
              mode="icon"
              size="sm"
              variant="outline"
              className="size-8 text-destructive hover:bg-destructive/10"
              onClick={() => onDeleteCompany(row.original.id)}
              aria-label={t('common.delete')}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        )
      }
    ],
    [t, onSelectCompany, onEditCompany, onDeleteCompany]
  );

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel()
  });

  const emptyMessage =
    companies.length === 0 ? t('settings.noCompaniesFound') : t('settings.companiesNoMatch');

  return (
    <div className="w-full animate-in fade-in duration-500 pb-20">
      <div className="mb-6">
        <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">{t('settings.companiesTitle')}</h2>
        <p className="mt-1 font-medium text-slate-500">{t('settings.companiesDesc')}</p>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="min-h-0 flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <CardHeading>
            <CardTitle>{t('settings.companiesCardTitle')}</CardTitle>
          </CardHeading>
          <CardToolbar className="w-full flex-wrap justify-stretch gap-2 sm:w-auto sm:justify-end">
            <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
              <Search className="text-muted-foreground absolute start-3 top-1/2 size-4 -translate-y-1/2" aria-hidden />
              <Input
                type="search"
                placeholder={t('settings.searchCompaniesPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={cn('ps-9')}
                aria-label={t('settings.searchCompaniesPlaceholder')}
              />
            </div>
            <Button
              type="button"
              variant="primary"
              onClick={onNewCompany}
            >
              <Plus className="size-4" />
              {t('settings.newCompany')}
            </Button>
          </CardToolbar>
        </CardHeader>
        <CardTable className="p-0">
          <DataGrid
            table={table}
            recordCount={filtered.length}
            emptyMessage={emptyMessage}
            onRowClick={(row) => onSelectCompany(row.id)}
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

export default CompaniesSettingsTable;
