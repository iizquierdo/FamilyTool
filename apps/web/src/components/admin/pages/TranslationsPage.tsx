import React, { useEffect, useMemo, useState } from 'react';
import { adminFetch } from '../api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, inputVariants } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

interface TranslationOverrideRow {
  id: string;
  locale: string;
  namespace: string | null;
  key: string;
  value: string;
}

const selectClass = cn(inputVariants({ variant: 'md' }), 'cursor-pointer w-auto min-w-[6rem]');

const TranslationsPage: React.FC = () => {
  const [locale, setLocale] = useState('es');
  const [rows, setRows] = useState<TranslationOverrideRow[]>([]);
  const [namespace, setNamespace] = useState('');
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await adminFetch(`/api/admin/translations?locale=${encodeURIComponent(locale)}`);
      const data = await res.json();
      if (res.ok) setRows(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [locale]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!key.trim()) return;
    await adminFetch('/api/admin/translations', {
      method: 'PUT',
      body: JSON.stringify({
        entries: [{ locale, namespace: namespace.trim() || null, key: key.trim(), value }]
      })
    });
    setKey('');
    setValue('');
    await load();
  };

  const deleteRow = async (id: string) => {
    await adminFetch(`/api/admin/translations/${id}`, { method: 'DELETE' });
    await load();
  };

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => `${a.namespace || ''}.${a.key}`.localeCompare(`${b.namespace || ''}.${b.key}`)),
    [rows]
  );

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Translations Overrides</h2>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="tr-locale">Locale</Label>
            <select
              id="tr-locale"
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
              className={selectClass}
            >
              <option value="es">es</option>
              <option value="en">en</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <form onSubmit={submit} className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="tr-ns" className="sr-only">
            namespace
          </Label>
          <Input id="tr-ns" value={namespace} onChange={(e) => setNamespace(e.target.value)} placeholder="namespace" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tr-key" className="sr-only">
            key
          </Label>
          <Input id="tr-key" value={key} onChange={(e) => setKey(e.target.value)} placeholder="key (ej: auth.signIn)" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tr-value" className="sr-only">
            translated text
          </Label>
          <Input id="tr-value" value={value} onChange={(e) => setValue(e.target.value)} placeholder="translated text" />
        </div>
        <Button type="submit" className="md:self-end">
          Save override
        </Button>
      </form>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Namespace</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Value</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.namespace || 'translation'}</TableCell>
                  <TableCell className="font-mono text-xs">{row.key}</TableCell>
                  <TableCell>{row.value}</TableCell>
                  <TableCell>
                    <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => void deleteRow(row.id)}>
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
};

export default TranslationsPage;
