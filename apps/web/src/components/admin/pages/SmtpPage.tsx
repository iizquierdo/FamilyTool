import React, { useEffect, useState } from 'react';
import { adminFetch } from '../api';
import { Alert, AlertContent, AlertDescription, AlertIcon } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, inputVariants } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

type MailProvider = 'SMTP' | 'SES';

interface SmtpFormState {
  provider: MailProvider;
  smtp: {
    host: string;
    port: string;
    encryption: string;
    user: string;
    pass: string;
    fromEmail: string;
  };
  ses: {
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    fromEmail: string;
  };
}

const INITIAL_STATE: SmtpFormState = {
  provider: 'SMTP',
  smtp: {
    host: '',
    port: '587',
    encryption: 'TLS',
    user: '',
    pass: '',
    fromEmail: ''
  },
  ses: {
    region: '',
    accessKeyId: '',
    secretAccessKey: '',
    fromEmail: ''
  }
};

const selectClass = cn(inputVariants({ variant: 'md' }), 'cursor-pointer');

const SmtpPage: React.FC = () => {
  const [form, setForm] = useState<SmtpFormState>(INITIAL_STATE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [testStatus, setTestStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setStatus(null);
      try {
        const res = await adminFetch('/api/admin/settings/smtp');
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || 'Failed to load SMTP settings');
        }

        const value = data?.value || {};
        const provider: MailProvider = value?.provider === 'SES' ? 'SES' : 'SMTP';
        const config = value?.config || {};

        setForm((prev) => ({
          provider,
          smtp: {
            ...prev.smtp,
            host: provider === 'SMTP' ? String(config.host || '') : prev.smtp.host,
            port: provider === 'SMTP' ? String(config.port || '587') : prev.smtp.port,
            encryption: provider === 'SMTP' ? String(config.encryption || 'TLS') : prev.smtp.encryption,
            user: provider === 'SMTP' ? String(config.user || '') : prev.smtp.user,
            pass: provider === 'SMTP' ? String(config.pass || '') : prev.smtp.pass,
            fromEmail: provider === 'SMTP' ? String(config.fromEmail || '') : prev.smtp.fromEmail
          },
          ses: {
            ...prev.ses,
            region: provider === 'SES' ? String(config.region || '') : prev.ses.region,
            accessKeyId: provider === 'SES' ? String(config.accessKeyId || '') : prev.ses.accessKeyId,
            secretAccessKey: provider === 'SES' ? String(config.secretAccessKey || '') : prev.ses.secretAccessKey,
            fromEmail: provider === 'SES' ? String(config.fromEmail || '') : prev.ses.fromEmail
          }
        }));
      } catch (error: unknown) {
        setStatus({
          type: 'error',
          message: error instanceof Error ? error.message : 'Failed to load SMTP settings'
        });
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const payload = {
        provider: form.provider,
        config: form.provider === 'SES' ? form.ses : form.smtp
      };
      const res = await adminFetch('/api/admin/settings/smtp', {
        method: 'PUT',
        body: JSON.stringify({ value: payload })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to save SMTP settings');
      }
      setStatus({ type: 'success', message: 'SMTP settings saved successfully.' });
    } catch (error: unknown) {
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to save SMTP settings'
      });
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    const to = testEmail.trim();
    if (!to) {
      setTestStatus({ type: 'error', message: 'Ingresá un correo de destino para la prueba.' });
      return;
    }
    setTesting(true);
    setTestStatus(null);
    try {
      const value = {
        provider: form.provider,
        config: form.provider === 'SES' ? form.ses : form.smtp
      };
      const res = await adminFetch('/api/admin/settings/smtp/test', {
        method: 'POST',
        body: JSON.stringify({ toEmail: to, value })
      });
      const data = (await res.json()) as { error?: string; details?: string; message?: string };
      if (!res.ok) {
        throw new Error(data?.details || data?.error || 'SMTP test failed');
      }
      setTestStatus({ type: 'success', message: data?.message || 'Test email sent.' });
    } catch (error: unknown) {
      setTestStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'SMTP test failed'
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">SMTP Configuration</h2>
        <p className="text-sm text-slate-500">Configure the global outbound email provider used by the platform.</p>
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

      {testStatus && (
        <Alert variant={testStatus.type === 'success' ? 'success' : 'destructive'} appearance="light" size="md">
          <AlertIcon>
            {testStatus.type === 'success' ? <CheckCircle2 className="size-5" /> : <AlertCircle className="size-5" />}
          </AlertIcon>
          <AlertContent>
            <AlertDescription>{testStatus.message}</AlertDescription>
          </AlertContent>
        </Alert>
      )}

      {loading ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10">
            <Skeleton className="h-4 w-48" />
            <p className="text-sm text-muted-foreground">Loading SMTP settings...</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="min-h-0 py-4">
            <CardTitle className="normal-case text-base font-semibold">Mail provider</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="smtp-provider">Provider</Label>
              <select
                id="smtp-provider"
                value={form.provider}
                onChange={(e) => setForm((prev) => ({ ...prev, provider: e.target.value === 'SES' ? 'SES' : 'SMTP' }))}
                className={selectClass}
              >
                <option value="SMTP">SMTP</option>
                <option value="SES">Amazon SES</option>
              </select>
            </div>

            {form.provider === 'SMTP' ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="smtp-host">Host</Label>
                  <Input
                    id="smtp-host"
                    type="text"
                    value={form.smtp.host}
                    onChange={(e) => setForm((prev) => ({ ...prev, smtp: { ...prev.smtp, host: e.target.value } }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-port">Port</Label>
                  <Input
                    id="smtp-port"
                    type="text"
                    value={form.smtp.port}
                    onChange={(e) => setForm((prev) => ({ ...prev, smtp: { ...prev.smtp, port: e.target.value } }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-encryption">Encryption</Label>
                  <select
                    id="smtp-encryption"
                    value={form.smtp.encryption}
                    onChange={(e) => setForm((prev) => ({ ...prev, smtp: { ...prev.smtp, encryption: e.target.value } }))}
                    className={selectClass}
                  >
                    <option value="NONE">NONE</option>
                    <option value="TLS">TLS</option>
                    <option value="SSL">SSL</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-user">User</Label>
                  <Input
                    id="smtp-user"
                    type="text"
                    value={form.smtp.user}
                    onChange={(e) => setForm((prev) => ({ ...prev, smtp: { ...prev.smtp, user: e.target.value } }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-pass">Password</Label>
                  <Input
                    id="smtp-pass"
                    type="password"
                    value={form.smtp.pass}
                    onChange={(e) => setForm((prev) => ({ ...prev, smtp: { ...prev.smtp, pass: e.target.value } }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-from">From Email</Label>
                  <Input
                    id="smtp-from"
                    type="email"
                    value={form.smtp.fromEmail}
                    onChange={(e) => setForm((prev) => ({ ...prev, smtp: { ...prev.smtp, fromEmail: e.target.value } }))}
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="ses-region">Region</Label>
                  <Input
                    id="ses-region"
                    type="text"
                    value={form.ses.region}
                    onChange={(e) => setForm((prev) => ({ ...prev, ses: { ...prev.ses, region: e.target.value } }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ses-access">Access Key ID</Label>
                  <Input
                    id="ses-access"
                    type="text"
                    value={form.ses.accessKeyId}
                    onChange={(e) => setForm((prev) => ({ ...prev, ses: { ...prev.ses, accessKeyId: e.target.value } }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ses-secret">Secret Access Key</Label>
                  <Input
                    id="ses-secret"
                    type="password"
                    value={form.ses.secretAccessKey}
                    onChange={(e) => setForm((prev) => ({ ...prev, ses: { ...prev.ses, secretAccessKey: e.target.value } }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ses-from">From Email</Label>
                  <Input
                    id="ses-from"
                    type="email"
                    value={form.ses.fromEmail}
                    onChange={(e) => setForm((prev) => ({ ...prev, ses: { ...prev.ses, fromEmail: e.target.value } }))}
                  />
                </div>
              </div>
            )}

            <div className="space-y-2 border-t border-border pt-6">
              <Label htmlFor="smtp-test-email">Correo de prueba (destino)</Label>
              <p className="text-xs text-muted-foreground">
                Se envía un mensaje de prueba usando los valores del formulario (no hace falta guardar antes).
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <Input
                  id="smtp-test-email"
                  type="email"
                  autoComplete="email"
                  placeholder="tu@correo.com"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  className="sm:max-w-md"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void testConnection()}
                  disabled={testing || saving}
                  className="shrink-0"
                >
                  {testing ? 'Probando…' : 'Probar conexión'}
                </Button>
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="button" onClick={() => void save()} disabled={saving}>
                {saving ? 'Saving...' : 'Save SMTP'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SmtpPage;
