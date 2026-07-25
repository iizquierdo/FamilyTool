import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type ColumnDef,
  type SortingState,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable
} from '@tanstack/react-table';
import { Languages, Plus, Search, Trash2 } from 'lucide-react';
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

export interface SettingsLanguageRow {
  id: string;
  name: string;
  code: string;
  status: 'Active' | 'Inactive';
}

export interface LanguagesSettingsTableProps {
  languages: SettingsLanguageRow[];
  onAddLanguage: () => void;
}

const LanguagesSettingsTable: React.FC<LanguagesSettingsTableProps> = ({ languages, onAddLanguage }) => {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);

  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return languages.filter(
      (lang) =>
        (lang.name || '').toLowerCase().includes(q) || (lang.code || '').toLowerCase().includes(q)
    );
  }, [languages, searchTerm]);

  const columns = useMemo<ColumnDef<SettingsLanguageRow>[]>(
    () => [
      {
        id: 'name',
        accessorFn: (row) => row.name,
        meta: { headerTitle: t('settings.language') },
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('settings.language')} />,
        cell: ({ row }) => <span className="text-sm font-semibold text-foreground">{row.original.name}</span>
      },
      {
        accessorKey: 'code',
        meta: { headerTitle: t('settings.code') },
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('settings.code')} />,
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.code}</span>
      },
      {
        id: 'status',
        accessorFn: (row) => row.status,
        meta: { headerTitle: t('settings.status') },
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('settings.status')} />,
        cell: ({ row }) => (
          <span
            className={cn(
              'rounded-lg px-2.5 py-1 text-xs font-bold uppercase tracking-wider',
              row.original.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'
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
        cell: () => (
          <div className="flex justify-end gap-1">
            <Button
              type="button"
              mode="icon"
              size="sm"
              variant="outline"
              className="size-8"
              disabled
              title={t('settings.comingSoon')}
              aria-label={t('settings.comingSoon')}
            >
              <Languages className="size-3.5" />
            </Button>
            <Button
              type="button"
              mode="icon"
              size="sm"
              variant="outline"
              className="size-8 text-destructive hover:bg-destructive/10"
              disabled
              title={t('settings.comingSoon')}
              aria-label={t('settings.comingSoon')}
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
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel()
  });

  const emptyMessage = languages.length === 0 ? t('settings.noLanguages') : t('settings.languagesNoMatch');

  return (
    <div className="w-full animate-in fade-in duration-500 pb-12">
      <div className="mb-6">
        <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">{t('settings.languagesTitle')}</h2>
        <p className="mt-1 font-medium text-slate-500">{t('settings.languagesDesc')}</p>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="min-h-0 flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <CardHeading>
            <CardTitle>{t('settings.languagesCardTitle')}</CardTitle>
          </CardHeading>
          <CardToolbar className="w-full flex-wrap justify-stretch gap-2 sm:w-auto sm:justify-end">
            <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
              <Search className="text-muted-foreground absolute start-3 top-1/2 size-4 -translate-y-1/2" aria-hidden />
              <Input
                type="search"
                placeholder={t('settings.searchLanguagesPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={cn('ps-9')}
                aria-label={t('settings.searchLanguagesPlaceholder')}
              />
            </div>
            <Button
              type="button"
              variant="primary"
              onClick={onAddLanguage}
            >
              <Plus className="size-4" />
              {t('settings.addLanguage')}
            </Button>
          </CardToolbar>
        </CardHeader>
        <CardTable className="p-0">
          <DataGrid
            table={table}
            recordCount={filtered.length}
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

export default LanguagesSettingsTable;
