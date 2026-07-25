import React, { useEffect, useMemo, useState } from 'react';
import { AppUser, ViewType } from '@sinapsis/shared-types';

type ExpenseView = 'list' | 'recurring' | 'rates';

interface ExpenseModuleProps {
  view: ExpenseView;
  setView: (view: ViewType) => void;
  currentUser?: AppUser;
  companyId?: string;
}

interface UserOption {
  id: string;
  name: string;
  email: string;
}

interface OptionItem {
  id: string;
  name: string;
}

interface ExpenseItem {
  id: string;
  code: string;
  title: string;
  description?: string;
  vendor?: string;
  amount: number;
  currency: string;
  exchangeRate: number;
  baseCurrency: string;
  amountBase: number;
  expenseDate: string;
  status: string;
  category?: string;
  paymentMethod?: string;
  notes?: string;
  ownerId: string;
  ownerName?: string;
  recurringTitle?: string;
}

interface RecurringItem {
  id: string;
  code: string;
  title: string;
  amount: number;
  currency: string;
  frequency: string;
  interval: number;
  startDate: string;
  endDate?: string | null;
  nextRunAt?: string | null;
  status: string;
  category?: string;
  paymentMethod?: string;
  ownerId: string;
  ownerName?: string;
}

interface RateItem {
  id: string;
  companyId?: string | null;
  baseCurrency: string;
  quoteCurrency: string;
  rate: number;
  effectiveDate: string;
  source: string;
}

interface MetaResponse {
  baseCurrency: string;
  categories: {
    expenseCategories: OptionItem[];
    statuses: OptionItem[];
    paymentMethods: OptionItem[];
    currencies: OptionItem[];
    recurrence: OptionItem[];
  };
  users: UserOption[];
  latestRates: RateItem[];
}

const fmtMoney = (amount: number, currency: string) => {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount || 0);
  } catch {
    return `${currency} ${Number(amount || 0).toFixed(2)}`;
  }
};

const toInputDate = (value?: string | null) => (value ? String(value).slice(0, 10) : '');

const ExpenseModule: React.FC<ExpenseModuleProps> = ({ view, setView, currentUser, companyId }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [users, setUsers] = useState<UserOption[]>([]);
  const [baseCurrency, setBaseCurrency] = useState('USD');
  const [categories, setCategories] = useState<MetaResponse['categories']>({
    expenseCategories: [],
    statuses: [],
    paymentMethods: [],
    currencies: [],
    recurrence: []
  });

  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [recurring, setRecurring] = useState<RecurringItem[]>([]);
  const [rates, setRates] = useState<RateItem[]>([]);

  const [mode, setMode] = useState<'my' | 'all'>('my');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState('');

  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseItem | null>(null);
  const [expenseForm, setExpenseForm] = useState({
    title: '',
    description: '',
    vendor: '',
    amount: '',
    currency: 'USD',
    exchangeRate: '',
    expenseDate: toInputDate(new Date().toISOString()),
    status: 'Paid',
    category: '',
    paymentMethod: '',
    ownerId: currentUser?.id || '',
    notes: ''
  });

  const [recurringModalOpen, setRecurringModalOpen] = useState(false);
  const [editingRecurring, setEditingRecurring] = useState<RecurringItem | null>(null);
  const [recurringForm, setRecurringForm] = useState({
    title: '',
    description: '',
    vendor: '',
    amount: '',
    currency: 'USD',
    frequency: 'Monthly',
    interval: '1',
    startDate: toInputDate(new Date().toISOString()),
    endDate: '',
    status: 'Active',
    category: '',
    paymentMethod: '',
    ownerId: currentUser?.id || '',
    notes: ''
  });

  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [editingRate, setEditingRate] = useState<RateItem | null>(null);
  const [rateForm, setRateForm] = useState({
    baseCurrency: 'USD',
    quoteCurrency: '',
    rate: '',
    effectiveDate: toInputDate(new Date().toISOString()),
    source: 'Manual'
  });

  const activeCompanyId = companyId || currentUser?.companyId || '';

  const loadMeta = async () => {
    try {
      setError('');
      const params = new URLSearchParams();
      if (activeCompanyId) params.set('companyId', activeCompanyId);
      if (currentUser?.id) params.set('userId', currentUser.id);

      const res = await fetch(`/api/expenses/meta?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'No se pudo cargar metadata de gastos.');
      }

      const data: MetaResponse = await res.json();
      setUsers(data.users || []);
      setBaseCurrency(data.baseCurrency || 'USD');
      setCategories(data.categories || {
        expenseCategories: [],
        statuses: [],
        paymentMethods: [],
        currencies: [],
        recurrence: []
      });
      setRates((prev) => prev.length > 0 ? prev : (data.latestRates || []));
    } catch (e: any) {
      setError(e.message || 'Error cargando metadata de gastos.');
    }
  };

  const loadExpenses = async () => {
    try {
      setLoading(true);
      setError('');
      const params = new URLSearchParams();
      if (activeCompanyId) params.set('companyId', activeCompanyId);
      if (currentUser?.id) params.set('viewerId', currentUser.id);
      params.set('mode', mode);
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter) params.set('status', statusFilter);
      if (currencyFilter) params.set('currency', currencyFilter);

      const res = await fetch(`/api/expenses?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'No se pudieron cargar gastos.');
      }

      const data = await res.json();
      setExpenses(data || []);
    } catch (e: any) {
      setError(e.message || 'Error cargando gastos.');
    } finally {
      setLoading(false);
    }
  };

  const loadRecurring = async () => {
    try {
      setLoading(true);
      setError('');
      const params = new URLSearchParams();
      if (activeCompanyId) params.set('companyId', activeCompanyId);
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/expenses/recurring?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'No se pudieron cargar recurrentes.');
      }

      const data = await res.json();
      setRecurring(data || []);
    } catch (e: any) {
      setError(e.message || 'Error cargando recurrentes.');
    } finally {
      setLoading(false);
    }
  };

  const loadRates = async () => {
    try {
      setLoading(true);
      setError('');
      const params = new URLSearchParams();
      if (activeCompanyId) params.set('companyId', activeCompanyId);

      const res = await fetch(`/api/expenses/exchange-rates?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'No se pudieron cargar tipos de cambio.');
      }

      const data = await res.json();
      setRates(data || []);
    } catch (e: any) {
      setError(e.message || 'Error cargando tipos de cambio.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMeta();
  }, [activeCompanyId, currentUser?.id]);

  useEffect(() => {
    if (view === 'list') loadExpenses();
    if (view === 'recurring') loadRecurring();
    if (view === 'rates') loadRates();
  }, [view, activeCompanyId, currentUser?.id, mode, search, statusFilter, currencyFilter]);
  const statusOptions = useMemo(() => categories.statuses.map((x) => x.name), [categories.statuses]);
  const currencyOptions = useMemo(() => categories.currencies.map((x) => x.name), [categories.currencies]);

  const openExpenseModal = (item?: ExpenseItem) => {
    if (item) {
      setEditingExpense(item);
      setExpenseForm({
        title: item.title,
        description: item.description || '',
        vendor: item.vendor || '',
        amount: String(item.amount || ''),
        currency: item.currency || baseCurrency,
        exchangeRate: item.exchangeRate ? String(item.exchangeRate) : '',
        expenseDate: toInputDate(item.expenseDate),
        status: item.status || (statusOptions[0] || 'Paid'),
        category: item.category || '',
        paymentMethod: item.paymentMethod || '',
        ownerId: item.ownerId || currentUser?.id || '',
        notes: item.notes || ''
      });
    } else {
      setEditingExpense(null);
      setExpenseForm({
        title: '',
        description: '',
        vendor: '',
        amount: '',
        currency: baseCurrency,
        exchangeRate: '',
        expenseDate: toInputDate(new Date().toISOString()),
        status: statusOptions[0] || 'Paid',
        category: categories.expenseCategories[0]?.name || '',
        paymentMethod: categories.paymentMethods[0]?.name || '',
        ownerId: currentUser?.id || users[0]?.id || '',
        notes: ''
      });
    }
    setExpenseModalOpen(true);
  };

  const saveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser?.id) return setError('No hay usuario autenticado.');

    const payload = {
      title: expenseForm.title,
      description: expenseForm.description,
      vendor: expenseForm.vendor,
      amount: Number(expenseForm.amount || 0),
      currency: expenseForm.currency,
      exchangeRate: expenseForm.exchangeRate ? Number(expenseForm.exchangeRate) : undefined,
      expenseDate: expenseForm.expenseDate,
      status: expenseForm.status,
      category: expenseForm.category,
      paymentMethod: expenseForm.paymentMethod,
      ownerId: expenseForm.ownerId,
      notes: expenseForm.notes,
      companyId: activeCompanyId,
      createdById: currentUser.id
    };

    try {
      const method = editingExpense ? 'PUT' : 'POST';
      const url = editingExpense ? `/api/expenses/${editingExpense.id}` : '/api/expenses';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'No se pudo guardar el gasto.');
      }

      setExpenseModalOpen(false);
      await loadExpenses();
    } catch (e: any) {
      setError(e.message || 'Error guardando gasto.');
    }
  };

  const removeExpense = async (id: string) => {
    if (!confirm('Eliminar gasto?')) return;
    try {
      const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'No se pudo eliminar el gasto.');
      }
      await loadExpenses();
    } catch (e: any) {
      setError(e.message || 'Error eliminando gasto.');
    }
  };

  const openRecurringModal = (item?: RecurringItem) => {
    if (item) {
      setEditingRecurring(item);
      setRecurringForm({
        title: item.title,
        description: '',
        vendor: '',
        amount: String(item.amount || ''),
        currency: item.currency || baseCurrency,
        frequency: item.frequency || 'Monthly',
        interval: String(item.interval || 1),
        startDate: toInputDate(item.startDate),
        endDate: toInputDate(item.endDate),
        status: item.status || 'Active',
        category: item.category || '',
        paymentMethod: item.paymentMethod || '',
        ownerId: item.ownerId || currentUser?.id || '',
        notes: ''
      });
    } else {
      setEditingRecurring(null);
      setRecurringForm({
        title: '',
        description: '',
        vendor: '',
        amount: '',
        currency: baseCurrency,
        frequency: categories.recurrence[0]?.name || 'Monthly',
        interval: '1',
        startDate: toInputDate(new Date().toISOString()),
        endDate: '',
        status: 'Active',
        category: categories.expenseCategories[0]?.name || '',
        paymentMethod: categories.paymentMethods[0]?.name || '',
        ownerId: currentUser?.id || users[0]?.id || '',
        notes: ''
      });
    }
    setRecurringModalOpen(true);
  };

  const saveRecurring = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser?.id) return setError('No hay usuario autenticado.');

    const payload = {
      title: recurringForm.title,
      description: recurringForm.description,
      vendor: recurringForm.vendor,
      amount: Number(recurringForm.amount || 0),
      currency: recurringForm.currency,
      frequency: recurringForm.frequency,
      interval: Number(recurringForm.interval || 1),
      startDate: recurringForm.startDate,
      endDate: recurringForm.endDate || null,
      status: recurringForm.status,
      category: recurringForm.category,
      paymentMethod: recurringForm.paymentMethod,
      ownerId: recurringForm.ownerId,
      notes: recurringForm.notes,
      companyId: activeCompanyId,
      createdById: currentUser.id
    };

    try {
      const method = editingRecurring ? 'PUT' : 'POST';
      const url = editingRecurring ? `/api/expenses/recurring/${editingRecurring.id}` : '/api/expenses/recurring';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'No se pudo guardar el gasto recurrente.');
      }

      setRecurringModalOpen(false);
      await loadRecurring();
    } catch (e: any) {
      setError(e.message || 'Error guardando recurrente.');
    }
  };

  const runRecurringNow = async (id: string) => {
    if (!confirm('Generar gasto ahora?')) return;
    try {
      const res = await fetch(`/api/expenses/recurring/${id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runAt: new Date().toISOString() })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'No se pudo generar el gasto.');
      }
      await Promise.all([loadRecurring(), loadExpenses()]);
      setView('Expenses');
    } catch (e: any) {
      setError(e.message || 'Error generando gasto desde recurrente.');
    }
  };

  const removeRecurring = async (id: string) => {
    if (!confirm('Eliminar gasto recurrente?')) return;
    try {
      const res = await fetch(`/api/expenses/recurring/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'No se pudo eliminar el recurrente.');
      }
      await loadRecurring();
    } catch (e: any) {
      setError(e.message || 'Error eliminando recurrente.');
    }
  };

  const openRateModal = (item?: RateItem) => {
    if (item) {
      setEditingRate(item);
      setRateForm({
        baseCurrency: item.baseCurrency,
        quoteCurrency: item.quoteCurrency,
        rate: String(item.rate || ''),
        effectiveDate: toInputDate(item.effectiveDate),
        source: item.source || 'Manual'
      });
    } else {
      setEditingRate(null);
      setRateForm({
        baseCurrency,
        quoteCurrency: categories.currencies.find((x) => x.name !== baseCurrency)?.name || '',
        rate: '',
        effectiveDate: toInputDate(new Date().toISOString()),
        source: 'Manual'
      });
    }
    setRateModalOpen(true);
  };

  const saveRate = async (e: React.FormEvent) => {
    e.preventDefault();

    const payload = {
      companyId: activeCompanyId || null,
      baseCurrency: rateForm.baseCurrency,
      quoteCurrency: rateForm.quoteCurrency,
      rate: Number(rateForm.rate || 0),
      effectiveDate: rateForm.effectiveDate,
      source: rateForm.source,
      createdById: currentUser?.id
    };

    try {
      const method = editingRate ? 'PUT' : 'POST';
      const url = editingRate ? `/api/expenses/exchange-rates/${editingRate.id}` : '/api/expenses/exchange-rates';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'No se pudo guardar el tipo de cambio.');
      }

      setRateModalOpen(false);
      await loadRates();
    } catch (e: any) {
      setError(e.message || 'Error guardando tipo de cambio.');
    }
  };

  const removeRate = async (id: string) => {
    if (!confirm('Eliminar tipo de cambio?')) return;
    try {
      const res = await fetch(`/api/expenses/exchange-rates/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'No se pudo eliminar el tipo de cambio.');
      }
      await loadRates();
    } catch (e: any) {
      setError(e.message || 'Error eliminando tipo de cambio.');
    }
  };

  const titleByView = {
    list: 'Gastos',
    recurring: 'Gastos recurrentes',
    rates: 'Tipos de cambio'
  }[view];

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{titleByView}</h1>
          <p className="text-xs text-slate-400 mt-1">Controla gastos, programaciones recurrentes y tipos de cambio.</p>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <div className="bg-slate-100 p-1 rounded-xl flex gap-1">
            <button onClick={() => setView('Expenses')} className={`px-3 py-1.5 text-[11px] rounded-lg font-semibold ${view === 'list' ? 'bg-white text-red-500 shadow-sm' : 'text-slate-500'}`}>Gastos</button>
            <button onClick={() => setView('RecurringExpenses')} className={`px-3 py-1.5 text-[11px] rounded-lg font-semibold ${view === 'recurring' ? 'bg-white text-red-500 shadow-sm' : 'text-slate-500'}`}>Recurrentes</button>
            <button onClick={() => setView('ExchangeRates')} className={`px-3 py-1.5 text-[11px] rounded-lg font-semibold ${view === 'rates' ? 'bg-white text-red-500 shadow-sm' : 'text-slate-500'}`}>T. Cambio</button>
          </div>

          {view === 'list' && <button onClick={() => openExpenseModal()} className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-bold uppercase tracking-widest"><i className="fa-solid fa-plus mr-2"></i>Nuevo gasto</button>}
          {view === 'recurring' && <button onClick={() => openRecurringModal()} className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-bold uppercase tracking-widest"><i className="fa-solid fa-plus mr-2"></i>Nuevo recurrente</button>}
          {view === 'rates' && <button onClick={() => openRateModal()} className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-bold uppercase tracking-widest"><i className="fa-solid fa-plus mr-2"></i>Nuevo tipo</button>}
        </div>
      </div>

      {error && <div className="bg-rose-50 border border-rose-200 text-rose-600 px-4 py-3 rounded-xl text-sm font-medium">{error}</div>}

      <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap gap-2 items-center">
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." className="px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium w-56" />
        {view === 'list' && (
          <>
            <select value={mode} onChange={(e) => setMode(e.target.value as 'my' | 'all')} className="px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600">
              <option value="my">Mis gastos</option>
              <option value="all">Todos</option>
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600">
              <option value="">Todos los estados</option>
              {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
            <select value={currencyFilter} onChange={(e) => setCurrencyFilter(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600">
              <option value="">Todas las monedas</option>
              {currencyOptions.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
            </select>
          </>
        )}
      </div>

      {loading && <div className="text-sm text-slate-500">Cargando...</div>}
      {!loading && view === 'list' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-left min-w-[980px]">
            <thead className="bg-table-header border-b border-foreground/10">
              <tr>
                {['Gasto', 'Codigo', 'Fecha', 'Categoria', 'Monto', 'Monto Base', 'Estado', 'Responsable', 'Acciones'].map((h) => (
                  <th key={h} className="px-5 py-3 text-[10px] uppercase tracking-widest text-table-header-foreground font-bold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {expenses.length === 0 && <tr><td colSpan={9} className="px-5 py-12 text-center text-sm text-slate-400">No hay gastos para mostrar.</td></tr>}
              {expenses.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/70">
                  <td className="px-5 py-4"><p className="text-sm font-bold text-slate-900">{item.title}</p><p className="text-xs text-slate-400">{item.vendor || item.recurringTitle || '-'}</p></td>
                  <td className="px-5 py-4 text-xs font-mono text-red-500">{item.code}</td>
                  <td className="px-5 py-4 text-xs text-slate-500">{new Date(item.expenseDate).toLocaleDateString()}</td>
                  <td className="px-5 py-4 text-xs text-slate-500">{item.category || '-'}</td>
                  <td className="px-5 py-4 text-xs font-semibold text-slate-700">{fmtMoney(Number(item.amount || 0), item.currency || baseCurrency)}</td>
                  <td className="px-5 py-4 text-xs font-semibold text-slate-700">{fmtMoney(Number(item.amountBase || 0), item.baseCurrency || baseCurrency)}</td>
                  <td className="px-5 py-4 text-xs text-slate-500">{item.status}</td>
                  <td className="px-5 py-4 text-xs text-slate-500">{item.ownerName || '-'}</td>
                  <td className="px-5 py-4"><div className="flex gap-2"><button onClick={() => openExpenseModal(item)} className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 hover:bg-red-500 hover:text-white"><i className="fa-solid fa-pen text-xs"></i></button><button onClick={() => removeExpense(item.id)} className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 hover:bg-rose-500 hover:text-white"><i className="fa-solid fa-trash text-xs"></i></button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && view === 'recurring' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-left min-w-[980px]">
            <thead className="bg-table-header border-b border-foreground/10">
              <tr>
                {['Plantilla', 'Codigo', 'Frecuencia', 'Proximo', 'Monto', 'Estado', 'Responsable', 'Acciones'].map((h) => (
                  <th key={h} className="px-5 py-3 text-[10px] uppercase tracking-widest text-table-header-foreground font-bold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recurring.length === 0 && <tr><td colSpan={8} className="px-5 py-12 text-center text-sm text-slate-400">No hay gastos recurrentes.</td></tr>}
              {recurring.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/70">
                  <td className="px-5 py-4"><p className="text-sm font-bold text-slate-900">{item.title}</p><p className="text-xs text-slate-400">{item.category || '-'}</p></td>
                  <td className="px-5 py-4 text-xs font-mono text-red-500">{item.code}</td>
                  <td className="px-5 py-4 text-xs text-slate-500">{item.frequency} / {item.interval}</td>
                  <td className="px-5 py-4 text-xs text-slate-500">{item.nextRunAt ? new Date(item.nextRunAt).toLocaleDateString() : '-'}</td>
                  <td className="px-5 py-4 text-xs font-semibold text-slate-700">{fmtMoney(Number(item.amount || 0), item.currency || baseCurrency)}</td>
                  <td className="px-5 py-4 text-xs text-slate-500">{item.status}</td>
                  <td className="px-5 py-4 text-xs text-slate-500">{item.ownerName || '-'}</td>
                  <td className="px-5 py-4"><div className="flex gap-2"><button onClick={() => runRecurringNow(item.id)} className="px-2 h-8 rounded-lg bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase">Run</button><button onClick={() => openRecurringModal(item)} className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 hover:bg-red-500 hover:text-white"><i className="fa-solid fa-pen text-xs"></i></button><button onClick={() => removeRecurring(item.id)} className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 hover:bg-rose-500 hover:text-white"><i className="fa-solid fa-trash text-xs"></i></button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && view === 'rates' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-left min-w-[780px]">
            <thead className="bg-table-header border-b border-foreground/10"><tr>{['Base', 'Moneda', 'Tipo', 'Fecha', 'Fuente', 'Acciones'].map((h) => <th key={h} className="px-5 py-3 text-[10px] uppercase tracking-widest text-table-header-foreground font-bold">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rates.length === 0 && <tr><td colSpan={6} className="px-5 py-12 text-center text-sm text-slate-400">No hay tipos de cambio cargados.</td></tr>}
              {rates.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/70">
                  <td className="px-5 py-4 text-sm font-bold text-slate-900">{item.baseCurrency}</td>
                  <td className="px-5 py-4 text-sm text-slate-700">{item.quoteCurrency}</td>
                  <td className="px-5 py-4 text-sm font-mono text-red-500">{Number(item.rate || 0).toFixed(6)}</td>
                  <td className="px-5 py-4 text-xs text-slate-500">{new Date(item.effectiveDate).toLocaleDateString()}</td>
                  <td className="px-5 py-4 text-xs text-slate-500">{item.source || 'Manual'}</td>
                  <td className="px-5 py-4"><div className="flex gap-2"><button onClick={() => openRateModal(item)} className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 hover:bg-red-500 hover:text-white"><i className="fa-solid fa-pen text-xs"></i></button><button onClick={() => removeRate(item.id)} className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 hover:bg-rose-500 hover:text-white"><i className="fa-solid fa-trash text-xs"></i></button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {expenseModalOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4"><div className="absolute inset-0 bg-slate-900/50" onClick={() => setExpenseModalOpen(false)}></div><div className="relative bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-3xl overflow-hidden"><form onSubmit={saveExpense}><div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between"><h3 className="text-lg font-bold text-slate-900">{editingExpense ? 'Editar gasto' : 'Nuevo gasto'}</h3><button type="button" onClick={() => setExpenseModalOpen(false)} className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-500"><i className="fa-solid fa-xmark"></i></button></div><div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[70vh] overflow-y-auto"><div className="md:col-span-2"><label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Titulo</label><input required value={expenseForm.title} onChange={(e) => setExpenseForm((p) => ({ ...p, title: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div><div><label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Monto</label><input required type="number" step="0.01" min="0" value={expenseForm.amount} onChange={(e) => setExpenseForm((p) => ({ ...p, amount: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div><div><label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Moneda</label><select value={expenseForm.currency} onChange={(e) => setExpenseForm((p) => ({ ...p, currency: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">{currencyOptions.map((x) => <option key={x} value={x}>{x}</option>)}</select></div><div><label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Tipo cambio (opcional)</label><input type="number" step="0.000001" min="0" value={expenseForm.exchangeRate} onChange={(e) => setExpenseForm((p) => ({ ...p, exchangeRate: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div><div><label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Fecha</label><input type="date" value={expenseForm.expenseDate} onChange={(e) => setExpenseForm((p) => ({ ...p, expenseDate: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div><div><label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Estado</label><select value={expenseForm.status} onChange={(e) => setExpenseForm((p) => ({ ...p, status: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">{(statusOptions.length ? statusOptions : ['Paid', 'Planned', 'Canceled']).map((x) => <option key={x} value={x}>{x}</option>)}</select></div><div><label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Categoria</label><select value={expenseForm.category} onChange={(e) => setExpenseForm((p) => ({ ...p, category: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"><option value="">-</option>{categories.expenseCategories.map((x) => <option key={x.id} value={x.name}>{x.name}</option>)}</select></div><div><label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Metodo pago</label><select value={expenseForm.paymentMethod} onChange={(e) => setExpenseForm((p) => ({ ...p, paymentMethod: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"><option value="">-</option>{categories.paymentMethods.map((x) => <option key={x.id} value={x.name}>{x.name}</option>)}</select></div><div><label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Proveedor</label><input value={expenseForm.vendor} onChange={(e) => setExpenseForm((p) => ({ ...p, vendor: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div><div><label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Responsable</label><select value={expenseForm.ownerId} onChange={(e) => setExpenseForm((p) => ({ ...p, ownerId: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">{users.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div><div className="md:col-span-2"><label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Descripcion</label><textarea rows={3} value={expenseForm.description} onChange={(e) => setExpenseForm((p) => ({ ...p, description: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none" /></div></div><div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2"><button type="button" onClick={() => setExpenseModalOpen(false)} className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700">Cancelar</button><button type="submit" className="px-5 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-sm font-semibold text-white">Guardar</button></div></form></div></div>
      )}

      {recurringModalOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4"><div className="absolute inset-0 bg-slate-900/50" onClick={() => setRecurringModalOpen(false)}></div><div className="relative bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-3xl overflow-hidden"><form onSubmit={saveRecurring}><div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between"><h3 className="text-lg font-bold text-slate-900">{editingRecurring ? 'Editar recurrente' : 'Nuevo recurrente'}</h3><button type="button" onClick={() => setRecurringModalOpen(false)} className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-500"><i className="fa-solid fa-xmark"></i></button></div><div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[70vh] overflow-y-auto"><div className="md:col-span-2"><label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Titulo</label><input required value={recurringForm.title} onChange={(e) => setRecurringForm((p) => ({ ...p, title: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div><div><label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Monto</label><input required type="number" min="0" step="0.01" value={recurringForm.amount} onChange={(e) => setRecurringForm((p) => ({ ...p, amount: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div><div><label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Moneda</label><select value={recurringForm.currency} onChange={(e) => setRecurringForm((p) => ({ ...p, currency: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">{currencyOptions.map((x) => <option key={x} value={x}>{x}</option>)}</select></div><div><label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Frecuencia</label><select value={recurringForm.frequency} onChange={(e) => setRecurringForm((p) => ({ ...p, frequency: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">{(categories.recurrence.length ? categories.recurrence.map((x) => x.name) : ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Yearly']).map((x) => <option key={x} value={x}>{x}</option>)}</select></div><div><label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Intervalo</label><input type="number" min="1" value={recurringForm.interval} onChange={(e) => setRecurringForm((p) => ({ ...p, interval: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div><div><label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Inicio</label><input type="date" value={recurringForm.startDate} onChange={(e) => setRecurringForm((p) => ({ ...p, startDate: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div><div><label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Fin</label><input type="date" value={recurringForm.endDate} onChange={(e) => setRecurringForm((p) => ({ ...p, endDate: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div><div><label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Estado</label><select value={recurringForm.status} onChange={(e) => setRecurringForm((p) => ({ ...p, status: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">{['Active', 'Paused', 'Completed'].map((x) => <option key={x} value={x}>{x}</option>)}</select></div><div><label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Categoria</label><select value={recurringForm.category} onChange={(e) => setRecurringForm((p) => ({ ...p, category: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"><option value="">-</option>{categories.expenseCategories.map((x) => <option key={x.id} value={x.name}>{x.name}</option>)}</select></div><div><label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Metodo pago</label><select value={recurringForm.paymentMethod} onChange={(e) => setRecurringForm((p) => ({ ...p, paymentMethod: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"><option value="">-</option>{categories.paymentMethods.map((x) => <option key={x.id} value={x.name}>{x.name}</option>)}</select></div><div><label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Responsable</label><select value={recurringForm.ownerId} onChange={(e) => setRecurringForm((p) => ({ ...p, ownerId: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">{users.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div><div className="md:col-span-2"><label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Descripcion</label><textarea rows={3} value={recurringForm.description} onChange={(e) => setRecurringForm((p) => ({ ...p, description: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none" /></div></div><div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2"><button type="button" onClick={() => setRecurringModalOpen(false)} className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700">Cancelar</button><button type="submit" className="px-5 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-sm font-semibold text-white">Guardar</button></div></form></div></div>
      )}

      {rateModalOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4"><div className="absolute inset-0 bg-slate-900/50" onClick={() => setRateModalOpen(false)}></div><div className="relative bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-xl overflow-hidden"><form onSubmit={saveRate}><div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between"><h3 className="text-lg font-bold text-slate-900">{editingRate ? 'Editar tipo de cambio' : 'Nuevo tipo de cambio'}</h3><button type="button" onClick={() => setRateModalOpen(false)} className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-500"><i className="fa-solid fa-xmark"></i></button></div><div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4"><div><label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Base</label><select value={rateForm.baseCurrency} onChange={(e) => setRateForm((p) => ({ ...p, baseCurrency: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">{currencyOptions.map((x) => <option key={x} value={x}>{x}</option>)}</select></div><div><label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Moneda</label><select value={rateForm.quoteCurrency} onChange={(e) => setRateForm((p) => ({ ...p, quoteCurrency: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">{currencyOptions.map((x) => <option key={x} value={x}>{x}</option>)}</select></div><div><label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Tipo</label><input required type="number" step="0.000001" min="0" value={rateForm.rate} onChange={(e) => setRateForm((p) => ({ ...p, rate: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div><div><label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Fecha efectiva</label><input type="date" value={rateForm.effectiveDate} onChange={(e) => setRateForm((p) => ({ ...p, effectiveDate: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div><div className="md:col-span-2"><label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Fuente</label><input value={rateForm.source} onChange={(e) => setRateForm((p) => ({ ...p, source: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div></div><div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2"><button type="button" onClick={() => setRateModalOpen(false)} className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700">Cancelar</button><button type="submit" className="px-5 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-sm font-semibold text-white">Guardar</button></div></form></div></div>
      )}
    </div>
  );
};

export default ExpenseModule;
