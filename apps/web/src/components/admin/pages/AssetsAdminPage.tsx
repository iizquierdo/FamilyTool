import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { adminFetch } from '../api';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Organization = { id: string; name: string };
type Company = { id: string; name: string; organizationId: string };
type CategoryRow = { id: string; code: string | null; name: string };
type CategoryItem = { id: string; name: string; code: string | null };
type AssetProduct = {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  typeCategoryItemId: string | null;
  sku: string | null;
  manufacturer: string | null;
  model: string | null;
  status: string;
  typeCategoryItemName?: string | null;
};
type ProductFile = {
  id: string;
  productId: string;
  kind: string;
  name: string;
  originalName: string;
  fileUrl: string;
  mimeType: string | null;
  sizeBytes: number;
};
type AssetRow = {
  id: string;
  organizationId: string;
  productId: string;
  code: string;
  referenceCompanyId: string | null;
  serialNumber: string | null;
  assetTag: string | null;
  notes: string | null;
  statusCategoryItemId: string | null;
  productName?: string;
  statusCategoryItemName?: string | null;
  companyNames?: string[];
  companyIds?: string[];
};

const parseError = async (res: Response, fallback: string) => {
  try {
    const b = await res.json();
    const d = b?.details ? ` ${b.details}` : '';
    return `${b?.error || fallback}${d}`;
  } catch {
    return `${fallback} (${res.status})`;
  }
};

const AssetsAdminPage: React.FC = () => {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [orgId, setOrgId] = useState('');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [typeItems, setTypeItems] = useState<CategoryItem[]>([]);
  const [statusItems, setStatusItems] = useState<CategoryItem[]>([]);
  const [tab, setTab] = useState<'products' | 'assets'>('products');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [products, setProducts] = useState<AssetProduct[]>([]);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [assetFilterCompany, setAssetFilterCompany] = useState('');

  const [productModal, setProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<AssetProduct | null>(null);
  const [productForm, setProductForm] = useState({
    name: '',
    description: '',
    typeCategoryItemId: '',
    sku: '',
    manufacturer: '',
    model: '',
    status: 'Active'
  });

  const [files, setFiles] = useState<ProductFile[]>([]);
  const [fileUploading, setFileUploading] = useState(false);

  const [assetModal, setAssetModal] = useState(false);
  const [editingAsset, setEditingAsset] = useState<AssetRow | null>(null);
  const [assetForm, setAssetForm] = useState({
    productId: '',
    companyIds: [] as string[],
    referenceCompanyId: '',
    serialNumber: '',
    assetTag: '',
    notes: '',
    statusCategoryItemId: ''
  });

  const loadOrgs = useCallback(async () => {
    const res = await adminFetch('/api/admin/organizations');
    if (!res.ok) {
      setError(await parseError(res, 'No se pudieron cargar las organizaciones'));
      return;
    }
    const data = await res.json();
    setOrgs(Array.isArray(data) ? data : []);
  }, []);

  const resolveCategoryItems = useCallback(async (code: string): Promise<CategoryItem[]> => {
    const res = await adminFetch('/api/admin/categories');
    if (!res.ok) return [];
    const cats: CategoryRow[] = await res.json();
    const cat = cats.find((c) => String(c.code || '') === code);
    if (!cat) return [];
    const detail = await adminFetch(`/api/admin/categories/${cat.id}`);
    if (!detail.ok) return [];
    const body = await detail.json();
    return Array.isArray(body.items) ? body.items : [];
  }, []);

  const loadCompanies = useCallback(async (oid: string) => {
    if (!oid) {
      setCompanies([]);
      return;
    }
    const res = await adminFetch(`/api/admin/organizations/${oid}/companies`);
    if (!res.ok) {
      setError(await parseError(res, 'No se pudieron cargar las compañías'));
      setCompanies([]);
      return;
    }
    setCompanies(await res.json());
  }, []);

  const loadProducts = useCallback(async () => {
    if (!orgId) {
      setProducts([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch(`/api/admin/asset-products?organizationId=${encodeURIComponent(orgId)}`);
      if (!res.ok) setError(await parseError(res, 'Error al cargar productos'));
      else setProducts(await res.json());
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  const loadAssets = useCallback(async () => {
    if (!orgId) {
      setAssets([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let url = `/api/admin/assets?organizationId=${encodeURIComponent(orgId)}`;
      if (assetFilterCompany) url += `&companyId=${encodeURIComponent(assetFilterCompany)}`;
      const res = await adminFetch(url);
      if (!res.ok) setError(await parseError(res, 'Error al cargar activos'));
      else setAssets(await res.json());
    } finally {
      setLoading(false);
    }
  }, [orgId, assetFilterCompany]);

  useEffect(() => {
    void loadOrgs();
  }, [loadOrgs]);

  useEffect(() => {
    void (async () => {
      const [t, s] = await Promise.all([resolveCategoryItems('ASSET_TYPE'), resolveCategoryItems('ASSET_STATUS')]);
      setTypeItems(t);
      setStatusItems(s);
    })();
  }, [resolveCategoryItems]);

  useEffect(() => {
    void loadCompanies(orgId);
  }, [orgId, loadCompanies]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

  const openNewProduct = () => {
    if (!orgId) {
      setError('Seleccione una organización.');
      return;
    }
    setEditingProduct(null);
    setProductForm({
      name: '',
      description: '',
      typeCategoryItemId: '',
      sku: '',
      manufacturer: '',
      model: '',
      status: 'Active'
    });
    setFiles([]);
    setProductModal(true);
  };

  const openEditProduct = async (p: AssetProduct) => {
    setEditingProduct(p);
    setProductForm({
      name: p.name,
      description: p.description || '',
      typeCategoryItemId: p.typeCategoryItemId || '',
      sku: p.sku || '',
      manufacturer: p.manufacturer || '',
      model: p.model || '',
      status: p.status || 'Active'
    });
    setProductModal(true);
    const fr = await adminFetch(`/api/admin/asset-products/${p.id}/files`);
    setFiles(fr.ok ? await fr.json() : []);
  };

  const saveProduct = async () => {
    if (!orgId) return;
    const body = {
      organizationId: orgId,
      name: productForm.name.trim(),
      description: productForm.description.trim() || null,
      typeCategoryItemId: productForm.typeCategoryItemId || null,
      sku: productForm.sku.trim() || null,
      manufacturer: productForm.manufacturer.trim() || null,
      model: productForm.model.trim() || null,
      status: productForm.status
    };
    if (!body.name) {
      setError('El nombre del producto es obligatorio.');
      return;
    }
    const url = editingProduct ? `/api/admin/asset-products/${editingProduct.id}` : '/api/admin/asset-products';
    const method = editingProduct ? 'PUT' : 'POST';
    const res = await adminFetch(url, { method, body: JSON.stringify(body) });
    if (!res.ok) {
      setError(await parseError(res, 'Error al guardar producto'));
      return;
    }
    const saved = await res.json();
    await loadProducts();
    if (!editingProduct && saved && typeof saved === 'object' && 'id' in (saved as object)) {
      await openEditProduct(saved as AssetProduct);
    }
  };

  const deleteProduct = async (p: AssetProduct) => {
    if (!window.confirm(`Eliminar producto "${p.name}"?`)) return;
    const res = await adminFetch(`/api/admin/asset-products/${p.id}`, { method: 'DELETE' });
    if (!res.ok) setError(await parseError(res, 'No se pudo eliminar'));
    else await loadProducts();
  };

  const uploadProductFile = async (productId: string, file: File) => {
    setFileUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', 'manual');
      const res = await adminFetch(`/api/admin/asset-products/${productId}/files`, { method: 'POST', body: fd });
      if (!res.ok) setError(await parseError(res, 'Error al subir archivo'));
      else {
        const fr = await adminFetch(`/api/admin/asset-products/${productId}/files`);
        setFiles(fr.ok ? await fr.json() : []);
      }
    } finally {
      setFileUploading(false);
    }
  };

  const deleteProductFile = async (productId: string, fileId: string) => {
    const res = await adminFetch(`/api/admin/asset-product-files/${fileId}`, { method: 'DELETE' });
    if (!res.ok) setError(await parseError(res, 'No se pudo eliminar el archivo'));
    else {
      const fr = await adminFetch(`/api/admin/asset-products/${productId}/files`);
      setFiles(fr.ok ? await fr.json() : []);
    }
  };

  const openNewAsset = () => {
    if (!orgId) {
      setError('Seleccione una organización.');
      return;
    }
    if (!companies.length) {
      setError('No hay compañías en esta organización.');
      return;
    }
    if (!products.length) {
      setError('Cree al menos un producto en el catálogo.');
      return;
    }
    setEditingAsset(null);
    setAssetForm({
      productId: products[0]?.id || '',
      companyIds: companies.length === 1 ? [companies[0].id] : [],
      referenceCompanyId: companies[0]?.id || '',
      serialNumber: '',
      assetTag: '',
      notes: '',
      statusCategoryItemId: ''
    });
    setAssetModal(true);
  };

  const openEditAsset = (a: AssetRow) => {
    setEditingAsset(a);
    const cids = Array.isArray(a.companyIds) ? a.companyIds.map(String) : [];
    setAssetForm({
      productId: a.productId,
      companyIds: cids,
      referenceCompanyId: a.referenceCompanyId || cids[0] || '',
      serialNumber: a.serialNumber || '',
      assetTag: a.assetTag || '',
      notes: a.notes || '',
      statusCategoryItemId: a.statusCategoryItemId || ''
    });
    setAssetModal(true);
  };

  const toggleCompany = (cid: string) => {
    setAssetForm((f) => {
      const set = new Set(f.companyIds);
      if (set.has(cid)) set.delete(cid);
      else set.add(cid);
      const companyIds = Array.from(set);
      let referenceCompanyId = f.referenceCompanyId;
      if (!companyIds.includes(referenceCompanyId)) referenceCompanyId = companyIds[0] || '';
      return { ...f, companyIds, referenceCompanyId };
    });
  };

  const saveAsset = async () => {
    if (!orgId) return;
    if (!assetForm.productId) {
      setError('Seleccione un producto.');
      return;
    }
    if (!assetForm.companyIds.length) {
      setError('Seleccione al menos una compañía.');
      return;
    }
    if (!assetForm.referenceCompanyId || !assetForm.companyIds.includes(assetForm.referenceCompanyId)) {
      setError('La compañía para numeración debe estar entre las asignadas.');
      return;
    }
    if (!editingAsset) {
      const res = await adminFetch('/api/admin/assets', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: orgId,
          productId: assetForm.productId,
          companyIds: assetForm.companyIds,
          referenceCompanyId: assetForm.referenceCompanyId,
          serialNumber: assetForm.serialNumber.trim() || null,
          assetTag: assetForm.assetTag.trim() || null,
          notes: assetForm.notes.trim() || null,
          statusCategoryItemId: assetForm.statusCategoryItemId || null
        })
      });
      if (!res.ok) setError(await parseError(res, 'Error al crear activo'));
      else {
        setAssetModal(false);
        await loadAssets();
      }
      return;
    }
    const res = await adminFetch(`/api/admin/assets/${editingAsset.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        productId: assetForm.productId,
        companyIds: assetForm.companyIds,
        serialNumber: assetForm.serialNumber.trim() || null,
        assetTag: assetForm.assetTag.trim() || null,
        notes: assetForm.notes.trim() || null,
        statusCategoryItemId: assetForm.statusCategoryItemId || null
      })
    });
    if (!res.ok) setError(await parseError(res, 'Error al actualizar activo'));
    else {
      setAssetModal(false);
      await loadAssets();
    }
  };

  const deleteAsset = async (a: AssetRow) => {
    if (!window.confirm(`Eliminar activo ${a.code}?`)) return;
    const res = await adminFetch(`/api/admin/assets/${a.id}`, { method: 'DELETE' });
    if (!res.ok) setError(await parseError(res, 'No se pudo eliminar'));
    else await loadAssets();
  };

  const orgName = useMemo(() => orgs.find((o) => o.id === orgId)?.name || '', [orgs, orgId]);

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Activos</h1>
        <p className="text-sm text-muted-foreground">Catálogo de productos e instancias por organización (SaaS Admin).</p>
      </div>

      {error && (
        <div className="flex items-start justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <div className="flex gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <Button variant="ghost" size="sm" className="shrink-0 text-destructive" onClick={() => setError(null)}>
            Cerrar
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-[220px] space-y-1">
          <Label>Organización</Label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
          >
            <option value="">— Seleccionar —</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <Button variant={tab === 'products' ? 'primary' : 'outline'} onClick={() => setTab('products')}>
            Catálogo
          </Button>
          <Button variant={tab === 'assets' ? 'primary' : 'outline'} onClick={() => setTab('assets')}>
            Instancias
          </Button>
        </div>
      </div>

      {tab === 'products' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button onClick={openNewProduct} disabled={!orgId}>
              Nuevo producto
            </Button>
          </div>
          <div className="overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-2 text-left">Nombre</th>
                  <th className="p-2 text-left">Tipo</th>
                  <th className="p-2 text-left">SKU</th>
                  <th className="p-2 text-left">Estado</th>
                  <th className="p-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="p-2">{p.name}</td>
                    <td className="p-2">{p.typeCategoryItemName || '—'}</td>
                    <td className="p-2">{p.sku || '—'}</td>
                    <td className="p-2">{p.status}</td>
                    <td className="p-2 text-right space-x-2">
                      <Button size="sm" variant="outline" onClick={() => void openEditProduct(p)}>
                        Editar
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => void deleteProduct(p)}>
                        Eliminar
                      </Button>
                    </td>
                  </tr>
                ))}
                {!products.length && (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-muted-foreground">
                      {orgId ? (loading ? 'Cargando…' : 'Sin productos.') : 'Seleccione una organización.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'assets' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-[200px] space-y-1">
              <Label>Filtrar por compañía</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={assetFilterCompany}
                onChange={(e) => setAssetFilterCompany(e.target.value)}
              >
                <option value="">Todas</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <Button onClick={openNewAsset} disabled={!orgId}>
              Nuevo activo
            </Button>
          </div>
          <div className="overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-2 text-left">Código</th>
                  <th className="p-2 text-left">Producto</th>
                  <th className="p-2 text-left">Estado</th>
                  <th className="p-2 text-left">Serial</th>
                  <th className="p-2 text-left">Compañías</th>
                  <th className="p-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((a) => (
                  <tr key={a.id} className="border-t">
                    <td className="p-2 font-mono">{a.code}</td>
                    <td className="p-2">{a.productName}</td>
                    <td className="p-2">{a.statusCategoryItemName || '—'}</td>
                    <td className="p-2">{a.serialNumber || '—'}</td>
                    <td className="p-2">
                      {Array.isArray(a.companyNames) && a.companyNames.length ? a.companyNames.join(', ') : '—'}
                    </td>
                    <td className="p-2 text-right space-x-2">
                      <Button size="sm" variant="outline" onClick={() => openEditAsset(a)}>
                        Editar
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => void deleteAsset(a)}>
                        Eliminar
                      </Button>
                    </td>
                  </tr>
                ))}
                {!assets.length && (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-muted-foreground">
                      {orgId ? (loading ? 'Cargando…' : 'Sin activos.') : 'Seleccione una organización.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={productModal} onOpenChange={setProductModal}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingProduct ? 'Editar producto' : 'Nuevo producto'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Organización</Label>
              <Input value={orgName} readOnly disabled />
            </div>
            <div className="space-y-1">
              <Label>Nombre</Label>
              <Input value={productForm.name} onChange={(e) => setProductForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Descripción</Label>
              <Input
                value={productForm.description}
                onChange={(e) => setProductForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Tipo</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={productForm.typeCategoryItemId}
                onChange={(e) => setProductForm((f) => ({ ...f, typeCategoryItemId: e.target.value }))}
              >
                <option value="">—</option>
                {typeItems.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>SKU</Label>
                <Input value={productForm.sku} onChange={(e) => setProductForm((f) => ({ ...f, sku: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Estado</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={productForm.status}
                  onChange={(e) => setProductForm((f) => ({ ...f, status: e.target.value }))}
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Fabricante</Label>
              <Input
                value={productForm.manufacturer}
                onChange={(e) => setProductForm((f) => ({ ...f, manufacturer: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Modelo</Label>
              <Input value={productForm.model} onChange={(e) => setProductForm((f) => ({ ...f, model: e.target.value }))} />
            </div>

            {editingProduct && (
              <div className="space-y-2 border-t pt-3">
                <Label>Manuales / archivos</Label>
                <ul className="max-h-32 space-y-1 overflow-auto text-sm">
                  {files.map((f) => (
                    <li key={f.id} className="flex items-center justify-between gap-2">
                      <a className="truncate text-primary underline" href={f.fileUrl} target="_blank" rel="noreferrer">
                        {f.originalName}
                      </a>
                      <Button type="button" size="sm" variant="ghost" onClick={() => void deleteProductFile(editingProduct.id, f.id)}>
                        Quitar
                      </Button>
                    </li>
                  ))}
                  {!files.length && <li className="text-muted-foreground">Sin archivos</li>}
                </ul>
                <Input
                  type="file"
                  disabled={fileUploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file && editingProduct) void uploadProductFile(editingProduct.id, file);
                  }}
                />
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="button" onClick={() => void saveProduct()}>
              {editingProduct ? 'Guardar' : 'Crear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={assetModal} onOpenChange={setAssetModal}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingAsset ? `Editar ${editingAsset.code}` : 'Nuevo activo'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {!editingAsset && (
              <p className="text-xs text-muted-foreground">
                El código (AST-…) se genera al guardar usando la compañía de numeración seleccionada.
              </p>
            )}
            <div className="space-y-1">
              <Label>Producto</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={assetForm.productId}
                onChange={(e) => setAssetForm((f) => ({ ...f, productId: e.target.value }))}
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Compañías asignadas</Label>
              <div className="max-h-36 space-y-1 overflow-auto rounded border p-2">
                {companies.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={assetForm.companyIds.includes(c.id)} onChange={() => toggleCompany(c.id)} />
                    {c.name}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label>Compañía para numeración</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={assetForm.referenceCompanyId}
                onChange={(e) => setAssetForm((f) => ({ ...f, referenceCompanyId: e.target.value }))}
              >
                {companies
                  .filter((c) => assetForm.companyIds.includes(c.id))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Estado del activo</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={assetForm.statusCategoryItemId}
                onChange={(e) => setAssetForm((f) => ({ ...f, statusCategoryItemId: e.target.value }))}
              >
                <option value="">—</option>
                {statusItems.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Nº de serie</Label>
              <Input
                value={assetForm.serialNumber}
                onChange={(e) => setAssetForm((f) => ({ ...f, serialNumber: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Etiqueta interna</Label>
              <Input value={assetForm.assetTag} onChange={(e) => setAssetForm((f) => ({ ...f, assetTag: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Notas</Label>
              <Input value={assetForm.notes} onChange={(e) => setAssetForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="button" onClick={() => void saveAsset()}>
              {editingAsset ? 'Guardar' : 'Crear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AssetsAdminPage;
