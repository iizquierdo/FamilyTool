import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type ColumnDef,
  type SortingState,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable
} from '@tanstack/react-table';
import { ListTree, Pencil, Plus, Search, Trash2 } from 'lucide-react';
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

export interface SettingsCategoryRow {
  id: string;
  code: string;
  name: string;
  description: string;
  module: string;
  status: 'Active' | 'Inactive';
  sortingRule: 'Manual' | 'Alpha_ASC' | 'Alpha_DESC';
  _count?: { items: number };
}

export interface CategoriesSettingsTableProps {
  categories: SettingsCategoryRow[];
  showDevActions: boolean;
  /** When true, category definitions are view-only (SaaS admin owns CRUD). */
  readOnlyCategoryDefinitions?: boolean;
  onSelectCategory: (category: SettingsCategoryRow) => void;
  onEditCategory: (category: SettingsCategoryRow) => void;
  onDeleteCategory: (id: string) => void;
  onNewCategory: () => void;
}

const CategoriesSettingsTable: React.FC<CategoriesSettingsTableProps> = ({
  categories,
  showDevActions,
  readOnlyCategoryDefinitions = false,
  onSelectCategory,
  onEditCategory,
  onDeleteCategory,
  onNewCategory
}) => {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);

  const filtered = useMemo(
    () =>
      categories.filter((c) => {
        const q = searchTerm.toLowerCase();
        return (
          (c.name || '').toLowerCase().includes(q) ||
          (c.module || '').toLowerCase().includes(q) ||
          (c.code || '').toLowerCase().includes(q)
        );
      }),
    [categories, searchTerm]
  );

  const columns = useMemo<ColumnDef<SettingsCategoryRow>[]>(
    () => [
      {
        id: 'name',
        accessorFn: (row) => row.name,
        meta: { headerTitle: t('settings.name') },
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('settings.name')} />,
        cell: ({ row }) => (
          <div>
            <p className="text-sm font-semibold uppercase text-foreground">{row.original.name}</p>
            <p className="text-muted-foreground text-[11px] font-medium">{row.original.code || '—'}</p>
          </div>
        )
      },
      {
        id: 'module',
        accessorFn: (row) => row.module,
        meta: { headerTitle: t('settings.module') },
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('settings.module')} />,
        cell: ({ row }) => (
          <Badge variant="destructive" appearance="light" className="text-[10px] font-bold uppercase tracking-wider">
            {row.original.module}
          </Badge>
        )
      },
      {
        id: 'items',
        accessorFn: (row) => row._count?.items ?? 0,
        meta: { headerTitle: t('settings.itemsColumn') },
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('settings.itemsColumn')} />,
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-2 rounded-lg bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">
            <ListTree className="size-3.5" aria-hidden />
            {row.original._count?.items ?? 0}
          </span>
        )
      },
      {
        id: 'status',
        accessorFn: (row) => row.status,
        meta: { headerTitle: t('settings.status') },
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('settings.status')} />,
        cell: ({ row }) => (
          <span
            className={cn(
              'rounded-lg border px-2 py-1 text-[10px] font-bold uppercase tracking-wider',
              row.original.status === 'Active'
                ? 'border-emerald-100 bg-emerald-50 text-emerald-600'
                : 'border-border bg-muted text-muted-foreground'
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
            {!readOnlyCategoryDefinitions && (
              <Button
                type="button"
                mode="icon"
                size="sm"
                variant="outline"
                className="size-8"
                onClick={() => onEditCategory(row.original)}
                aria-label={t('settings.edit')}
              >
                <Pencil className="size-3.5" />
              </Button>
            )}
            {showDevActions && !readOnlyCategoryDefinitions && (
              <Button
                type="button"
                mode="icon"
                size="sm"
                variant="outline"
                className="size-8 text-destructive hover:bg-destructive/10"
                onClick={() => onDeleteCategory(row.original.id)}
                aria-label={t('common.delete')}
              >
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </div>
        )
      }
    ],
    [t, showDevActions, readOnlyCategoryDefinitions, onEditCategory, onDeleteCategory]
  );

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel()
  });

  const emptyMessage = categories.length === 0 ? t('settings.noCategories') : t('settings.categoriesNoMatch');

  return (
    <div className="w-full animate-in fade-in duration-500 pb-12">
      <div className="mb-6">
        <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">{t('settings.categoriesTitle')}</h2>
        <p className="mt-1 font-medium text-slate-500">{t('settings.categoriesDesc')}</p>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="min-h-0 flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <CardHeading>
            <CardTitle>{t('settings.categoriesCardTitle')}</CardTitle>
          </CardHeading>
          <CardToolbar className="w-full flex-wrap justify-stretch gap-2 sm:w-auto sm:justify-end">
            <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
              <Search className="text-muted-foreground absolute start-3 top-1/2 size-4 -translate-y-1/2" aria-hidden />
              <Input
                type="search"
                placeholder={t('settings.searchCategoryPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={cn('ps-9')}
                aria-label={t('settings.searchCategoryPlaceholder')}
              />
            </div>
            {showDevActions && !readOnlyCategoryDefinitions && (
              <Button
                type="button"
                variant="primary"
                onClick={onNewCategory}
              >
                <Plus className="size-4" />
                {t('settings.newCategory')}
              </Button>
            )}
          </CardToolbar>
        </CardHeader>
        <CardTable className="p-0">
          <DataGrid
            table={table}
            recordCount={filtered.length}
            emptyMessage={emptyMessage}
            onRowClick={(row) => onSelectCategory(row)}
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

export default CategoriesSettingsTable;
