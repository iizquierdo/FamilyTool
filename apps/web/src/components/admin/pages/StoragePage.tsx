import React, { useEffect, useState } from 'react';
import { adminFetch } from '../api';
import { Alert, AlertContent, AlertDescription, AlertIcon } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, inputVariants } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

type StorageProvider = 'Local' | 'S3' | 'GoogleCloud' | 'Azure';

interface StorageFormState {
  provider: StorageProvider;
  settings: Record<string, string>;
}

const INITIAL_STATE: StorageFormState = {
  provider: 'Local',
  settings: {}
};

const selectClass = cn(inputVariants({ variant: 'md' }), 'cursor-pointer');

const StoragePage: React.FC = () => {
  const [form, setForm] = useState<StorageFormState>(INITIAL_STATE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setStatus(null);
      try {
        const res = await adminFetch('/api/admin/settings/storage');
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Failed to load storage settings');

        const value = data?.value || {};
        const providerRaw = String(value?.provider || value?.storageProvider || 'Local');
        const provider: StorageProvider =
          providerRaw === 'S3' || providerRaw === 'GoogleCloud' || providerRaw === 'Azure' ? providerRaw : 'Local';
        const settings = value?.settings || value?.storageSettings || {};

        setForm({
          provider,
          settings: typeof settings === 'object' && settings !== null ? settings : {}
        });
      } catch (error: unknown) {
        setStatus({
          type: 'error',
          message: error instanceof Error ? error.message : 'Failed to load storage settings'
        });
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const updateSetting = (key: string, value: string) => {
    setForm((prev) => ({
      ...prev,
      settings: { ...prev.settings, [key]: value }
    }));
  };

  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const value = {
        provider: form.provider,
        settings: form.settings
      };
      const res = await adminFetch('/api/admin/settings/storage', {
        method: 'PUT',
        body: JSON.stringify({ value })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to save storage settings');
      setStatus({ type: 'success', message: 'Storage settings saved successfully.' });
    } catch (error: unknown) {
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to save storage settings'
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Storage Configuration</h2>
        <p className="text-sm text-slate-500">Define where platform files will be stored.</p>
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

      {loading ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10">
            <Skeleton className="h-4 w-48" />
            <p className="text-sm text-muted-foreground">Loading storage settings...</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="min-h-0 py-4">
            <CardTitle className="normal-case text-base font-semibold">Storage provider</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="storage-provider">Provider</Label>
              <select
                id="storage-provider"
                value={form.provider}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    provider: e.target.value as StorageProvider
                  }))
                }
                className={selectClass}
              >
                <option value="Local">Local</option>
                <option value="S3">Amazon S3</option>
                <option value="GoogleCloud">Google Cloud Storage</option>
                <option value="Azure">Azure Blob Storage</option>
              </select>
            </div>

            {form.provider === 'Local' && (
              <Alert variant="secondary" appearance="outline" size="md">
                <AlertContent>
                  <AlertDescription>Files are stored locally under the server storage folder.</AlertDescription>
                </AlertContent>
              </Alert>
            )}

            {form.provider === 'S3' && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="s3-access">Access Key</Label>
                  <Input
                    id="s3-access"
                    type="text"
                    value={String(form.settings.accessKey || '')}
                    onChange={(e) => updateSetting('accessKey', e.target.value)}
                    placeholder="AKIA..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="s3-secret">Secret Key</Label>
                  <Input
                    id="s3-secret"
                    type="password"
                    value={String(form.settings.secretKey || '')}
                    onChange={(e) => updateSetting('secretKey', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="s3-bucket">Bucket</Label>
                  <Input
                    id="s3-bucket"
                    type="text"
                    value={String(form.settings.bucket || '')}
                    onChange={(e) => updateSetting('bucket', e.target.value)}
                    placeholder="my-storage-bucket"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="s3-region">Region</Label>
                  <Input
                    id="s3-region"
                    type="text"
                    value={String(form.settings.region || '')}
                    onChange={(e) => updateSetting('region', e.target.value)}
                    placeholder="us-east-1"
                  />
                </div>
              </div>
            )}

            {form.provider === 'GoogleCloud' && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="gcp-project">Project ID</Label>
                  <Input
                    id="gcp-project"
                    type="text"
                    value={String(form.settings.projectId || '')}
                    onChange={(e) => updateSetting('projectId', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gcp-bucket">Bucket</Label>
                  <Input
                    id="gcp-bucket"
                    type="text"
                    value={String(form.settings.bucket || '')}
                    onChange={(e) => updateSetting('bucket', e.target.value)}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="gcp-keyfile">Key File (JSON)</Label>
                  <Textarea
                    id="gcp-keyfile"
                    value={String(form.settings.keyFile || '')}
                    onChange={(e) => updateSetting('keyFile', e.target.value)}
                    rows={4}
                    className="font-mono text-xs"
                    placeholder='{ "type": "service_account", ... }'
                  />
                </div>
              </div>
            )}

            {form.provider === 'Azure' && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="azure-conn">Connection String</Label>
                  <Input
                    id="azure-conn"
                    type="text"
                    value={String(form.settings.connectionString || '')}
                    onChange={(e) => updateSetting('connectionString', e.target.value)}
                    placeholder="DefaultEndpointsProtocol=https;AccountName=..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="azure-container">Container</Label>
                  <Input
                    id="azure-container"
                    type="text"
                    value={String(form.settings.container || '')}
                    onChange={(e) => updateSetting('container', e.target.value)}
                    placeholder="my-container"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button type="button" onClick={() => void save()} disabled={saving}>
                {saving ? 'Saving...' : 'Save Storage'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default StoragePage;
