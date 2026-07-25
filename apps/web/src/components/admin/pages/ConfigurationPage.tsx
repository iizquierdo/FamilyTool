import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { adminFetch } from '../api';
import { Alert, AlertContent, AlertDescription, AlertIcon } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, inputVariants } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

interface CoreRow {
  id: number;
  appName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  loginBackgroundUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  sidebarBackgroundColor: string;
  sidebarLogoUrl: string | null;
  menuBarColor: string;
  dateFormat: string;
  timeFormat: string;
  timezone: string;
  baseCurrency: string | null;
  moneyFormat: string;
  currencyPosition: string;
  defaultLanguage: string;
}

/** Valores locales alineados con Prisma `Core` por si el GET admin falla (sin migración, red, etc.). */
const defaultCoreRow = (): CoreRow => ({
  id: 1,
  appName: 'Sinapsis CRM/ERP',
  logoUrl: null,
  faviconUrl: null,
  loginBackgroundUrl: null,
  primaryColor: '#eb4d4b',
  secondaryColor: '#f4f4f5',
  sidebarBackgroundColor: '#000000',
  sidebarLogoUrl: null,
  menuBarColor: '',
  dateFormat: 'YYYY/MM/DD',
  timeFormat: 'HH:mm',
  timezone: 'UTC',
  baseCurrency: 'USD',
  moneyFormat: '1,234.56',
  currencyPosition: 'Prefix',
  defaultLanguage: 'es'
});

const DATE_FORMATS = ['YYYY/MM/DD', '2026/03/08', 'DD/MM/YYYY', 'MM/DD/YYYY'];
const TIME_FORMATS = ['HH:mm', '2:19 AM', 'h:mm a'];
const BASE_CURRENCIES = ['USD', 'EUR', 'ARS', 'CLP', 'GBP', 'BRL'];
const MONEY_FORMATS = ['1,234.56', '1.234,56', '1234.56'];
const CURRENCY_POSITIONS = ['Prefix', '$ 100', '100 $', 'Suffix'];
const LANGUAGES = ['en', 'es', 'English', 'Español'];

const selectClass = cn(inputVariants({ variant: 'md' }), 'cursor-pointer');

const getTimezoneOptions = (current: string) =>
  Array.from(
    new Set([
      current,
      ...(typeof Intl !== 'undefined' && 'supportedValuesOf' in Intl
        ? (Intl as unknown as { supportedValuesOf: (type: string) => string[] }).supportedValuesOf('timeZone')
        : ['UTC'])
    ])
  )
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

const ConfigurationPage: React.FC = () => {
  const [row, setRow] = useState<CoreRow>(defaultCoreRow);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<'logo' | 'favicon' | 'sidebarLogo' | 'loginBackground' | null>(null);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [tzSearch, setTzSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setStatus(null);
    try {
      const res = await adminFetch('/api/admin/core');
      let data: unknown;
      try {
        data = await res.json();
      } catch {
        throw new Error('Respuesta inválida del servidor');
      }
      if (!res.ok) {
        const msg = (data as { error?: string })?.error || `Error ${res.status}`;
        throw new Error(msg);
      }
      setRow({ ...defaultCoreRow(), ...(data as CoreRow), id: (data as CoreRow).id ?? 1 });
    } catch (e: unknown) {
      setStatus({
        type: 'error',
        message:
          e instanceof Error
            ? `${e.message}. Mostrando valores por defecto; puedes editar y guardar cuando el API esté disponible.`
            : 'No se pudo cargar la configuración. Mostrando valores por defecto.'
      });
      setRow(defaultCoreRow());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const timezoneOptions = useMemo(() => getTimezoneOptions(row.timezone || 'UTC'), [row.timezone]);
  const filteredTz = useMemo(
    () => timezoneOptions.filter((z) => z.toLowerCase().includes(tzSearch.toLowerCase())),
    [timezoneOptions, tzSearch]
  );

  const update = <K extends keyof CoreRow>(key: K, value: CoreRow[K]) => {
    setRow((prev) => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const res = await adminFetch('/api/admin/core', {
        method: 'PUT',
        body: JSON.stringify({
          appName: row.appName,
          logoUrl: row.logoUrl,
          faviconUrl: row.faviconUrl,
          loginBackgroundUrl: row.loginBackgroundUrl,
          primaryColor: row.primaryColor,
          secondaryColor: row.secondaryColor,
          sidebarBackgroundColor: row.sidebarBackgroundColor,
          sidebarLogoUrl: row.sidebarLogoUrl,
          menuBarColor: row.menuBarColor,
          dateFormat: row.dateFormat,
          timeFormat: row.timeFormat,
          timezone: row.timezone,
          baseCurrency: row.baseCurrency,
          moneyFormat: row.moneyFormat,
          currencyPosition: row.currencyPosition,
          defaultLanguage: row.defaultLanguage
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Save failed');
      setRow({ ...defaultCoreRow(), ...(data as CoreRow), id: (data as CoreRow).id ?? 1 });
      setStatus({ type: 'success', message: 'Configuración guardada.' });
    } catch (e: unknown) {
      setStatus({ type: 'error', message: e instanceof Error ? e.message : 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  const uploadAsset = async (type: 'logo' | 'favicon' | 'sidebarLogo' | 'loginBackground', file: File) => {
    setUploading(type);
    setStatus(null);
    try {
      const fd = new FormData();
      fd.append('type', type);
      fd.append('file', file);
      const res = await adminFetch('/api/admin/core/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Upload failed');
      if (type === 'logo') update('logoUrl', data.url);
      else if (type === 'favicon') update('faviconUrl', data.url);
      else if (type === 'loginBackground') update('loginBackgroundUrl', data.url);
      else update('sidebarLogoUrl', data.url);
      const label =
        type === 'logo'
          ? 'Logo'
          : type === 'favicon'
            ? 'Favicon'
            : type === 'loginBackground'
              ? 'Fondo del login'
              : 'Logo barra lateral';
      setStatus({ type: 'success', message: `${label} subido.` });
    } catch (e: unknown) {
      setStatus({ type: 'error', message: e instanceof Error ? e.message : 'Upload failed' });
    } finally {
      setUploading(null);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Configuración</h2>
        <p className="text-sm text-muted-foreground">Marca, apariencia y formatos globales de la aplicación.</p>
        {loading && (
          <div className="mt-3 space-y-2">
            <Skeleton className="h-3 w-48" />
            <p className="text-xs font-medium text-muted-foreground">Cargando valores del servidor…</p>
          </div>
        )}
      </div>

      {status && (
        <Alert variant={status.type === 'success' ? 'success' : 'destructive'} appearance="light" size="md">
          <AlertIcon>
            {status.type === 'success' ? <CheckCircle2 className="size-5" /> : <AlertCircle className="size-5" />}
          </AlertIcon>
          <AlertContent>
            <AlertDescription>{status.message}</AlertDescription>
          </AlertContent>
        </Alert>
      )}

      <Card>
        <CardHeader className="min-h-0 py-4">
          <CardTitle className="normal-case text-sm font-semibold">Marca y apariencia</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="core-app-name">Nombre de la aplicación</Label>
              <Input
                id="core-app-name"
                value={row.appName}
                onChange={(e) => update('appName', e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="core-logo">Logo</Label>
              <Input
                id="core-logo"
                type="file"
                accept="image/*"
                disabled={uploading !== null || loading}
                className="text-xs"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void uploadAsset('logo', f);
                }}
              />
              {row.logoUrl ? (
                <img src={row.logoUrl} alt="Logo" className="h-14 max-w-[200px] rounded border object-contain p-1" />
              ) : (
                <p className="text-xs text-muted-foreground">Sin logo</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="core-favicon">Favicon</Label>
              <Input
                id="core-favicon"
                type="file"
                accept=".ico,image/png,image/svg+xml,image/x-icon"
                disabled={uploading !== null || loading}
                className="text-xs"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void uploadAsset('favicon', f);
                }}
              />
              {row.faviconUrl ? (
                <img src={row.faviconUrl} alt="Favicon" className="h-10 w-10 rounded border object-contain p-1" />
              ) : (
                <p className="text-xs text-muted-foreground">Sin favicon</p>
              )}
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="core-login-bg">Imagen de fondo del login</Label>
              <Input
                id="core-login-bg"
                type="file"
                accept="image/*"
                disabled={uploading !== null || loading}
                className="text-xs"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void uploadAsset('loginBackground', f);
                }}
              />
              {row.loginBackgroundUrl ? (
                <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-3 sm:flex-row sm:items-center">
                  <img
                    src={row.loginBackgroundUrl}
                    alt=""
                    className="h-20 max-w-full rounded border object-cover sm:max-w-[280px]"
                  />
                  <Button type="button" variant="outline" size="sm" onClick={() => update('loginBackgroundUrl', null)} disabled={loading}>
                    Quitar imagen de fondo
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Opcional. Se muestra detrás del formulario de acceso (pantalla completa, cubierta suave).
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Color primario</Label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={
                    row.primaryColor.startsWith('#') && row.primaryColor.length >= 7
                      ? row.primaryColor.slice(0, 7)
                      : '#eb4d4b'
                  }
                  onChange={(e) => update('primaryColor', e.target.value)}
                  className="h-10 w-14 cursor-pointer rounded-md border border-input"
                  disabled={loading}
                  aria-label="Selector color primario"
                />
                <Input
                  value={row.primaryColor}
                  onChange={(e) => update('primaryColor', e.target.value)}
                  disabled={loading}
                  className="flex-1"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Color secundario</Label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={
                    row.secondaryColor.startsWith('#') && row.secondaryColor.length >= 7
                      ? row.secondaryColor.slice(0, 7)
                      : '#f4f4f5'
                  }
                  onChange={(e) => update('secondaryColor', e.target.value)}
                  className="h-10 w-14 cursor-pointer rounded-md border border-input"
                  disabled={loading}
                  aria-label="Selector color secundario"
                />
                <Input
                  value={row.secondaryColor}
                  onChange={(e) => update('secondaryColor', e.target.value)}
                  disabled={loading}
                  className="flex-1"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Color barra lateral izquierda (iconos)</Label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={
                    row.sidebarBackgroundColor?.startsWith('#') && row.sidebarBackgroundColor.length >= 7
                      ? row.sidebarBackgroundColor.slice(0, 7)
                      : '#000000'
                  }
                  onChange={(e) => update('sidebarBackgroundColor', e.target.value)}
                  className="h-10 w-14 cursor-pointer rounded-md border border-input"
                  disabled={loading}
                  aria-label="Selector color barra lateral"
                />
                <Input
                  value={row.sidebarBackgroundColor}
                  onChange={(e) => update('sidebarBackgroundColor', e.target.value)}
                  placeholder="#000000"
                  disabled={loading}
                  className="flex-1"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Fondo del carril estrecho con el logo; por defecto negro (#000000).
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="core-sidebar-logo">Logo barra lateral</Label>
              <Input
                id="core-sidebar-logo"
                type="file"
                accept="image/*"
                disabled={uploading !== null || loading}
                className="text-xs"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void uploadAsset('sidebarLogo', f);
                }}
              />
              {row.sidebarLogoUrl ? (
                <div className="flex items-center gap-3 rounded-md border border-border bg-black p-2">
                  <img src={row.sidebarLogoUrl} alt="" className="h-9 w-9 object-contain" />
                  <Button type="button" variant="outline" size="sm" onClick={() => update('sidebarLogoUrl', null)} disabled={loading}>
                    Quitar logo (volver al predeterminado)
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Sin imagen personalizada: se muestra la marca clara por defecto sobre el color elegido.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Color barra de menú (header)</Label>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={
                    row.menuBarColor?.startsWith('#') && row.menuBarColor.length >= 7
                      ? row.menuBarColor.slice(0, 7)
                      : '#ffffff'
                  }
                  onChange={(e) => update('menuBarColor', e.target.value)}
                  className="h-10 w-14 cursor-pointer rounded-md border border-input"
                  disabled={loading}
                  aria-label="Selector color barra de menú"
                />
                <Input
                  value={row.menuBarColor}
                  onChange={(e) => update('menuBarColor', e.target.value)}
                  placeholder="transparent o #fff"
                  disabled={loading}
                  className="flex-1"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="min-h-0 py-4">
          <CardTitle className="normal-case text-sm font-semibold">Localización y formatos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="core-date-format">Formato de fecha</Label>
              <select
                id="core-date-format"
                className={selectClass}
                value={row.dateFormat}
                onChange={(e) => update('dateFormat', e.target.value)}
                disabled={loading}
              >
                {DATE_FORMATS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="core-time-format">Formato de hora</Label>
              <select
                id="core-time-format"
                className={selectClass}
                value={row.timeFormat}
                onChange={(e) => update('timeFormat', e.target.value)}
                disabled={loading}
              >
                {TIME_FORMATS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="core-tz-search">Zona horaria</Label>
              <Input
                id="core-tz-search"
                className="mb-2"
                placeholder="Buscar…"
                value={tzSearch}
                onChange={(e) => setTzSearch(e.target.value)}
                disabled={loading}
              />
              <select
                className={selectClass}
                value={row.timezone}
                onChange={(e) => update('timezone', e.target.value)}
                disabled={loading}
                aria-label="Zona horaria"
              >
                {filteredTz.slice(0, 400).map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="core-currency">Moneda base</Label>
              <select
                id="core-currency"
                className={selectClass}
                value={row.baseCurrency || 'USD'}
                onChange={(e) => update('baseCurrency', e.target.value)}
                disabled={loading}
              >
                {BASE_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="core-money-format">Formato de importes</Label>
              <select
                id="core-money-format"
                className={selectClass}
                value={row.moneyFormat}
                onChange={(e) => update('moneyFormat', e.target.value)}
                disabled={loading}
              >
                {MONEY_FORMATS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="core-currency-pos">Posición del símbolo de moneda</Label>
              <select
                id="core-currency-pos"
                className={selectClass}
                value={row.currencyPosition}
                onChange={(e) => update('currencyPosition', e.target.value)}
                disabled={loading}
              >
                {CURRENCY_POSITIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="core-lang">Idioma por defecto</Label>
              <select
                id="core-lang"
                className={selectClass}
                value={row.defaultLanguage}
                onChange={(e) => update('defaultLanguage', e.target.value)}
                disabled={loading}
              >
                {LANGUAGES.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => void load()} disabled={saving || loading}>
          Recargar
        </Button>
        <Button type="button" onClick={() => void save()} disabled={saving || uploading !== null || loading}>
          {saving ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
    </div>
  );
};

export default ConfigurationPage;
