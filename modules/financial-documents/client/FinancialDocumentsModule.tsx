import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { jsPDF } from 'jspdf';
import { AppUser, ViewType } from '@sinapsis/shared-types';

type FinancialView = 'all' | 'invoices' | 'credit-memos' | 'debit-memos' | 'purchase-orders' | 'receipts' | 'delivery-notes' | 'details';

interface FinancialDocumentsModuleProps {
  view: FinancialView;
  setView: (view: ViewType) => void;
  currentUser?: AppUser;
  companyId?: string;
}

interface MetaItem {
  id: string;
  name: string;
}

interface MetaCompany {
  id: string;
  name: string;
  baseCurrency?: string | null;
}

interface MetaClient {
  id: string;
  name: string;
  email?: string | null;
  companyId?: string | null;
  companyIds?: string[];
}

interface FinancialDocumentItem {
  id?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface FinancialDocument {
  id: string;
  code: string;
  type: string;
  title: string;
  status: string;
  issueDate?: string | null;
  dueDate?: string | null;
  currency: string;
  totalAmount: number;
  companyId: string;
  clientId?: string | null;
  partyName: string;
  partyEmail?: string;
  notes?: string;
  itemCount?: number;
  items?: FinancialDocumentItem[];
}

interface MetaResponse {
  categories: {
    types: MetaItem[];
    statuses: MetaItem[];
    currencies: MetaItem[];
  };
  companies: MetaCompany[];
  clients: MetaClient[];
  context: {
    selectedCompanyId?: string | null;
    defaultCurrency?: string | null;
  };
}

const DEFAULT_TYPES = ['Invoice', 'Credit Memo', 'Debit Memo', 'Purchase Order', 'Receipt', 'Delivery Note'];
const DEFAULT_STATUSES = ['Draft', 'Issued', 'Approved', 'Paid', 'Cancelled'];
const DEFAULT_CURRENCIES = ['USD'];
const SELECTED_DOCUMENT_KEY = 'sinapsis.financial-documents.selected';

const FORCED_TYPE_BY_VIEW: Record<Exclude<FinancialView, 'details'>, string | null> = {
  all: null,
  invoices: 'Invoice',
  'credit-memos': 'Credit Memo',
  'debit-memos': 'Debit Memo',
  'purchase-orders': 'Purchase Order',
  receipts: 'Receipt',
  'delivery-notes': 'Delivery Note'
};

const toInputDate = (value?: string | null) => (value ? String(value).slice(0, 10) : '');
const todayInputDate = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const toNum = (value: any) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const FinancialDocumentsModule: React.FC<FinancialDocumentsModuleProps> = ({ view, setView, currentUser, companyId }) => {
  const { t } = useTranslation();
  const isOrganizationScope = !companyId;

  const viewTitle: Record<FinancialView, string> = {
    all: t('financial.allDocuments', { defaultValue: 'All Documents' }),
    invoices: t('financial.invoices', { defaultValue: 'Invoices' }),
    'credit-memos': t('financial.creditMemos', { defaultValue: 'Credit Memos' }),
    'debit-memos': t('financial.debitMemos', { defaultValue: 'Debit Memos' }),
    'purchase-orders': t('financial.purchaseOrders', { defaultValue: 'Purchase Orders' }),
    receipts: t('financial.receipts', { defaultValue: 'Receipts' }),
    'delivery-notes': t('financial.deliveryNotes', { defaultValue: 'Delivery Notes' }),
    details: t('financial.documentDetails', { defaultValue: 'Document Details' })
  };

  const forcedType = view === 'details' ? null : FORCED_TYPE_BY_VIEW[view];

  const [documents, setDocuments] = useState<FinancialDocument[]>([]);
  const [meta, setMeta] = useState<{ types: MetaItem[]; statuses: MetaItem[]; currencies: MetaItem[] }>({ types: [], statuses: [], currencies: [] });
  const [companies, setCompanies] = useState<MetaCompany[]>([]);
  const [clients, setClients] = useState<MetaClient[]>([]);
  const [defaultCurrency, setDefaultCurrency] = useState('USD');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selectedDoc, setSelectedDoc] = useState<FinancialDocument | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<FinancialDocument | null>(null);
  const [savingItems, setSavingItems] = useState(false);
  const [detailItems, setDetailItems] = useState<FinancialDocumentItem[]>([]);

  const [form, setForm] = useState({
    type: forcedType || 'Invoice',
    title: '',
    status: 'Draft',
    issueDate: todayInputDate(),
    dueDate: '',
    currency: 'USD',
    companyId: companyId || '',
    clientId: '',
    notes: ''
  });

  const typeOptions = useMemo(() => (meta.types.length > 0 ? meta.types.map((x) => x.name) : DEFAULT_TYPES), [meta.types]);
  const statusOptions = useMemo(() => (meta.statuses.length > 0 ? meta.statuses.map((x) => x.name) : DEFAULT_STATUSES), [meta.statuses]);
  const currencyOptions = useMemo(() => (meta.currencies.length > 0 ? meta.currencies.map((x) => x.name) : DEFAULT_CURRENCIES), [meta.currencies]);

  const companiesById = useMemo(() => {
    const map = new Map<string, MetaCompany>();
    for (const company of companies) map.set(company.id, company);
    return map;
  }, [companies]);

  const availableClients = useMemo(() => {
    const activeCompanyId = form.companyId || companyId || '';
    if (!activeCompanyId) return [];

    return clients.filter((client) => {
      const allCompanyIds = Array.from(new Set([...(client.companyIds || []), ...(client.companyId ? [client.companyId] : [])]));
      return allCompanyIds.includes(activeCompanyId);
    });
  }, [clients, form.companyId, companyId]);

  const detailTotal = useMemo(() => detailItems.reduce((sum, item) => sum + toNum(item.total), 0), [detailItems]);

  const applyDefaultCurrency = (companyIdValue: string, fallback?: string | null) => {
    const company = companiesById.get(companyIdValue);
    const next = String(company?.baseCurrency || fallback || defaultCurrency || currencyOptions[0] || 'USD');
    setForm((prev) => ({ ...prev, currency: next }));
  };

  const loadMeta = async () => {
    try {
      const params = new URLSearchParams();
      if (companyId) params.set('companyId', companyId);
      if (currentUser?.id) params.set('userId', currentUser.id);

      const res = await fetch(`/api/financial-documents/meta?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || t('financial.errorLoadMeta'));
      }

      const data: MetaResponse = await res.json();
      setMeta(data.categories || { types: [], statuses: [], currencies: [] });
      setCompanies(data.companies || []);
      setClients(data.clients || []);

      const resolvedDefault = String(data.context?.defaultCurrency || data.categories?.currencies?.[0]?.name || 'USD');
      setDefaultCurrency(resolvedDefault);

      setForm((prev) => {
        const forcedCompany = companyId || '';
        const chosenCompany = forcedCompany || prev.companyId || data.context?.selectedCompanyId || data.companies?.[0]?.id || '';
        const chosenCurrency = prev.currency || resolvedDefault;
        return {
          ...prev,
          companyId: chosenCompany,
          currency: chosenCurrency
        };
      });
    } catch (e: any) {
      setError(e.message || t('financial.errorLoadMeta'));
    }
  };

  const loadDocuments = async () => {
    try {
      setLoading(true);
      setError('');
      const params = new URLSearchParams();
      if (companyId) params.set('companyId', companyId);
      if (forcedType) params.set('type', forcedType);
      if (statusFilter) params.set('status', statusFilter);
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`/api/financial-documents?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || t('financial.errorLoadDocs'));
      }

      const data: FinancialDocument[] = await res.json();
      setDocuments(data || []);

      if (view === 'details') {
        const selectedId = localStorage.getItem(SELECTED_DOCUMENT_KEY);
        if (!selectedId) {
          setSelectedDoc(null);
          setDetailItems([]);
        } else {
          const detailRes = await fetch(`/api/financial-documents/${selectedId}`);
          if (detailRes.ok) {
            const detailData: FinancialDocument = await detailRes.json();
            setSelectedDoc(detailData);
            setDetailItems((detailData.items || []).map((item) => ({
              ...item,
              quantity: toNum(item.quantity),
              unitPrice: toNum(item.unitPrice),
              total: toNum(item.total)
            })));
          } else {
            setSelectedDoc(null);
            setDetailItems([]);
          }
        }
      }
    } catch (e: any) {
      setError(e.message || t('financial.errorLoadDocs'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMeta();
  }, [companyId, currentUser?.id]);

  useEffect(() => {
    if (view !== 'details') {
      const nextType = forcedType || typeOptions[0] || 'Invoice';
      setForm((prev) => ({ ...prev, type: nextType }));
    }
  }, [view, forcedType, typeOptions]);

  useEffect(() => {
    loadDocuments();
  }, [companyId, view, forcedType, statusFilter, search]);

  useEffect(() => {
    const activeCompanyId = form.companyId || companyId || '';
    if (!activeCompanyId) return;

    if (availableClients.length === 0) {
      setForm((prev) => ({ ...prev, clientId: '' }));
      return;
    }

    const exists = availableClients.some((client) => client.id === form.clientId);
    if (!exists) {
      setForm((prev) => ({ ...prev, clientId: availableClients[0].id }));
    }
  }, [availableClients, form.clientId, form.companyId, companyId]);

  const openCreate = () => {
    setEditingDoc(null);
    const initialCompany = companyId || form.companyId || companies[0]?.id || '';
    const initialClient = clients.find((c) => {
      const ids = Array.from(new Set([...(c.companyIds || []), ...(c.companyId ? [c.companyId] : [])]));
      return ids.includes(initialCompany);
    })?.id || '';

    const nextCurrency = String(companiesById.get(initialCompany)?.baseCurrency || defaultCurrency || currencyOptions[0] || 'USD');

    setForm({
      type: forcedType || typeOptions[0] || 'Invoice',
      title: '',
      status: statusOptions[0] || 'Draft',
      issueDate: todayInputDate(),
      dueDate: '',
      currency: nextCurrency,
      companyId: initialCompany,
      clientId: initialClient,
      notes: ''
    });

    setFormOpen(true);
  };

  const openEdit = (doc: FinancialDocument) => {
    setEditingDoc(doc);
    setForm({
      type: doc.type,
      title: doc.title || '',
      status: doc.status || (statusOptions[0] || 'Draft'),
      issueDate: toInputDate(doc.issueDate),
      dueDate: toInputDate(doc.dueDate),
      currency: doc.currency || defaultCurrency || 'USD',
      companyId: doc.companyId || companyId || '',
      clientId: doc.clientId || '',
      notes: doc.notes || ''
    });
    setFormOpen(true);
  };

  const submitDocument = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentUser?.id) return setError(t('financial.errorAuthRequired'));
    const selectedCompany = form.companyId || companyId || currentUser.companyId || '';
    if (!selectedCompany) return setError(t('financial.errorCompanyRequired'));
    if (!form.clientId) return setError(t('financial.errorClientRequired'));

    const payload = {
      type: forcedType || form.type,
      title: form.title,
      status: form.status,
      issueDate: (editingDoc ? form.issueDate : todayInputDate()) || null,
      dueDate: form.dueDate || null,
      currency: form.currency || defaultCurrency || 'USD',
      companyId: selectedCompany,
      clientId: form.clientId,
      notes: form.notes.trim() || null,
      createdById: currentUser.id,
      updatedById: currentUser.id,
      items: []
    };

    try {
      const url = editingDoc ? `/api/financial-documents/${editingDoc.id}` : '/api/financial-documents';
      const method = editingDoc ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || t('financial.errorSaveDoc'));
      }

      const saved: FinancialDocument = await res.json();
      setFormOpen(false);
      setEditingDoc(null);
      await loadDocuments();

      if (view === 'details') {
        localStorage.setItem(SELECTED_DOCUMENT_KEY, saved.id);
        setSelectedDoc(saved);
        setDetailItems((saved.items || []).map((item) => ({ ...item, quantity: toNum(item.quantity), unitPrice: toNum(item.unitPrice), total: toNum(item.total) })));
      }
    } catch (e: any) {
      setError(e.message || t('financial.errorSaveDoc'));
    }
  };

  const removeDocument = async (id: string) => {
    if (!confirm(t('financial.deleteConfirm'))) return;
    try {
      const res = await fetch(`/api/financial-documents/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || t('financial.errorDeleteDoc'));
      }

      if (selectedDoc?.id === id) {
        localStorage.removeItem(SELECTED_DOCUMENT_KEY);
        setSelectedDoc(null);
        setDetailItems([]);
        setView('FinancialDocuments');
      }
      await loadDocuments();
    } catch (e: any) {
      setError(e.message || t('financial.errorDeleteDoc'));
    }
  };

  const updateStatus = async (doc: FinancialDocument, status: string) => {
    if (!currentUser?.id) return setError(t('financial.errorAuthRequired'));
    try {
      const res = await fetch(`/api/financial-documents/${doc.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, updatedById: currentUser.id })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || t('financial.errorUpdateStatus'));
      }
      const next = await res.json();
      if (selectedDoc?.id === doc.id) setSelectedDoc(next);
      await loadDocuments();
    } catch (e: any) {
      setError(e.message || t('financial.errorUpdateStatus'));
    }
  };

  const showDetails = async (docId: string) => {
    try {
      localStorage.setItem(SELECTED_DOCUMENT_KEY, docId);
      const res = await fetch(`/api/financial-documents/${docId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || t('financial.errorLoadDetails'));
      }
      const detail: FinancialDocument = await res.json();
      setSelectedDoc(detail);
      setDetailItems((detail.items || []).map((item) => ({ ...item, quantity: toNum(item.quantity), unitPrice: toNum(item.unitPrice), total: toNum(item.total) })));
      setView('FinancialDocumentDetails');
    } catch (e: any) {
      setError(e.message || t('financial.errorLoadDetails'));
    }
  };

  const updateDetailItem = (index: number, key: keyof FinancialDocumentItem, value: string | number) => {
    setDetailItems((prev) => {
      const next = [...prev];
      const current = { ...next[index] };

      if (key === 'quantity' || key === 'unitPrice') {
        (current as any)[key] = toNum(value);
        current.total = toNum(current.quantity) * toNum(current.unitPrice);
      } else if (key === 'total') {
        current.total = toNum(value);
      } else {
        (current as any)[key] = String(value || '');
      }

      next[index] = current;
      return next;
    });
  };

  const addDetailItem = () => {
    setDetailItems((prev) => [...prev, { description: '', quantity: 1, unitPrice: 0, total: 0 }]);
  };

  const removeDetailItem = (index: number) => {
    setDetailItems((prev) => prev.filter((_, i) => i !== index));
  };

  const saveDetailItems = async () => {
    if (!selectedDoc || !currentUser?.id) return;

    const cleanItems = detailItems
      .map((item, i) => ({
        description: String(item.description || '').trim(),
        quantity: toNum(item.quantity),
        unitPrice: toNum(item.unitPrice),
        total: toNum(item.total),
        sortOrder: i
      }))
      .filter((item) => item.description);

    try {
      setSavingItems(true);
      const res = await fetch(`/api/financial-documents/${selectedDoc.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: selectedDoc.type,
          title: selectedDoc.title,
          status: selectedDoc.status,
          issueDate: selectedDoc.issueDate,
          dueDate: selectedDoc.dueDate,
          currency: selectedDoc.currency,
          companyId: selectedDoc.companyId,
          clientId: selectedDoc.clientId,
          notes: selectedDoc.notes,
          totalAmount: cleanItems.reduce((sum, item) => sum + item.total, 0),
          items: cleanItems,
          updatedById: currentUser.id
        })
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || t('financial.errorSaveItems'));
      }

      const updated: FinancialDocument = await res.json();
      setSelectedDoc(updated);
      setDetailItems((updated.items || []).map((item) => ({ ...item, quantity: toNum(item.quantity), unitPrice: toNum(item.unitPrice), total: toNum(item.total) })));
      await loadDocuments();
    } catch (e: any) {
      setError(e.message || t('financial.errorSaveItems'));
    } finally {
      setSavingItems(false);
    }
  };

  const downloadPdf = () => {
    if (!selectedDoc) return;

    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 40;
    const contentWidth = pageWidth - (margin * 2);
    const formatMoney = (v: number) => `${selectedDoc.currency} ${toNum(v).toFixed(2)}`;
    const itemsToPrint = detailItems.length > 0 ? detailItems : (selectedDoc.items || []);
    const safeTitle = selectedDoc.title || t('financial.document', { defaultValue: 'Document' });
    const typeLabel = t(`financial.${selectedDoc.type.toLowerCase().replace(' ', '')}`, { defaultValue: selectedDoc.type });
    const statusLabel = t(`financial.${selectedDoc.status.toLowerCase().replace(' ', '')}`, { defaultValue: selectedDoc.status });
    const companyName = companiesById.get(selectedDoc.companyId)?.name || '-';
    const issueDate = selectedDoc.issueDate ? new Date(selectedDoc.issueDate).toLocaleDateString() : '-';
    const dueDate = selectedDoc.dueDate ? new Date(selectedDoc.dueDate).toLocaleDateString() : '-';
    const notesLines = pdf.splitTextToSize(selectedDoc.notes || '', contentWidth - 32);

    let y = margin;

    // Header band
    pdf.setFillColor(239, 68, 68);
    pdf.rect(margin, y, contentWidth, 78, 'F');

    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.text('SINAPSIS', margin + 16, y + 24);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.text(t('financial.title', { defaultValue: 'Financial Documents' }), margin + 16, y + 40);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(24);
    pdf.text(typeLabel.toUpperCase(), pageWidth - margin - 16, y + 30, { align: 'right' });
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`${t('financial.code', { defaultValue: 'Code' })}: ${selectedDoc.code || '-'}`, pageWidth - margin - 16, y + 48, { align: 'right' });
    pdf.text(`${t('financial.issueDate', { defaultValue: 'Issue Date' })}: ${issueDate}`, pageWidth - margin - 16, y + 62, { align: 'right' });

    y += 94;
    pdf.setTextColor(17, 24, 39);

    // Document title
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(16);
    pdf.text(safeTitle, margin, y);
    y += 8;
    pdf.setDrawColor(226, 232, 240);
    pdf.line(margin, y + 6, pageWidth - margin, y + 6);
    y += 22;

    // Summary cards
    const cardGap = 12;
    const cardWidth = (contentWidth - cardGap) / 2;
    const cardHeight = 108;
    const leftCardX = margin;
    const rightCardX = margin + cardWidth + cardGap;

    pdf.setFillColor(248, 250, 252);
    pdf.setDrawColor(226, 232, 240);
    pdf.roundedRect(leftCardX, y, cardWidth, cardHeight, 6, 6, 'FD');
    pdf.roundedRect(rightCardX, y, cardWidth, cardHeight, 6, 6, 'FD');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text(t('financial.company', { defaultValue: 'Company' }).toUpperCase(), leftCardX + 12, y + 18);
    pdf.text(t('financial.client', { defaultValue: 'Client' }).toUpperCase(), rightCardX + 12, y + 18);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.text(companyName, leftCardX + 12, y + 36);
    pdf.text(`${t('financial.type', { defaultValue: 'Type' })}: ${typeLabel}`, leftCardX + 12, y + 54);
    pdf.text(`${t('financial.status', { defaultValue: 'Status' })}: ${statusLabel}`, leftCardX + 12, y + 70);
    pdf.text(`${t('financial.dueDate', { defaultValue: 'Due Date' })}: ${dueDate}`, leftCardX + 12, y + 86);

    pdf.text(selectedDoc.partyName || '-', rightCardX + 12, y + 36);
    pdf.text(`${t('financial.email', { defaultValue: 'Email' })}: ${selectedDoc.partyEmail || '-'}`, rightCardX + 12, y + 54);
    pdf.text(`${t('financial.total', { defaultValue: 'Total' })}: ${formatMoney(selectedDoc.totalAmount)}`, rightCardX + 12, y + 70);
    pdf.text(`${t('financial.issueDate', { defaultValue: 'Issue Date' })}: ${issueDate}`, rightCardX + 12, y + 86);

    y += cardHeight + 24;

    // Items table
    const colDesc = margin;
    const colQty = margin + (contentWidth * 0.56);
    const colUnit = margin + (contentWidth * 0.70);
    const colTotal = margin + (contentWidth * 0.84);
    const rowH = 22;

    pdf.setFillColor(15, 23, 42);
    pdf.rect(margin, y, contentWidth, rowH, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text(t('financial.descriptionLabel', { defaultValue: 'Description' }), colDesc + 8, y + 15);
    pdf.text(t('financial.qty', { defaultValue: 'Qty' }), colQty + 8, y + 15);
    pdf.text(t('financial.unitPrice', { defaultValue: 'Unit Price' }), colUnit + 8, y + 15);
    pdf.text(t('financial.total', { defaultValue: 'Total' }), colTotal + 8, y + 15);
    y += rowH;

    pdf.setTextColor(30, 41, 59);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);

    if (itemsToPrint.length === 0) {
      pdf.setDrawColor(226, 232, 240);
      pdf.rect(margin, y, contentWidth, rowH, 'S');
      pdf.text(t('financial.noItems', { defaultValue: 'No items.' }), margin + 8, y + 15);
      y += rowH;
    } else {
      itemsToPrint.forEach((item, index) => {
        if (y + rowH > pageHeight - 130) {
          pdf.addPage();
          y = margin;
          pdf.setFillColor(15, 23, 42);
          pdf.rect(margin, y, contentWidth, rowH, 'F');
          pdf.setTextColor(255, 255, 255);
          pdf.setFont('helvetica', 'bold');
          pdf.text(t('financial.descriptionLabel', { defaultValue: 'Description' }), colDesc + 8, y + 15);
          pdf.text(t('financial.qty', { defaultValue: 'Qty' }), colQty + 8, y + 15);
          pdf.text(t('financial.unitPrice', { defaultValue: 'Unit Price' }), colUnit + 8, y + 15);
          pdf.text(t('financial.total', { defaultValue: 'Total' }), colTotal + 8, y + 15);
          y += rowH;
          pdf.setTextColor(30, 41, 59);
          pdf.setFont('helvetica', 'normal');
        }

        if (index % 2 === 0) {
          pdf.setFillColor(248, 250, 252);
          pdf.rect(margin, y, contentWidth, rowH, 'F');
        }

        pdf.setDrawColor(226, 232, 240);
        pdf.rect(margin, y, contentWidth, rowH, 'S');

        const desc = String(item.description || '');
        const descLines = pdf.splitTextToSize(desc, (colQty - colDesc) - 14);
        pdf.text(descLines[0] || '-', colDesc + 8, y + 15);
        pdf.text(String(toNum(item.quantity)), colQty + 8, y + 15);
        pdf.text(toNum(item.unitPrice).toFixed(2), colUnit + 8, y + 15);
        pdf.text(toNum(item.total).toFixed(2), colTotal + 8, y + 15);
        y += rowH;
      });
    }

    y += 16;

    // Totals block
    const totalsW = 210;
    const totalsX = pageWidth - margin - totalsW;
    const subtotal = detailTotal;
    const grandTotal = detailTotal;

    pdf.setDrawColor(226, 232, 240);
    pdf.roundedRect(totalsX, y, totalsW, 68, 6, 6, 'S');
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.text(`${t('financial.totalValue', { defaultValue: 'Total' })}:`, totalsX + 12, y + 22);
    pdf.text(formatMoney(subtotal), totalsX + totalsW - 12, y + 22, { align: 'right' });

    pdf.setDrawColor(226, 232, 240);
    pdf.line(totalsX + 10, y + 32, totalsX + totalsW - 10, y + 32);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.text(`${t('financial.total', { defaultValue: 'Total' })}:`, totalsX + 12, y + 54);
    pdf.text(formatMoney(grandTotal), totalsX + totalsW - 12, y + 54, { align: 'right' });

    // Notes
    const notesY = y + 86;
    if (notesLines.length > 0) {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.setTextColor(71, 85, 105);
      pdf.text(t('financial.notes', { defaultValue: 'Notes' }).toUpperCase(), margin, notesY);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(51, 65, 85);
      pdf.text(notesLines, margin, notesY + 14);
    }

    // Footer
    pdf.setTextColor(148, 163, 184);
    pdf.setFontSize(9);
    pdf.text('Generated by Sinapsis', margin, pageHeight - 24);
    pdf.text(new Date().toLocaleString(), pageWidth - margin, pageHeight - 24, { align: 'right' });

    const safeCode = String(selectedDoc.code || 'document').replace(/[^\w.-]+/g, '_');
    pdf.save(`${safeCode}.pdf`);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 px-1">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{viewTitle[view]}</h1>
          <p className="text-sm text-slate-500 mt-1 font-medium">{t('financial.description', { defaultValue: 'Manage invoices, memos, purchase orders, receipts and delivery notes.' })}</p>
        </div>
      </div>

      {view !== 'details' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 flex flex-col sm:flex-row items-center gap-3">
            <div className="relative w-full sm:flex-1">
              <i className="fa-solid fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('financial.searchPlaceholder', { defaultValue: 'Search documents...' })} className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-medium transition-all focus:ring-4 focus:ring-red-500/5 focus:border-red-500/40 outline-none placeholder:text-slate-400" />
            </div>
            <div className="relative w-full sm:w-60">
              <i className="fa-solid fa-filter absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full pl-11 pr-10 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 appearance-none transition-all focus:ring-4 focus:ring-red-500/5 focus:border-red-500/40 outline-none cursor-pointer">
                <option value="">{t('financial.allStatuses', { defaultValue: 'All statuses' })}</option>
                {statusOptions.map((status) => <option key={status} value={status}>{t(`financial.${status.toLowerCase().replace(' ', '')}`, { defaultValue: status })}</option>)}
              </select>
              <i className="fa-solid fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] pointer-events-none"></i>
            </div>
          </div>
          <button onClick={openCreate} className="w-full sm:w-auto px-6 py-3 bg-red-500 hover:bg-red-600 active:scale-[0.98] transition-all text-white rounded-xl text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2">
            <i className="fa-solid fa-plus"></i>{t('financial.newDocument', { defaultValue: 'New Document' })}
          </button>
        </div>
      )}

      {error && <div className="bg-rose-50 border border-rose-200 text-rose-600 px-4 py-3 rounded-xl text-sm font-medium">{error}</div>}
      {loading && <div className="text-sm text-slate-500">{t('financial.loading', { defaultValue: 'Loading documents...' })}</div>}

      {!loading && view !== 'details' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-left min-w-[980px]">
            <thead className="bg-table-header border-b border-foreground/10"><tr>{[t('financial.document', { defaultValue: 'Document' }), t('financial.type', { defaultValue: 'Type' }), t('financial.code', { defaultValue: 'Code' }), t('financial.counterparty', { defaultValue: 'Counterparty' }), t('financial.issueDate', { defaultValue: 'Issue Date' }), t('financial.dueDate', { defaultValue: 'Due Date' }), t('financial.totalValue', { defaultValue: 'Total' }), t('financial.status', { defaultValue: 'Status' }), t('financial.actions', { defaultValue: 'Actions' })].map((h) => <th key={h} className="px-4 py-3 text-[10px] uppercase tracking-widest text-table-header-foreground font-bold">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {documents.length === 0 && <tr><td colSpan={9} className="px-5 py-12 text-center text-sm text-slate-400">{t('financial.noDocuments', { defaultValue: 'No documents to show.' })}</td></tr>}
              {documents.map((doc) => (
                <tr key={doc.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-4"><button className="text-left" onClick={() => showDetails(doc.id)}><p className="text-sm font-bold text-slate-900">{doc.title}</p><p className="text-xs text-slate-400">{t('financial.documentCount', { count: doc.itemCount || 0 })}</p></button></td>
                  <td className="px-4 py-4 text-xs font-semibold text-slate-600">{t(`financial.${doc.type.toLowerCase().replace(' ', '')}`, { defaultValue: doc.type })}</td>
                  <td className="px-4 py-4 text-xs font-mono text-red-500">{doc.code}</td>
                  <td className="px-4 py-4 text-xs text-slate-600"><p className="font-semibold">{doc.partyName}</p><p className="text-slate-400">{doc.partyEmail || '-'}</p></td>
                  <td className="px-4 py-4 text-xs text-slate-500">{doc.issueDate ? new Date(doc.issueDate).toLocaleDateString() : '-'}</td>
                  <td className="px-4 py-4 text-xs text-slate-500">{doc.dueDate ? new Date(doc.dueDate).toLocaleDateString() : '-'}</td>
                  <td className="px-4 py-4 text-xs font-bold text-slate-900">{doc.currency} {toNum(doc.totalAmount).toFixed(2)}</td>
                  <td className="px-4 py-4 text-xs"><select value={doc.status} onChange={(e) => updateStatus(doc, e.target.value)} className="px-2 py-1 border border-slate-200 rounded-md text-[11px] font-semibold text-slate-600">{statusOptions.map((status) => <option key={status} value={status}>{t(`financial.${status.toLowerCase().replace(' ', '')}`, { defaultValue: status })}</option>)}</select></td>
                  <td className="px-4 py-4"><div className="flex gap-2"><button onClick={() => showDetails(doc.id)} className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 hover:bg-indigo-500 hover:text-white"><i className="fa-solid fa-eye text-xs"></i></button><button onClick={async () => { const res = await fetch(`/api/financial-documents/${doc.id}`); if (!res.ok) return; openEdit(await res.json()); }} className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 hover:bg-red-500 hover:text-white"><i className="fa-solid fa-pen text-xs"></i></button><button onClick={() => removeDocument(doc.id)} className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 hover:bg-rose-500 hover:text-white"><i className="fa-solid fa-trash text-xs"></i></button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && view === 'details' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-6">
          {!selectedDoc && <div className="text-sm text-slate-500">{t('financial.selectDocument', { defaultValue: 'Select a document from one of the document lists.' })}</div>}
          {selectedDoc && (
            <>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <p className="text-xs font-mono text-red-500">{selectedDoc.code}</p>
                  <h2 className="text-2xl font-bold text-slate-900">{selectedDoc.title}</h2>
                  <p className="text-sm text-slate-500">{t(`financial.${selectedDoc.type.toLowerCase().replace(' ', '')}`, { defaultValue: selectedDoc.type })}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={downloadPdf} className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"><i className="fa-solid fa-file-pdf mr-2"></i>{t('financial.downloadPdf', { defaultValue: 'Download PDF' })}</button>
                  <button onClick={() => openEdit(selectedDoc)} className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('financial.edit', { defaultValue: 'Edit' })}</button>
                  <button onClick={() => removeDocument(selectedDoc.id)} className="px-4 py-2 rounded-lg bg-rose-500 text-sm font-semibold text-white hover:bg-rose-600">{t('financial.delete', { defaultValue: 'Delete' })}</button>
                  <button onClick={() => setView('FinancialDocuments')} className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('financial.returnToList', { defaultValue: 'Return to list' })}</button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 border border-slate-200 rounded-xl p-4">
                  <h3 className="text-sm font-bold text-slate-900 mb-2">{t('financial.notes', { defaultValue: 'Notes' })}</h3>
                  <p className="text-sm text-slate-600 whitespace-pre-wrap">{selectedDoc.notes || t('financial.noNotes', { defaultValue: 'No notes.' })}</p>
                </div>
                <div className="border border-slate-200 rounded-xl p-4 space-y-2 text-sm">
                  <p><span className="font-semibold text-slate-500">{t('financial.status', { defaultValue: 'Status' })}:</span> {t(`financial.${selectedDoc.status.toLowerCase().replace(' ', '')}`, { defaultValue: selectedDoc.status })}</p>
                  <p><span className="font-semibold text-slate-500">{t('financial.type', { defaultValue: 'Type' })}:</span> {t(`financial.${selectedDoc.type.toLowerCase().replace(' ', '')}`, { defaultValue: selectedDoc.type })}</p>
                  <p><span className="font-semibold text-slate-500">{t('financial.counterparty', { defaultValue: 'Counterparty' })}:</span> {selectedDoc.partyName}</p>
                  <p><span className="font-semibold text-slate-500">{t('financial.email', { defaultValue: 'Email' })}:</span> {selectedDoc.partyEmail || '-'}</p>
                  <p><span className="font-semibold text-slate-500">{t('financial.issueDate', { defaultValue: 'Issue Date' })}:</span> {selectedDoc.issueDate ? new Date(selectedDoc.issueDate).toLocaleDateString() : '-'}</p>
                  <p><span className="font-semibold text-slate-500">{t('financial.dueDate', { defaultValue: 'Due Date' })}:</span> {selectedDoc.dueDate ? new Date(selectedDoc.dueDate).toLocaleDateString() : '-'}</p>
                  <p><span className="font-semibold text-slate-500">{t('financial.total', { defaultValue: 'Total' })}:</span> {selectedDoc.currency} {toNum(selectedDoc.totalAmount).toFixed(2)}</p>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-900">{t('financial.itemsManagement', { defaultValue: 'Items Management' })}</h4>
                  <div className="flex gap-2">
                    <button type="button" onClick={addDetailItem} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-600 hover:bg-indigo-100"><i className="fa-solid fa-plus mr-1"></i>{t('financial.addItem', { defaultValue: 'Add Item' })}</button>
                    <button type="button" onClick={saveDetailItems} disabled={savingItems} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500 text-white hover:bg-red-600 disabled:opacity-60">{savingItems ? t('financial.savingItems', { defaultValue: 'Saving...' }) : t('financial.saveItems', { defaultValue: 'Save Items' })}</button>
                  </div>
                </div>
                <table className="w-full text-left min-w-[760px]">
                  <thead className="bg-table-header border-b border-foreground/10"><tr>{[t('financial.descriptionLabel', { defaultValue: 'Description' }), t('financial.qty', { defaultValue: 'Qty' }), t('financial.unitPrice', { defaultValue: 'Unit Price' }), t('financial.totalValue', { defaultValue: 'Total' }), ''].map((h) => <th key={h} className="px-4 py-3 text-[10px] uppercase tracking-widest text-table-header-foreground font-bold">{h}</th>)}</tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {detailItems.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">{t('financial.noItems', { defaultValue: 'No items.' })}</td></tr>}
                    {detailItems.map((item, index) => (
                      <tr key={`detail-item-${index}`}>
                        <td className="px-4 py-2"><input value={item.description} onChange={(e) => updateDetailItem(index, 'description', e.target.value)} className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm" /></td>
                        <td className="px-4 py-2"><input type="number" min="0" step="0.01" value={item.quantity} onChange={(e) => updateDetailItem(index, 'quantity', e.target.value)} className="w-24 px-2 py-1.5 border border-slate-200 rounded text-sm" /></td>
                        <td className="px-4 py-2"><input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(e) => updateDetailItem(index, 'unitPrice', e.target.value)} className="w-28 px-2 py-1.5 border border-slate-200 rounded text-sm" /></td>
                        <td className="px-4 py-2"><input type="number" min="0" step="0.01" value={item.total} onChange={(e) => updateDetailItem(index, 'total', e.target.value)} className="w-28 px-2 py-1.5 border border-slate-200 rounded text-sm" /></td>
                        <td className="px-4 py-2 text-right"><button type="button" onClick={() => removeDetailItem(index)} className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 hover:bg-rose-500 hover:text-white"><i className="fa-solid fa-trash text-xs"></i></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 text-right text-sm font-semibold text-slate-700">
                  {t('financial.totalValue', { defaultValue: 'Total' })}: {selectedDoc.currency} {detailTotal.toFixed(2)}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setFormOpen(false)}></div>
          <div className="relative bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-4xl overflow-hidden">
            <form onSubmit={submitDocument}>
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between"><h3 className="text-lg font-bold text-slate-900">{editingDoc ? t('financial.editDocument', { defaultValue: 'Edit Financial Document' }) : t('financial.createDocument', { defaultValue: 'New Financial Document' })}</h3><button type="button" onClick={() => setFormOpen(false)} className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-500"><i className="fa-solid fa-xmark"></i></button></div>
              <div className="p-5 grid grid-cols-1 lg:grid-cols-3 gap-4 max-h-[62vh] overflow-y-auto">
                <div><label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('financial.type', { defaultValue: 'Type' })}</label><select value={forcedType || form.type} disabled={Boolean(forcedType)} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">{typeOptions.map((type) => <option key={type} value={type}>{t(`financial.${type.toLowerCase().replace(' ', '')}`, { defaultValue: type })}</option>)}</select></div>
                <div><label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('financial.status', { defaultValue: 'Status' })}</label><select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">{statusOptions.map((status) => <option key={status} value={status}>{t(`financial.${status.toLowerCase().replace(' ', '')}`, { defaultValue: status })}</option>)}</select></div>
                <div><label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('financial.currency', { defaultValue: 'Currency' })}</label><select value={form.currency} onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">{currencyOptions.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>

                <div className="lg:col-span-3"><label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('financial.titleLabel', { defaultValue: 'Title' })}</label><input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder={t('financial.titlePlaceholder', { defaultValue: 'Optional' })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div>

                {isOrganizationScope && (
                  <div>
                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('financial.company', { defaultValue: 'Company' })}</label>
                    <select
                      value={form.companyId}
                      onChange={(e) => {
                        const nextCompanyId = e.target.value;
                        setForm((p) => ({ ...p, companyId: nextCompanyId, clientId: '' }));
                        applyDefaultCurrency(nextCompanyId, defaultCurrency);
                      }}
                      className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    >
                      {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
                    </select>
                  </div>
                )}

                {!isOrganizationScope && (
                  <div>
                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('financial.company', { defaultValue: 'Company' })}</label>
                    <input value={companiesById.get(companyId || '')?.name || ''} disabled className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-100" />
                  </div>
                )}

                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('financial.client', { defaultValue: 'Client' })}</label>
                  <select value={form.clientId} onChange={(e) => setForm((p) => ({ ...p, clientId: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" disabled={availableClients.length === 0}>
                    {availableClients.length === 0 && <option value="">{t('financial.noClientsForCompany', { defaultValue: 'No clients for this company.' })}</option>}
                    {availableClients.map((client) => <option key={client.id} value={client.id}>{client.name}{client.email ? ` (${client.email})` : ''}</option>)}
                  </select>
                </div>

                <div><label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('financial.issueDate', { defaultValue: 'Issue Date' })}</label><input type="date" value={form.issueDate} disabled className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-100 cursor-not-allowed" /></div>
                <div><label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('financial.dueDate', { defaultValue: 'Due Date' })}</label><input type="date" value={form.dueDate} onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div>
                <div className="lg:col-span-3"><label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('financial.notes', { defaultValue: 'Notes' })}</label><textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} rows={3} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none" /></div>
              </div>
              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2"><button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700">{t('financial.cancel', { defaultValue: 'Cancel' })}</button><button type="submit" className="px-5 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-sm font-semibold text-white">{t('financial.saveDocument', { defaultValue: 'Save Document' })}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default FinancialDocumentsModule;
