import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AppUser, ViewType } from '@sinapsis/shared-types';
import FileManager from '@webapp/components/FileManager';

type ClientView = 'all' | 'leads' | 'active' | 'inactive' | 'details';

interface ClientModuleProps {
  view: ClientView;
  setView: (view: ViewType) => void;
  currentUser?: AppUser;
  companyId?: string;
  onSubTitleChange?: (subtitle: string) => void;
}

interface MetaItem {
  id: string;
  name: string;
}

interface CompanyItem {
  id: string;
  name: string;
}

interface ClientItem {
  id: string;
  code: string;
  name: string;
  email?: string;
  phone?: string;
  taxId?: string;
  type: string;
  status: string;
  address?: string;
  city?: string;
  state?: string;
  zipcode?: string;
  country?: string;
  notes?: string;
  createdByName?: string;
  updatedByName?: string;
  companyIds?: string[];
  companyNames?: string[];
  logoUrl?: string;
}

interface MetaResponse {
  categories: {
    types: MetaItem[];
    statuses: MetaItem[];
    socialNetworks: MetaItem[];
  };
}

interface SocialLinkItem {
  id: string;
  categoryItemId: string;
  categoryItemName: string;
  url: string;
  sortOrder: number;
  status: string;
}

interface NoteItem {
  id: string;
  sourceModule: string;
  sourceId: string;
  note: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

const SELECTED_CLIENT_KEY = 'sinapsis.clients.selected';
const DEFAULT_TYPES = ['Customer', 'Supplier', 'Partner', 'Prospect'];
const DEFAULT_STATUSES = ['Lead', 'Active', 'Inactive'];

const sanitizeNoteHtml = (raw: string) => {
  if (!raw) return '';
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') return raw;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(raw, 'text/html');
    const root = doc.body || doc.documentElement;
    if (!root) return raw;

    const allowed = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'UL', 'OL', 'LI', 'A', 'BLOCKQUOTE']);

    const walk = (node: Node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        if (!allowed.has(el.tagName)) {
          const text = doc.createTextNode(el.textContent || '');
          el.replaceWith(text);
          return;
        }

        Array.from(el.attributes).forEach((attr) => {
          const n = attr.name.toLowerCase();
          if (el.tagName === 'A' && n === 'href') return;
          if (n === 'target' || n === 'rel') return;
          el.removeAttribute(attr.name);
        });

        if (el.tagName === 'A') {
          const href = String(el.getAttribute('href') || '').trim();
          if (!/^https?:\/\//i.test(href)) {
            el.removeAttribute('href');
          } else {
            el.setAttribute('target', '_blank');
            el.setAttribute('rel', 'noreferrer');
          }
        }
      }

      Array.from(node.childNodes).forEach(walk);
    };

    walk(root);
    return (doc.body?.innerHTML || root.innerHTML || '').trim();
  } catch {
    return raw;
  }
};

const stripHtml = (raw: string) => String(raw || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').trim();

const FORCED_STATUS_BY_VIEW: Record<Exclude<ClientView, 'details'>, string | null> = {
  all: null,
  leads: 'Lead',
  active: 'Active',
  inactive: 'Inactive'
};

const ClientModule: React.FC<ClientModuleProps> = ({ view, setView, currentUser, companyId, onSubTitleChange }) => {
  const { t } = useTranslation();
  const forcedStatus = view === 'details' ? null : FORCED_STATUS_BY_VIEW[view];

  const [clients, setClients] = useState<ClientItem[]>([]);
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [meta, setMeta] = useState<{ types: MetaItem[]; statuses: MetaItem[]; socialNetworks: MetaItem[] }>({ types: [], statuses: [], socialNetworks: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedClient, setSelectedClient] = useState<ClientItem | null>(null);
  const [activeTab, setActiveTab] = useState<'Overview' | 'Notes' | 'SocialNetworks' | 'Files'>('Overview');
  const [socialLinks, setSocialLinks] = useState<SocialLinkItem[]>([]);
  const [socialForm, setSocialForm] = useState({ categoryItemId: '', url: '' });
  const [editingSocialLinkId, setEditingSocialLinkId] = useState<string | null>(null);
  const [socialLoading, setSocialLoading] = useState(false);
  const [socialModalOpen, setSocialModalOpen] = useState(false);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const noteEditorRef = useRef<HTMLDivElement>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientItem | null>(null);
  const isCreateMode = !editingClient;
  const lockToCurrentCompany = Boolean(companyId && isCreateMode);

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    taxId: '',
    type: 'Customer',
    status: forcedStatus || 'Lead',
    address: '',
    city: '',
    state: '',
    zipcode: '',
    country: '',
    notes: '',
    companyIds: [] as string[]
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleLogoClick = () => {
    if (fileInputRef.current) {
        fileInputRef.current.click();
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedClient) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('logo', file);

    try {
        const response = await fetch(`/api/clients/${selectedClient.id}/logo`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({}));
            throw new Error(errorBody?.error || t('clients.errorUploadLogo') || 'Failed to upload logo');
        }

        const updatedClientResponse = await response.json();
        
        setSelectedClient(updatedClientResponse.client);
        setClients(prev => prev.map(c => c.id === selectedClient.id ? updatedClientResponse.client : c));

    } catch (error: any) {
        console.error('Error uploading logo:', error);
        setError(error.message || t('clients.errorUploadLogo') || 'Error uploading logo');
    } finally {
        setIsUploading(false);
    }
  };



  const typeOptions = useMemo(() => {
    const fromMeta = meta.types.map((x) => x.name);
    return fromMeta.length > 0 ? fromMeta : DEFAULT_TYPES;
  }, [meta.types]);

  const statusOptions = useMemo(() => {
    const fromMeta = meta.statuses.map((x) => x.name);
    return fromMeta.length > 0 ? fromMeta : DEFAULT_STATUSES;
  }, [meta.statuses]);

  const socialNetworkOptions = useMemo(() => {
    return meta.socialNetworks || [];
  }, [meta.socialNetworks]);

  const viewTitle: Record<ClientView, string> = {
    all: t('clients.allClients'),
    leads: t('clients.leads'),
    active: t('clients.active'),
    inactive: t('clients.inactive'),
    details: t('clients.details')
  };

  const currentCompanyName = useMemo(() => {
    if (!companyId) return '';
    return companies.find((c) => c.id === companyId)?.name || companyId;
  }, [companyId, companies]);

  const resolveCompanyList = (client: ClientItem): string[] => {
    const fromApi = (client.companyNames || []).filter(Boolean);
    if (fromApi.length > 0) return fromApi;

    return (client.companyIds || [])
      .map((id) => companies.find((c) => c.id === id)?.name || id)
      .filter(Boolean);
  };

  const resolveCompanyNames = (client: ClientItem) => {
    const names = resolveCompanyList(client);
    return names.length > 0 ? names.join(', ') : '-';
  };

  const renderCompanyLabels = (client: ClientItem) => {
    const names = resolveCompanyList(client);

    if (names.length === 0) {
      return <span className="text-xs text-slate-400">-</span>;
    }

    return (
      <div className="flex flex-wrap gap-1.5">
        {names.map((name) => (
          <span
            key={`${client.id}-${name}`}
            className="inline-flex items-center rounded-full bg-slate-100 text-slate-700 px-2.5 py-0.5 text-[11px] font-semibold"
          >
            {name}
          </span>
        ))}
      </div>
    );
  };

  const loadCompanies = async () => {
    try {
      const res = await fetch('/api/companies?status=Active');
      if (!res.ok) return;
      const data: CompanyItem[] = await res.json();
      setCompanies(Array.isArray(data) ? data : []);
    } catch {
      setCompanies([]);
    }
  };

  const loadMeta = async () => {
    try {
      const params = new URLSearchParams();
      if (companyId) params.set('companyId', companyId);
      if (currentUser?.id) params.set('userId', currentUser.id);
      const res = await fetch(params.toString() ? `/api/clients/meta?${params.toString()}` : '/api/clients/meta');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || t('clients.errorLoadMeta'));
      }
      const data: MetaResponse = await res.json();
      setMeta(data.categories || { types: [], statuses: [], socialNetworks: [] });
    } catch (e: any) {
      setError(e.message || t('clients.errorLoadMeta'));
    }
  };

  const loadClients = async () => {
    try {
      setLoading(true);
      setError('');

      const params = new URLSearchParams();
      if (companyId) params.set('companyId', companyId);
      if (forcedStatus) {
        params.set('status', forcedStatus);
      } else if (statusFilter) {
        params.set('status', statusFilter);
      }
      if (typeFilter) params.set('type', typeFilter);
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`/api/clients?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || t('clients.errorLoadClients'));
      }

      const data: ClientItem[] = await res.json();
      setClients(data || []);

      if (view === 'details') {
        const selectedId = localStorage.getItem(SELECTED_CLIENT_KEY);
        if (!selectedId) {
          setSelectedClient(null);
        } else {
          const detailRes = await fetch(`/api/clients/${selectedId}`);
          if (detailRes.ok) {
            setSelectedClient(await detailRes.json());
          } else {
            setSelectedClient(null);
          }
        }
      }
    } catch (e: any) {
      setError(e.message || t('clients.errorLoadClients'));
    } finally {
      setLoading(false);
    }
  };

  const loadSocialLinks = async (clientId: string) => {
    try {
      setSocialLoading(true);
      const res = await fetch(`/api/clients/social-links/${clientId}`);
      const isJson = (res.headers.get('content-type') || '').includes('application/json');

      if (!isJson) {
        const raw = await res.text().catch(() => '');
        if (raw.trim().startsWith('<')) throw new Error(t('clients.errorSocialApiHtml'));
        throw new Error(raw || t('clients.errorLoadSocialLinks'));
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({} as any));
        throw new Error(body?.error || t('clients.errorLoadSocialLinks'));
      }
      const data: SocialLinkItem[] = await res.json();
      setSocialLinks(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e.message || t('clients.errorLoadSocialLinks'));
      setSocialLinks([]);
    } finally {
      setSocialLoading(false);
    }
  };

  const loadNotes = async (clientId: string) => {
    try {
      setNotesLoading(true);
      const params = new URLSearchParams({ sourceModule: 'CLIENTS', sourceId: clientId });
      let res = await fetch(`/api/clients/notes?${params.toString()}`);
      if (res.status === 404) {
        res = await fetch(`/api/clients/${clientId}/notes`);
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as any));
        throw new Error(body?.error || t('clients.errorLoadNotes'));
      }
      const data: NoteItem[] = await res.json();
      setNotes(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e.message || t('clients.errorLoadNotes'));
      setNotes([]);
    } finally {
      setNotesLoading(false);
    }
  };

  useEffect(() => {
    loadMeta();
    loadCompanies();
  }, [companyId, currentUser?.id]);

  useEffect(() => {
    loadClients();
  }, [companyId, view, forcedStatus, statusFilter, typeFilter, search]);

  useEffect(() => {
    if (view !== 'details' || !selectedClient?.id) {
      setSocialLinks([]);
      setSocialForm({ categoryItemId: '', url: '' });
      setEditingSocialLinkId(null);
      setNotes([]);
      setEditingNoteId(null);
      setNoteText('');
      return;
    }

    loadSocialLinks(selectedClient.id);
    loadNotes(selectedClient.id);
  }, [view, selectedClient?.id]);

  useEffect(() => {
    if (!onSubTitleChange) return;
    if (view === 'details' && selectedClient) {
      onSubTitleChange(selectedClient.name);
      return;
    }
    onSubTitleChange('');
  }, [view, selectedClient, onSubTitleChange]);

  const openCreate = () => {
    setEditingClient(null);
    setForm({
      name: '',
      email: '',
      phone: '',
      taxId: '',
      type: typeOptions[0] || 'Customer',
      status: forcedStatus || statusOptions[0] || 'Lead',
      address: '',
      city: '',
      state: '',
      zipcode: '',
      country: '',
      notes: '',
      companyIds: companyId ? [companyId] : []
    });
    setFormOpen(true);
  };

  const openEdit = (client: ClientItem) => {
    const idsFromClient = Array.isArray(client.companyIds) && client.companyIds.length > 0
      ? client.companyIds
      : (companyId ? [companyId] : []);

    setEditingClient(client);
    setForm({
      name: client.name || '',
      email: client.email || '',
      phone: client.phone || '',
      taxId: client.taxId || '',
      type: client.type || (typeOptions[0] || 'Customer'),
      status: client.status || (statusOptions[0] || 'Lead'),
      address: client.address || '',
      city: client.city || '',
      state: client.state || '',
      zipcode: client.zipcode || '',
      country: client.country || '',
      notes: client.notes || '',
      companyIds: idsFromClient
    });
    setFormOpen(true);
  };

  const submitClient = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentUser?.id) return setError(t('clients.errorAuthRequired'));

    const selectedCompanyIds = lockToCurrentCompany ? [String(companyId)] : form.companyIds;
    if (selectedCompanyIds.length === 0) return setError(t('clients.errorSelectCompanies'));
    if (!form.name.trim()) return;

    const payload = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      taxId: form.taxId.trim() || null,
      type: form.type,
      status: forcedStatus || form.status,
      address: form.address.trim() || null,
      city: form.city.trim() || null,
      state: form.state.trim() || null,
      zipcode: form.zipcode.trim() || null,
      country: form.country.trim() || null,
      notes: form.notes.trim() || null,
      companyId: selectedCompanyIds[0],
      companyIds: selectedCompanyIds,
      createdById: currentUser.id,
      updatedById: currentUser.id
    };

    try {
      const url = editingClient ? `/api/clients/${editingClient.id}` : '/api/clients';
      const method = editingClient ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || t('clients.errorSaveClient'));
      }

      const saved: ClientItem = await res.json();
      setFormOpen(false);
      setEditingClient(null);
      await loadClients();

      if (view === 'details') {
        localStorage.setItem(SELECTED_CLIENT_KEY, saved.id);
        setSelectedClient(saved);
      }
    } catch (e: any) {
      setError(e.message || t('clients.errorSaveClient'));
    }
  };

  const removeClient = async (id: string) => {
    if (!currentUser?.id) return setError(t('clients.errorAuthRequired'));
    if (!confirm(t('clients.deactivateConfirm'))) return;

    try {
      const res = await fetch(`/api/clients/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Inactive', updatedById: currentUser.id })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || t('clients.errorDeactivateClient'));
      }

      if (selectedClient?.id === id) {
        localStorage.removeItem(SELECTED_CLIENT_KEY);
        setSelectedClient(null);
        setView('Clients');
      }

      await loadClients();
    } catch (e: any) {
      setError(e.message || t('clients.errorDeactivateClient'));
    }
  };

  const updateStatus = async (client: ClientItem, status: string) => {
    if (!currentUser?.id) return setError(t('clients.errorAuthRequired'));

    try {
      const res = await fetch(`/api/clients/${client.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, updatedById: currentUser.id })
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || t('clients.errorUpdateStatus'));
      }

      const updated: ClientItem = await res.json();
      if (selectedClient?.id === updated.id) setSelectedClient(updated);
      await loadClients();
    } catch (e: any) {
      setError(e.message || t('clients.errorUpdateStatus'));
    }
  };

  const showDetails = async (id: string) => {
    try {
      localStorage.setItem(SELECTED_CLIENT_KEY, id);
      const res = await fetch(`/api/clients/${id}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || t('clients.errorLoadDetails'));
      }
      setSelectedClient(await res.json());
      setActiveTab('Overview');
      setView('ClientDetails');
    } catch (e: any) {
      setError(e.message || t('clients.errorLoadDetails'));
    }
  };

  const resetSocialForm = () => {
    setSocialForm({ categoryItemId: '', url: '' });
    setEditingSocialLinkId(null);
    setSocialModalOpen(false);
  };

  const openCreateSocialModal = () => {
    setEditingSocialLinkId(null);
    setSocialForm({
      categoryItemId: socialNetworkOptions[0]?.id || '',
      url: ''
    });
    setSocialModalOpen(true);
  };

  const submitSocialLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient?.id) return;
    if (!currentUser?.id) return setError(t('clients.errorAuthRequired'));
    if (!socialForm.categoryItemId || !socialForm.url.trim()) return;

    try {
      const isEdit = Boolean(editingSocialLinkId);
      const url = isEdit
        ? `/api/clients/social-links/${selectedClient.id}/${editingSocialLinkId}`
        : `/api/clients/social-links/${selectedClient.id}`;
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryItemId: socialForm.categoryItemId,
          url: socialForm.url.trim(),
          sortOrder: 0,
          createdById: currentUser.id,
          updatedById: currentUser.id
        })
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || t('clients.errorSaveSocialLink'));
      }

      await loadSocialLinks(selectedClient.id);
      resetSocialForm();
    } catch (e: any) {
      setError(e.message || t('clients.errorSaveSocialLink'));
    }
  };

  const editSocialLink = (socialLink: SocialLinkItem) => {
    setEditingSocialLinkId(socialLink.id);
    setSocialForm({
      categoryItemId: socialLink.categoryItemId,
      url: socialLink.url || ''
    });
    setSocialModalOpen(true);
  };

  const removeSocialLink = async (socialLinkId: string) => {
    if (!selectedClient?.id) return;
    if (!currentUser?.id) return setError(t('clients.errorAuthRequired'));
    if (!confirm(t('clients.deleteSocialLinkConfirm'))) return;

    try {
      const res = await fetch(`/api/clients/social-links/${selectedClient.id}/${socialLinkId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updatedById: currentUser.id })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || t('clients.errorDeleteSocialLink'));
      }

      await loadSocialLinks(selectedClient.id);
      if (editingSocialLinkId === socialLinkId) resetSocialForm();
    } catch (e: any) {
      setError(e.message || t('clients.errorDeleteSocialLink'));
    }
  };

  const resetNoteForm = () => {
    setEditingNoteId(null);
    setNoteText('');
    setNoteModalOpen(false);
  };

  const openCreateNoteModal = () => {
    setEditingNoteId(null);
    setNoteText('');
    setNoteModalOpen(true);
  };

  const openEditNoteModal = (note: NoteItem) => {
    setEditingNoteId(note.id);
    setNoteText(note.note || '');
    setNoteModalOpen(true);
  };

  useEffect(() => {
    if (!noteModalOpen) return;
    if (!noteEditorRef.current) return;
    noteEditorRef.current.innerHTML = noteText || '';
  }, [noteModalOpen, editingNoteId]);

  const runEditorCommand = (command: string) => {
    if (!noteModalOpen) return;
    if (!noteEditorRef.current) return;
    noteEditorRef.current.focus();
    document.execCommand(command, false);
    setNoteText(noteEditorRef.current.innerHTML || '');
  };

  const insertEditorLink = () => {
    if (!noteModalOpen) return;
    if (!noteEditorRef.current) return;
    const url = prompt('URL (https://...)');
    if (!url) return;
    noteEditorRef.current.focus();
    document.execCommand('createLink', false, url.trim());
    setNoteText(noteEditorRef.current.innerHTML || '');
  };

  const submitNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient?.id) return;
    if (!currentUser?.id) return setError(t('clients.errorAuthRequired'));
    const cleanHtml = sanitizeNoteHtml(noteText);
    if (!stripHtml(cleanHtml)) return;

    try {
      const isEdit = Boolean(editingNoteId);
      let url = isEdit ? `/api/clients/notes/${editingNoteId}` : '/api/clients/notes';
      const method = isEdit ? 'PUT' : 'POST';

      const payload = isEdit
        ? { note: cleanHtml, updatedById: currentUser.id }
        : {
            sourceModule: 'CLIENTS',
            sourceId: selectedClient.id,
            note: cleanHtml,
            createdById: currentUser.id,
            updatedById: currentUser.id
          };

      let res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.status === 404) {
        url = isEdit
          ? `/api/clients/${selectedClient.id}/notes/${editingNoteId}`
          : `/api/clients/${selectedClient.id}/notes`;
        res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || t('clients.errorSaveNote'));
      }

      await loadNotes(selectedClient.id);
      resetNoteForm();
    } catch (e: any) {
      setError(e.message || t('clients.errorSaveNote'));
    }
  };

  const removeNote = async (noteId: string) => {
    if (!selectedClient?.id) return;
    if (!currentUser?.id) return setError(t('clients.errorAuthRequired'));
    if (!confirm(t('clients.deleteNoteConfirm'))) return;

    try {
      let res = await fetch(`/api/clients/notes/${noteId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updatedById: currentUser.id })
      });
      if (res.status === 404) {
        res = await fetch(`/api/clients/${selectedClient.id}/notes/${noteId}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ updatedById: currentUser.id })
        });
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || t('clients.errorDeleteNote'));
      }

      await loadNotes(selectedClient.id);
      if (editingNoteId === noteId) resetNoteForm();
    } catch (e: any) {
      setError(e.message || t('clients.errorDeleteNote'));
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
      {view !== 'details' && (
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 px-1">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{viewTitle[view]}</h1>
            <p className="text-sm text-slate-500 mt-1 font-medium">{t('clients.description')}</p>
          </div>
          <button
            onClick={openCreate}
            className="w-full sm:w-auto px-6 py-3 bg-red-500 hover:bg-red-600 active:scale-[0.98] transition-all text-white rounded-xl text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2"
          >
            <i className="fa-solid fa-plus"></i>
            {t('clients.newClient')}
          </button>
        </div>
      )}

      {view !== 'details' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 flex flex-col sm:flex-row items-center gap-3">
            <div className="relative w-full sm:flex-1">
              <i className="fa-solid fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('clients.searchPlaceholder')}
                className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-medium transition-all focus:ring-4 focus:ring-red-500/5 focus:border-red-500/40 outline-none placeholder:text-slate-400"
              />
            </div>

            <div className="relative w-full sm:w-52">
              <i className="fa-solid fa-tags absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full pl-11 pr-10 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 appearance-none transition-all focus:ring-4 focus:ring-red-500/5 focus:border-red-500/40 outline-none cursor-pointer"
              >
                <option value="">{t('clients.allTypes')}</option>
                {typeOptions.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
              <i className="fa-solid fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] pointer-events-none"></i>
            </div>

            {!forcedStatus && (
              <div className="relative w-full sm:w-52">
                <i className="fa-solid fa-filter absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full pl-11 pr-10 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 appearance-none transition-all focus:ring-4 focus:ring-red-500/5 focus:border-red-500/40 outline-none cursor-pointer"
                >
                  <option value="">{t('clients.allStatuses')}</option>
                  {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
                <i className="fa-solid fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] pointer-events-none"></i>
              </div>
            )}
          </div>
        </div>
      )}

      {error && <div className="bg-rose-50 border border-rose-200 text-rose-600 px-4 py-3 rounded-xl text-sm font-medium">{error}</div>}
      {loading && <div className="text-sm text-slate-500">{t('clients.loading')}</div>}

      {!loading && view !== 'details' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-left min-w-[1060px]">
            <thead className="bg-table-header border-b border-foreground/10">
              <tr>
                {[t('clients.client'), t('clients.phone'), t('clients.email'), t('clients.companies'), t('clients.type'), t('clients.status'), t('clients.actions')].map((h) => (
                  <th key={h} className="px-4 py-3 text-[10px] uppercase tracking-widest text-table-header-foreground font-bold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {clients.length === 0 && <tr><td colSpan={7} className="px-5 py-12 text-center text-sm text-slate-400">{t('clients.noClients')}</td></tr>}
              {clients.map((client) => (
                <tr key={client.id} className="hover:bg-slate-50/70 cursor-pointer" onClick={() => showDetails(client.id)}>
                  <td className="px-4 py-4">
                    <p className="text-sm font-bold text-slate-900">{client.name} <span className="text-[10px] text-red-500 ml-1">{client.code}</span></p>
                    <p className="text-xs text-slate-400">{client.city || '-'} {client.country ? `- ${client.country}` : ''}</p>
                  </td>
                  <td className="px-4 py-4 text-xs text-slate-600">{client.phone || '-'}</td>
                  <td className="px-4 py-4 text-xs text-slate-600">{client.email || '-'}</td>
                  <td className="px-4 py-4 text-xs text-slate-600">{renderCompanyLabels(client)}</td>
                  <td className="px-4 py-4 text-xs font-semibold text-slate-600">{client.type}</td>
                  <td className="px-4 py-4 text-xs" onClick={(e) => e.stopPropagation()}>
                    <select value={client.status} onChange={(e) => updateStatus(client, e.target.value)} className="px-2 py-1 border border-slate-200 rounded-md text-[11px] font-semibold text-slate-600">
                      {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-2">
                      <button onClick={() => showDetails(client.id)} className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 hover:bg-indigo-500 hover:text-white"><i className="fa-solid fa-eye text-xs"></i></button>
                      <button onClick={() => openEdit(client)} className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 hover:bg-red-500 hover:text-white"><i className="fa-solid fa-pen text-xs"></i></button>
                      <button onClick={() => removeClient(client.id)} className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 hover:bg-rose-500 hover:text-white"><i className="fa-solid fa-trash text-xs"></i></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

            {!loading && view === 'details' && selectedClient && (
        <div className="space-y-6 animate-in fade-in duration-500">
          <div className="bg-white rounded-2xl border border-slate-200 px-8 pt-8 pb-4 shadow-sm">
            <div className="flex flex-col lg:flex-row gap-8 items-start">
              <div className="relative group cursor-pointer" onClick={handleLogoClick}>
                <div className={`w-32 h-32 rounded-2xl shadow-lg border-4 border-white ${selectedClient.logoUrl ? 'bg-white' : 'bg-red-50 text-red-500'} flex items-center justify-center text-5xl font-bold overflow-hidden relative`}>
                  {selectedClient.logoUrl ? (
                    <img src={selectedClient.logoUrl} alt={selectedClient.name} className="w-full h-full object-contain p-2" />
                  ) : (
                    selectedClient.name[0]
                  )}
                  {isUploading && (
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                      <i className="fa-solid fa-circle-notch fa-spin text-white text-2xl"></i>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <i className="fa-solid fa-camera text-white text-xl"></i>
                  </div>
                </div>
                <span className={`absolute bottom-2 right-2 w-4 h-4 border-2 border-white rounded-full ${selectedClient.status === 'Active' ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
              </div>

              <div className="flex-1 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
                      {selectedClient.name}
                      {selectedClient.status === 'Active' && <i className="fa-solid fa-circle-check text-red-500 text-xl"></i>}
                    </h2>
                    <div className="flex flex-wrap gap-4 mt-2 text-slate-500 text-sm font-medium">
                      <span className="flex items-center gap-1.5"><i className="fa-solid fa-envelope text-slate-400"></i> {selectedClient.email || '-'}</span>
                      <span className="flex items-center gap-1.5"><i className="fa-solid fa-phone text-slate-400"></i> {selectedClient.phone || '-'}</span>
                      <span className="flex items-center gap-1.5 px-2 py-0.5 bg-red-50 text-red-600 rounded text-[10px] font-mono font-bold uppercase tracking-tight italic">{selectedClient.code}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openEdit(selectedClient)}
                      className="px-5 py-2 bg-slate-50 text-slate-700 font-medium text-sm rounded-lg border border-slate-200 hover:bg-slate-100 transition-all"
                    >
                      {t('clients.edit')}
                    </button>
                    <button
                      onClick={() => removeClient(selectedClient.id)}
                      className="px-5 py-2 rounded-lg bg-rose-500 text-sm font-semibold text-white hover:bg-rose-600 transition-all font-medium"
                    >
                      {t('clients.deactivate')}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                  <div className="border border-dashed border-slate-200 rounded-2xl p-4">
                    <div className={`flex items-center gap-2 ${selectedClient.status === 'Active' ? 'text-emerald-600' : 'text-slate-600'} text-xs font-bold mb-1`}>
                      <i className="fa-solid fa-signal"></i> {selectedClient.status}
                    </div>
                    <p className="text-slate-500 text-sm font-medium italic">{t('clients.status')}</p>
                  </div>
                  <div className="border border-dashed border-slate-200 rounded-2xl p-4">
                    <div className="flex items-center gap-2 text-red-600 text-xs font-bold mb-1">
                      <i className="fa-solid fa-tag"></i> {selectedClient.type}
                    </div>
                    <p className="text-slate-500 text-sm font-medium italic">{t('clients.type')}</p>
                  </div>
                  <div className="border border-dashed border-slate-200 rounded-2xl p-4">
                    <div className="flex items-center gap-2 text-slate-600 text-xs font-bold mb-1">
                      <i className="fa-solid fa-building"></i> {(selectedClient.companyIds || []).length}
                    </div>
                    <p className="text-slate-500 text-sm font-medium italic">{t('clients.companies')}</p>
                  </div>
                </div>
              </div>
            </div>

            <nav className="flex gap-8 mt-10 border-t border-slate-100 pt-3 pb-0 overflow-x-auto no-scrollbar">
              {[
                { id: 'Overview', label: t('dashboard.overview') },
                { id: 'Notes', label: t('clients.notes') },
                { id: 'SocialNetworks', label: t('clients.socialNetworks') },
                { id: 'Files', label: t('clients.files') }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as 'Overview' | 'Notes' | 'SocialNetworks' | 'Files')}
                  className={`py-[3px] text-xs font-bold whitespace-nowrap transition-all border-b-2 tracking-wide uppercase ${activeTab === tab.id ? 'text-red-500 border-red-500' : 'text-slate-400 border-transparent hover:text-slate-600'}`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {activeTab === 'Overview' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-bottom-2">
              <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm space-y-6">
                <h3 className="text-lg font-bold text-red-500 border-b border-slate-100 pb-4">{t('clients.details')}</h3>
                <div className="grid grid-cols-2 gap-y-4 text-sm">
                  <div className="text-slate-400 font-medium">{t('clients.code')}</div>
                  <div className="text-slate-900 font-bold">{selectedClient.code || '-'}</div>

                  <div className="text-slate-400 font-medium">{t('clients.taxId')}</div>
                  <div className="text-slate-900 font-bold">{selectedClient.taxId || '-'}</div>

                  <div className="text-slate-400 font-medium">{t('clients.type')}</div>
                  <div className="text-slate-900 font-bold">{selectedClient.type || '-'}</div>

                  <div className="text-slate-400 font-medium">{t('clients.companies')}</div>
                  <div className="text-slate-900 font-bold">{resolveCompanyNames(selectedClient)}</div>

                  <div className="text-slate-400 font-medium">{t('clients.email')}</div>
                  <div className="text-slate-900 font-bold break-all">{selectedClient.email || '-'}</div>

                  <div className="text-slate-400 font-medium">{t('clients.phone')}</div>
                  <div className="text-slate-900 font-bold">{selectedClient.phone || '-'}</div>

                  <div className="text-slate-400 font-medium">{t('clients.createdBy')}</div>
                  <div className="text-slate-900 font-bold italic">{selectedClient.createdByName || '-'}</div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm space-y-6">
                <h3 className="text-lg font-bold text-red-500 border-b border-slate-100 pb-4">{t('clients.address')}</h3>
                <div className="space-y-4">
                  <div className="flex gap-3">
                    <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center text-slate-400 text-xs">
                      <i className="fa-solid fa-location-dot"></i>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">{selectedClient.address || '-'}</p>
                      <p className="text-xs text-slate-500 font-medium">
                        {[selectedClient.city, selectedClient.state, selectedClient.zipcode, selectedClient.country].filter(Boolean).join(', ') || '-'}
                      </p>
                    </div>
                  </div>
                  {([selectedClient.address, selectedClient.city, selectedClient.state, selectedClient.zipcode, selectedClient.country].filter(Boolean).length > 0) ? (
                    <iframe
                      title="Client location"
                      src={`https://www.google.com/maps?q=${encodeURIComponent(
                        [selectedClient.address, selectedClient.city, selectedClient.state, selectedClient.zipcode, selectedClient.country].filter(Boolean).join(', ')
                      )}&output=embed`}
                      className="w-full h-64 rounded-xl border border-slate-200"
                      loading="lazy"
                      allowFullScreen
                      referrerPolicy="no-referrer-when-downgrade"
                    />
                  ) : (
                    <div className="h-64 rounded-xl border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center text-slate-400 text-sm">
                      {t('clients.noAddressMap')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Notes' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm animate-in slide-in-from-bottom-2 min-h-[300px] space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <h3 className="text-lg font-bold text-red-500">{t('clients.notes')}</h3>
                <button type="button" onClick={openCreateNoteModal} className="px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-sm font-semibold text-white">
                  {t('clients.add')}
                </button>
              </div>

              {notesLoading && <div className="text-sm text-slate-500">{t('clients.loading')}</div>}

              {!notesLoading && (
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-table-header border-b border-foreground/10">
                      <tr>
                        <th className="px-4 py-3 text-[10px] uppercase tracking-widest text-table-header-foreground font-bold">{t('clients.note')}</th>
                        <th className="px-4 py-3 text-[10px] uppercase tracking-widest text-table-header-foreground font-bold">{t('clients.updatedAt')}</th>
                        <th className="px-4 py-3 text-[10px] uppercase tracking-widest text-table-header-foreground font-bold">{t('clients.actions')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {notes.length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-4 py-8 text-center text-sm text-slate-400">{t('clients.noNotes')}</td>
                        </tr>
                      )}

                      {notes.map((note) => (
                        <tr key={note.id}>
                          <td className="px-4 py-3 text-sm text-slate-700">
                            <div
                              className="prose prose-sm max-w-none text-slate-700"
                              dangerouslySetInnerHTML={{ __html: sanitizeNoteHtml(note.note || '') }}
                            />
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600">{new Date(note.updatedAt || note.createdAt).toLocaleString()}</td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              <button type="button" onClick={() => openEditNoteModal(note)} className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 hover:bg-red-500 hover:text-white">
                                <i className="fa-solid fa-pen text-xs"></i>
                              </button>
                              <button type="button" onClick={() => removeNote(note.id)} className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 hover:bg-rose-500 hover:text-white">
                                <i className="fa-solid fa-trash text-xs"></i>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'SocialNetworks' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm animate-in slide-in-from-bottom-2 min-h-[300px] space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <h3 className="text-lg font-bold text-red-500">{t('clients.socialNetworks')}</h3>
                <button type="button" onClick={openCreateSocialModal} className="px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-sm font-semibold text-white">
                  {t('clients.add')}
                </button>
              </div>

              {socialLoading && <div className="text-sm text-slate-500">{t('clients.loading')}</div>}

              {!socialLoading && (
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-table-header border-b border-foreground/10">
                      <tr>
                        <th className="px-4 py-3 text-[10px] uppercase tracking-widest text-table-header-foreground font-bold">{t('clients.network')}</th>
                        <th className="px-4 py-3 text-[10px] uppercase tracking-widest text-table-header-foreground font-bold">{t('clients.url')}</th>
                        <th className="px-4 py-3 text-[10px] uppercase tracking-widest text-table-header-foreground font-bold">{t('clients.actions')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {socialLinks.length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-4 py-8 text-center text-sm text-slate-400">{t('clients.noSocialLinks')}</td>
                        </tr>
                      )}
                      {socialLinks.map((socialLink) => (
                        <tr key={socialLink.id}>
                          <td className="px-4 py-3 text-sm font-semibold text-slate-800">{socialLink.categoryItemName}</td>
                          <td className="px-4 py-3 text-sm text-slate-600">
                            <a href={socialLink.url} target="_blank" rel="noreferrer" className="hover:text-red-500 underline break-all">
                              {socialLink.url}
                            </a>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              <button type="button" onClick={() => editSocialLink(socialLink)} className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 hover:bg-red-500 hover:text-white">
                                <i className="fa-solid fa-pen text-xs"></i>
                              </button>
                              <button type="button" onClick={() => removeSocialLink(socialLink.id)} className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 hover:bg-rose-500 hover:text-white">
                                <i className="fa-solid fa-trash text-xs"></i>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'Files' && selectedClient?.id && (
            <FileManager
              sourceModule="CLIENTS"
              sourceId={selectedClient.id}
              currentUserId={currentUser?.id}
              endpointBase="/api/clients/files"
              title={t('clients.files')}
              emptyMessage={t('clients.noFiles')}
            />
          )}
        </div>
      )}
      {noteModalOpen && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={resetNoteForm}></div>
          <div className="relative bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden">
            <form onSubmit={submitNote}>
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900">{editingNoteId ? t('clients.updateNote') : t('clients.newNote')}</h3>
                <button type="button" onClick={resetNoteForm} className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-500"><i className="fa-solid fa-xmark"></i></button>
              </div>

              <div className="p-6">
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('clients.note')}</label>
                <div className="mt-1 border border-slate-200 rounded-lg overflow-hidden">
                  <div className="flex items-center gap-1 p-2 bg-slate-50 border-b border-slate-200">
                    <button type="button" onClick={() => runEditorCommand('bold')} className="w-8 h-8 rounded hover:bg-slate-200 text-slate-700 font-bold">B</button>
                    <button type="button" onClick={() => runEditorCommand('italic')} className="w-8 h-8 rounded hover:bg-slate-200 text-slate-700 italic">I</button>
                    <button type="button" onClick={() => runEditorCommand('underline')} className="w-8 h-8 rounded hover:bg-slate-200 text-slate-700 underline">U</button>
                    <button type="button" onClick={() => runEditorCommand('insertUnorderedList')} className="w-8 h-8 rounded hover:bg-slate-200 text-slate-700"><i className="fa-solid fa-list-ul text-xs"></i></button>
                    <button type="button" onClick={() => runEditorCommand('insertOrderedList')} className="w-8 h-8 rounded hover:bg-slate-200 text-slate-700"><i className="fa-solid fa-list-ol text-xs"></i></button>
                    <button type="button" onClick={insertEditorLink} className="w-8 h-8 rounded hover:bg-slate-200 text-slate-700"><i className="fa-solid fa-link text-xs"></i></button>
                  </div>
                  <div
                    ref={noteEditorRef}
                    contentEditable
                    className="min-h-[180px] p-3 text-sm outline-none"
                    onInput={(e) => setNoteText((e.target as HTMLDivElement).innerHTML || '')}
                    suppressContentEditableWarning
                  />
                </div>
              </div>

              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
                <button type="button" onClick={resetNoteForm} className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700">{t('clients.cancel')}</button>
                <button type="submit" className="px-5 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-sm font-semibold text-white">
                  {editingNoteId ? t('clients.update') : t('clients.add')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {socialModalOpen && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={resetSocialForm}></div>
          <div className="relative bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden">
            <form onSubmit={submitSocialLink}>
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900">{editingSocialLinkId ? t('clients.updateSocialNetwork') : t('clients.newSocialNetwork')}</h3>
                <button type="button" onClick={resetSocialForm} className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-500"><i className="fa-solid fa-xmark"></i></button>
              </div>

              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('clients.network')}</label>
                  <select
                    value={socialForm.categoryItemId}
                    onChange={(e) => setSocialForm((prev) => ({ ...prev, categoryItemId: e.target.value }))}
                    className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    required
                  >
                    <option value="">{t('clients.selectNetwork')}</option>
                    {socialNetworkOptions.map((network) => (
                      <option key={network.id} value={network.id}>{network.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('clients.url')}</label>
                  <input
                    value={socialForm.url}
                    onChange={(e) => setSocialForm((prev) => ({ ...prev, url: e.target.value }))}
                    placeholder="https://..."
                    className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    required
                  />
                </div>
              </div>

              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
                <button type="button" onClick={resetSocialForm} className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700">{t('clients.cancel')}</button>
                <button type="submit" className="px-5 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-sm font-semibold text-white">
                  {editingSocialLinkId ? t('clients.update') : t('clients.add')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {formOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setFormOpen(false)}></div>
          <div className="relative bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-3xl overflow-hidden">
            <form onSubmit={submitClient}>
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900">{editingClient ? t('clients.editClient') : t('clients.newClient')}</h3>
                <button type="button" onClick={() => setFormOpen(false)} className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-500"><i className="fa-solid fa-xmark"></i></button>
              </div>

              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[70vh] overflow-y-auto">
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('clients.name')}</label>
                  <input required value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('clients.taxId')}</label>
                  <input value={form.taxId} onChange={(e) => setForm((p) => ({ ...p, taxId: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('clients.email')}</label>
                  <input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('clients.phone')}</label>
                  <input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('clients.type')}</label>
                  <select value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
                    {typeOptions.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('clients.status')}</label>
                  <select value={forcedStatus || form.status} disabled={Boolean(forcedStatus)} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
                    {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('clients.address')}</label>
                  <input value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('clients.city')}</label>
                  <input value={form.city} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('clients.state')}</label>
                  <input value={form.state} onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('clients.zipcode')}</label>
                  <input value={form.zipcode} onChange={(e) => setForm((p) => ({ ...p, zipcode: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('clients.country')}</label>
                  <input value={form.country} onChange={(e) => setForm((p) => ({ ...p, country: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                </div>

                <div className="md:col-span-2">
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('clients.notes')}</label>
                  <textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} rows={3} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none" />
                </div>

                <div className="md:col-span-2">
                  {!lockToCurrentCompany && (
                    <>
                      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('clients.companies')}</label>
                      <div className="mt-2 rounded-xl border border-slate-200 bg-white p-2 space-y-1">
                        {companies.map((company) => {
                          const checked = form.companyIds.includes(company.id);
                          return (
                            <button
                              key={company.id}
                              type="button"
                              onClick={() => {
                                setForm((prev) => ({
                                  ...prev,
                                  companyIds: checked
                                    ? prev.companyIds.filter((id) => id !== company.id)
                                    : [...prev.companyIds, company.id]
                                }));
                              }}
                              className={`w-full text-left px-3 py-2 rounded-lg text-sm border transition-all ${checked ? 'bg-red-50 border-red-200 text-red-600 font-semibold' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                            >
                              <i className={`fa-solid ${checked ? 'fa-square-check' : 'fa-square'} mr-2 text-xs`}></i>
                              {company.name}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {lockToCurrentCompany && (
                    <>
                      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('clients.company')}</label>
                      <input value={currentCompanyName} readOnly className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50" />
                    </>
                  )}
                </div>
              </div>

              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
                <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700">{t('clients.cancel')}</button>
                <button type="submit" className="px-5 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-sm font-semibold text-white">{t('clients.saveClient')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientModule;


















