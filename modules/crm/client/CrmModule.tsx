import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DragDropContext, Draggable, Droppable, DropResult } from '@hello-pangea/dnd';
import { AppUser, ViewType } from '@sinapsis/shared-types';

type CrmView = 'overview' | 'pipeline' | 'activities' | 'won';

interface CrmModuleProps {
  view: CrmView;
  setView: (view: ViewType) => void;
  currentUser?: AppUser;
  companyId?: string;
  onSubTitleChange?: (subtitle: string) => void;
}

interface UserItem {
  id: string;
  name: string;
  email: string;
  companyId?: string;
}

interface LeadItem {
  id: string;
  code: string;
  name: string;
  status: string;
  companyId?: string;
}

interface MetaItem {
  id: string;
  name: string;
}

interface CompanyItem {
  id: string;
  name: string;
}

interface OpportunityItem {
  id: string;
  code: string;
  title: string;
  clientId: string;
  clientCode?: string;
  clientName?: string;
  clientStatus?: string;
  companyId: string;
  ownerId: string;
  ownerName?: string;
  stage: string;
  status: string;
  source?: string;
  amount: number;
  probability: number;
  expectedCloseDate?: string | null;
  closedAt?: string | null;
  notes?: string;
}

interface ActivityItem {
  id: string;
  code: string;
  opportunityId: string;
  opportunityCode?: string;
  opportunityTitle?: string;
  companyId: string;
  clientId?: string;
  clientName?: string;
  title: string;
  type: string;
  status: string;
  dueDate?: string | null;
  completedAt?: string | null;
  details?: string;
  assignedToId: string;
  assignedToName?: string;
}

interface OverviewResponse {
  stats: {
    openOpportunities: number;
    pipelineValue: number;
    wonThisMonth: number;
    leadPool: number;
    overdueActivities: number;
  };
  byStage: { stage: string; count: number; value: number }[];
  upcomingActivities: ActivityItem[];
}

interface MetaResponse {
  users: UserItem[];
  leads: LeadItem[];
  categories: {
    opportunityStages: MetaItem[];
    opportunityStatuses: MetaItem[];
    activityTypes: MetaItem[];
    activityStatuses: MetaItem[];
  };
}

const DEFAULT_STAGES = ['Lead', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'];
const DEFAULT_OPP_STATUSES = ['Open', 'OnHold', 'Won', 'Lost', 'Archived'];
const DEFAULT_ACTIVITY_TYPES = ['Call', 'Email', 'Meeting', 'Task', 'Demo', 'FollowUp'];
const DEFAULT_ACTIVITY_STATUSES = ['Pending', 'Completed', 'Cancelled', 'Overdue'];

const CrmModule: React.FC<CrmModuleProps> = ({ view, currentUser, companyId, onSubTitleChange }) => {
  const { t, i18n } = useTranslation();
  const activeCompanyId = companyId || '';

  const [meta, setMeta] = useState<MetaResponse>({
    users: [],
    leads: [],
    categories: {
      opportunityStages: [],
      opportunityStatuses: [],
      activityTypes: [],
      activityStatuses: []
    }
  });

  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [opportunities, setOpportunities] = useState<OpportunityItem[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [overview, setOverview] = useState<OverviewResponse | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [opportunitySearch, setOpportunitySearch] = useState('');
  const [activitySearch, setActivitySearch] = useState('');
  const [opportunityOwnerFilter, setOpportunityOwnerFilter] = useState('');
  const [opportunityStatusFilter, setOpportunityStatusFilter] = useState('');
  const [activityAssignedToFilter, setActivityAssignedToFilter] = useState('');
  const [activityStatusFilter, setActivityStatusFilter] = useState('');

  const [opportunityModalOpen, setOpportunityModalOpen] = useState(false);
  const [editingOpportunity, setEditingOpportunity] = useState<OpportunityItem | null>(null);
  const [opportunityLeadMode, setOpportunityLeadMode] = useState<'existing' | 'new'>('existing');
  const [opportunityForm, setOpportunityForm] = useState({
    title: '',
    clientId: '',
    leadName: '',
    leadEmail: '',
    leadPhone: '',
    leadTaxId: '',
    ownerId: '',
    companyId: '',
    amount: '0',
    probability: '0',
    stage: DEFAULT_STAGES[0],
    status: DEFAULT_OPP_STATUSES[0],
    expectedCloseDate: '',
    source: '',
    notes: ''
  });

  const [activityModalOpen, setActivityModalOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<ActivityItem | null>(null);
  const [activityForm, setActivityForm] = useState({
    opportunityId: '',
    title: '',
    type: DEFAULT_ACTIVITY_TYPES[0],
    status: DEFAULT_ACTIVITY_STATUSES[0],
    dueDate: '',
    assignedToId: '',
    details: ''
  });

  const stageOptions = useMemo(
    () => (meta.categories.opportunityStages.map((x) => x.name).length ? meta.categories.opportunityStages.map((x) => x.name) : DEFAULT_STAGES),
    [meta.categories.opportunityStages]
  );

  const opportunityStatusOptions = useMemo(
    () => (meta.categories.opportunityStatuses.map((x) => x.name).length ? meta.categories.opportunityStatuses.map((x) => x.name) : DEFAULT_OPP_STATUSES),
    [meta.categories.opportunityStatuses]
  );

  const activityTypeOptions = useMemo(
    () => (meta.categories.activityTypes.map((x) => x.name).length ? meta.categories.activityTypes.map((x) => x.name) : DEFAULT_ACTIVITY_TYPES),
    [meta.categories.activityTypes]
  );

  const activityStatusOptions = useMemo(
    () => (meta.categories.activityStatuses.map((x) => x.name).length ? meta.categories.activityStatuses.map((x) => x.name) : DEFAULT_ACTIVITY_STATUSES),
    [meta.categories.activityStatuses]
  );

  const isCreateOpportunityMode = !editingOpportunity;
  const lockOpportunityToCurrentCompany = Boolean(companyId && isCreateOpportunityMode);

  const availableCompanies = useMemo(() => {
    if (!Array.isArray(companies) || companies.length === 0) return [];

    const allowed = new Set((currentUser?.accessCompanyIds || []).map((id) => String(id)));
    if (allowed.size === 0) return companies;

    return companies.filter((company) => allowed.has(company.id) || company.id === currentUser?.companyId);
  }, [companies, currentUser?.accessCompanyIds, currentUser?.companyId]);

  const currentCompanyName = useMemo(() => {
    if (!companyId) return '';
    return availableCompanies.find((c) => c.id === companyId)?.name || companyId;
  }, [availableCompanies, companyId]);

  const currencyFormatter = useMemo(() => {
    const lang = String(i18n.language || 'en').toLowerCase();
    const locale = lang.startsWith('es') ? 'es-AR' : 'en-US';
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2
    });
  }, [i18n.language]);

  const filteredOpportunities = useMemo(() => {
    return opportunities.filter((item) => {
      const matchesOwner = !opportunityOwnerFilter || String(item.ownerId || '') === String(opportunityOwnerFilter);
      const matchesStatus =
        !opportunityStatusFilter ||
        String(item.status || '').toLowerCase() === String(opportunityStatusFilter).toLowerCase();
      return matchesOwner && matchesStatus;
    });
  }, [opportunities, opportunityOwnerFilter, opportunityStatusFilter]);

  const filteredActivities = useMemo(() => {
    return activities.filter((item) => {
      const matchesAssignedTo = !activityAssignedToFilter || String(item.assignedToId || '') === String(activityAssignedToFilter);
      const matchesStatus =
        !activityStatusFilter ||
        String(item.status || '').toLowerCase() === String(activityStatusFilter).toLowerCase();
      return matchesAssignedTo && matchesStatus;
    });
  }, [activities, activityAssignedToFilter, activityStatusFilter]);

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
      if (activeCompanyId) params.set('companyId', activeCompanyId);
      if (currentUser?.id) params.set('userId', currentUser.id);

      const res = await fetch(`/api/crm/meta?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || t('crm.errorLoadMeta'));
      }

      const data: MetaResponse = await res.json();
      setMeta(data);
    } catch (e: any) {
      setError(e.message || t('crm.errorLoadMeta'));
    }
  };

  const loadOverview = async () => {
    try {
      const params = new URLSearchParams();
      if (activeCompanyId) params.set('companyId', activeCompanyId);

      const res = await fetch(`/api/crm/overview?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || t('crm.errorLoadOverview'));
      }

      const data: OverviewResponse = await res.json();
      setOverview(data);
    } catch (e: any) {
      setError(e.message || t('crm.errorLoadOverview'));
    }
  };

  const loadOpportunities = async () => {
    try {
      const params = new URLSearchParams();
      if (activeCompanyId) params.set('companyId', activeCompanyId);
      if (opportunitySearch.trim()) params.set('search', opportunitySearch.trim());

      const res = await fetch(`/api/crm/opportunities?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || t('crm.errorLoadOpportunities'));
      }

      const data: OpportunityItem[] = await res.json();
      setOpportunities(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e.message || t('crm.errorLoadOpportunities'));
    }
  };

  const loadActivities = async () => {
    try {
      const params = new URLSearchParams();
      if (activeCompanyId) params.set('companyId', activeCompanyId);
      if (activitySearch.trim()) params.set('search', activitySearch.trim());

      const res = await fetch(`/api/crm/activities?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || t('crm.errorLoadActivities'));
      }

      const data: ActivityItem[] = await res.json();
      setActivities(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e.message || t('crm.errorLoadActivities'));
    }
  };

  const refreshData = async () => {
    setLoading(true);
    setError('');
    try {
      await Promise.all([loadOverview(), loadOpportunities(), loadActivities()]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMeta();
    loadCompanies();
  }, [activeCompanyId, currentUser?.id]);

  useEffect(() => {
    refreshData();
  }, [activeCompanyId, opportunitySearch, activitySearch]);

  useEffect(() => {
    if (!onSubTitleChange) return;
    onSubTitleChange('');
  }, [view, onSubTitleChange]);

  const openCreateOpportunity = () => {
    setEditingOpportunity(null);
    setOpportunityLeadMode(meta.leads.length > 0 ? 'existing' : 'new');

    const defaultOpportunityCompanyId = String(companyId || currentUser?.companyId || availableCompanies[0]?.id || '').trim();

    setOpportunityForm({
      title: '',
      clientId: meta.leads[0]?.id || '',
      leadName: '',
      leadEmail: '',
      leadPhone: '',
      leadTaxId: '',
      ownerId: currentUser?.id || meta.users[0]?.id || '',
      companyId: defaultOpportunityCompanyId,
      amount: '0',
      probability: '0',
      stage: stageOptions[0] || 'Lead',
      status: opportunityStatusOptions[0] || 'Open',
      expectedCloseDate: '',
      source: '',
      notes: ''
    });
    setOpportunityModalOpen(true);
  };

  const openEditOpportunity = (item: OpportunityItem) => {
    setEditingOpportunity(item);
    setOpportunityLeadMode('existing');
    setOpportunityForm({
      title: item.title || '',
      clientId: item.clientId || '',
      leadName: '',
      leadEmail: '',
      leadPhone: '',
      leadTaxId: '',
      ownerId: item.ownerId || '',
      companyId: item.companyId || '',
      amount: String(item.amount || 0),
      probability: String(item.probability || 0),
      stage: item.stage || (stageOptions[0] || 'Lead'),
      status: item.status || (opportunityStatusOptions[0] || 'Open'),
      expectedCloseDate: item.expectedCloseDate ? String(item.expectedCloseDate).slice(0, 10) : '',
      source: item.source || '',
      notes: item.notes || ''
    });
    setOpportunityModalOpen(true);
  };

  const openCreateActivity = (opportunityId?: string) => {
    setEditingActivity(null);
    setActivityForm({
      opportunityId: opportunityId || opportunities[0]?.id || '',
      title: '',
      type: activityTypeOptions[0] || 'Task',
      status: activityStatusOptions[0] || 'Pending',
      dueDate: '',
      assignedToId: currentUser?.id || meta.users[0]?.id || '',
      details: ''
    });
    setActivityModalOpen(true);
  };

  const openEditActivity = (item: ActivityItem) => {
    setEditingActivity(item);
    setActivityForm({
      opportunityId: item.opportunityId || '',
      title: item.title || '',
      type: item.type || (activityTypeOptions[0] || 'Task'),
      status: item.status || (activityStatusOptions[0] || 'Pending'),
      dueDate: item.dueDate ? String(item.dueDate).slice(0, 16) : '',
      assignedToId: item.assignedToId || '',
      details: item.details || ''
    });
    setActivityModalOpen(true);
  };

  const promoteLeadToClient = async (clientId: string) => {
    if (!currentUser?.id || !clientId) return;

    const res = await fetch(`/api/clients/${clientId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Active', updatedById: currentUser.id })
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error || t('crm.errorConvertLead'));
    }
  };

  const createLeadFromOpportunityForm = async () => {
    if (!currentUser?.id) throw new Error(t('crm.errorAuthRequired'));

    const leadName = String(opportunityForm.leadName || '').trim();
    if (!leadName) throw new Error(t('crm.errorLeadNameRequired'));

    const leadCompanyId = String((lockOpportunityToCurrentCompany ? companyId : opportunityForm.companyId) || '').trim();
    if (!leadCompanyId) throw new Error(t('crm.errorCompanyRequired'));

    const leadPayload = {
      name: leadName,
      email: String(opportunityForm.leadEmail || '').trim() || null,
      phone: String(opportunityForm.leadPhone || '').trim() || null,
      taxId: String(opportunityForm.leadTaxId || '').trim() || null,
      type: 'Prospect',
      status: 'Lead',
      companyId: leadCompanyId,
      companyIds: [leadCompanyId],
      createdById: currentUser.id,
      updatedById: currentUser.id
    };

    const res = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(leadPayload)
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error || t('crm.errorCreateLead'));
    }

    const created = await res.json();
    return String(created?.id || '').trim();
  };

  const submitOpportunity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser?.id) {
      setError(t('crm.errorAuthRequired'));
      return;
    }

    try {
      let selectedClientId = String(opportunityForm.clientId || '').trim();

      if (!editingOpportunity && opportunityLeadMode === 'new') {
        selectedClientId = await createLeadFromOpportunityForm();
      }

      if (!selectedClientId) {
        throw new Error(t('crm.errorLeadRequired'));
      }

      const selectedOpportunityCompanyId = String((lockOpportunityToCurrentCompany ? companyId : opportunityForm.companyId) || '').trim();
      if (!selectedOpportunityCompanyId) {
        throw new Error(t('crm.errorCompanyRequired'));
      }

      const payload = {
        title: opportunityForm.title,
        clientId: selectedClientId,
        ownerId: opportunityForm.ownerId,
        amount: Number(opportunityForm.amount || 0),
        probability: Number(opportunityForm.probability || 0),
        stage: opportunityForm.stage,
        status: opportunityForm.status,
        expectedCloseDate: opportunityForm.expectedCloseDate || null,
        source: opportunityForm.source || null,
        notes: opportunityForm.notes || null,
        companyId: selectedOpportunityCompanyId,
        createdById: currentUser.id,
        updatedById: currentUser.id
      };

      const method = editingOpportunity ? 'PUT' : 'POST';
      const endpoint = editingOpportunity ? `/api/crm/opportunities/${editingOpportunity.id}` : '/api/crm/opportunities';

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || t('crm.errorSaveOpportunity'));
      }

      const savedOpportunity: OpportunityItem = await res.json();
      const isWonOpportunity = String(savedOpportunity?.status || opportunityForm.status || '').toLowerCase() === 'won'
        || String(savedOpportunity?.stage || opportunityForm.stage || '').toLowerCase() === 'won';
      if (isWonOpportunity) {
        await promoteLeadToClient(savedOpportunity.clientId || selectedClientId);
      }

      setOpportunityModalOpen(false);
      await loadMeta();
      await refreshData();
    } catch (e: any) {
      setError(e.message || t('crm.errorSaveOpportunity'));
    }
  };

  const submitActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser?.id) {
      setError(t('crm.errorAuthRequired'));
      return;
    }

    try {
      const payload = {
        opportunityId: activityForm.opportunityId,
        title: activityForm.title,
        type: activityForm.type,
        status: activityForm.status,
        dueDate: activityForm.dueDate || null,
        assignedToId: activityForm.assignedToId,
        details: activityForm.details || null,
        companyId: activeCompanyId || undefined,
        createdById: currentUser.id,
        updatedById: currentUser.id
      };

      const method = editingActivity ? 'PUT' : 'POST';
      const endpoint = editingActivity ? `/api/crm/activities/${editingActivity.id}` : '/api/crm/activities';

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || t('crm.errorSaveActivity'));
      }

      setActivityModalOpen(false);
      await refreshData();
    } catch (e: any) {
      setError(e.message || t('crm.errorSaveActivity'));
    }
  };

  const moveOpportunity = async (item: OpportunityItem, payload: { stage?: string; status?: string }) => {
    if (!currentUser?.id) throw new Error(t('crm.errorAuthRequired'));

    const res = await fetch(`/api/crm/opportunities/${item.id}/move`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, updatedById: currentUser.id })
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error || t('crm.errorUpdateOpportunity'));
    }

    const updated: OpportunityItem = await res.json();
    const won = String(updated.status || '').toLowerCase() === 'won' || String(updated.stage || '').toLowerCase() === 'won';
    if (won) {
      await promoteLeadToClient(updated.clientId || item.clientId);
    }

    await loadMeta();
    await refreshData();
  };

  const patchOpportunityStage = async (item: OpportunityItem, stage: string) => {
    try {
      await moveOpportunity(item, { stage });
    } catch (e: any) {
      setError(e.message || t('crm.errorUpdateOpportunity'));
    }
  };

  const patchOpportunityStatus = async (item: OpportunityItem, status: string) => {
    try {
      await moveOpportunity(item, { status });
    } catch (e: any) {
      setError(e.message || t('crm.errorUpdateOpportunity'));
    }
  };

  const handlePipelineDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;

    const sourceStage = String(source.droppableId || '');
    const targetStage = String(destination.droppableId || '');
    if (!targetStage || sourceStage === targetStage) return;

    const dragged = opportunities.find((item) => item.id === draggableId);
    if (!dragged) return;

    const nextStatus = (() => {
      const target = targetStage.toLowerCase();
      if (target === 'won') return 'Won';
      if (target === 'lost') return 'Lost';
      const current = String(dragged.status || '').toLowerCase();
      if (current === 'won' || current === 'lost' || current === 'archived') return 'Open';
      return dragged.status || 'Open';
    })();

    setOpportunities((prev) => prev.map((item) => (
      item.id === dragged.id
        ? { ...item, stage: targetStage, status: nextStatus }
        : item
    )));

    try {
      await moveOpportunity(dragged, { stage: targetStage });
    } catch (e: any) {
      setError(e.message || t('crm.errorUpdateOpportunity'));
      await refreshData();
    }
  };

  const archiveOpportunity = async (id: string) => {
    if (!currentUser?.id) return setError(t('crm.errorAuthRequired'));
    if (!confirm(t('crm.archiveOpportunityConfirm'))) return;

    try {
      const res = await fetch(`/api/crm/opportunities/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updatedById: currentUser.id })
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || t('crm.errorDeleteOpportunity'));
      }

      await refreshData();
    } catch (e: any) {
      setError(e.message || t('crm.errorDeleteOpportunity'));
    }
  };

  const patchActivityStatus = async (id: string, status: string) => {
    if (!currentUser?.id) return setError(t('crm.errorAuthRequired'));

    try {
      const res = await fetch(`/api/crm/activities/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, updatedById: currentUser.id })
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || t('crm.errorUpdateActivity'));
      }

      await refreshData();
    } catch (e: any) {
      setError(e.message || t('crm.errorUpdateActivity'));
    }
  };

  const cancelActivity = async (id: string) => {
    if (!currentUser?.id) return setError(t('crm.errorAuthRequired'));
    if (!confirm(t('crm.cancelActivityConfirm'))) return;

    try {
      const res = await fetch(`/api/crm/activities/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updatedById: currentUser.id })
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || t('crm.errorDeleteActivity'));
      }

      await refreshData();
    } catch (e: any) {
      setError(e.message || t('crm.errorDeleteActivity'));
    }
  };

  const pipelineOpportunities = filteredOpportunities.filter((item) => !['won', 'lost', 'archived'].includes(String(item.status || '').toLowerCase()));
  const wonOpportunities = filteredOpportunities.filter((item) => String(item.status || '').toLowerCase() === 'won');

  const pipelineByStage = stageOptions.reduce((acc, stage) => {
    acc[stage] = pipelineOpportunities.filter((item) => String(item.stage || '') === stage);
    return acc;
  }, {} as Record<string, OpportunityItem[]>);

  const titleByView: Record<CrmView, string> = {
    overview: t('crm.overview'),
    pipeline: t('crm.pipeline'),
    activities: t('crm.activities'),
    won: t('crm.wonDeals')
  };

  const selectedLeadMap = new Map(meta.leads.map((lead) => [lead.id, lead]));

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 px-1">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{t('crm.title')} - {titleByView[view]}</h1>
          <p className="text-sm text-slate-500 mt-1 font-medium">{t('crm.description')}</p>
        </div>

        <div className="w-full sm:w-auto">
          {(view === 'pipeline' || view === 'won') && (
            <button
              onClick={openCreateOpportunity}
              className="w-full sm:w-auto px-6 py-3 bg-red-500 hover:bg-red-600 active:scale-[0.98] transition-all text-white rounded-xl text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2"
            >
              <i className="fa-solid fa-plus"></i>
              {t('crm.newOpportunity')}
            </button>
          )}

          {view === 'activities' && (
            <button
              onClick={() => openCreateActivity()}
              className="w-full sm:w-auto px-6 py-3 bg-red-500 hover:bg-red-600 active:scale-[0.98] transition-all text-white rounded-xl text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2"
            >
              <i className="fa-solid fa-plus"></i>
              {t('crm.newActivity')}
            </button>
          )}
        </div>
      </div>

      {(view === 'pipeline' || view === 'won' || view === 'activities') && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center gap-3">
          {(view === 'pipeline' || view === 'won') && (
            <div className="flex-1 flex flex-col sm:flex-row items-center gap-3">
              <div className="relative w-full sm:flex-1">
                <i className="fa-solid fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
                <input
                  value={opportunitySearch}
                  onChange={(e) => setOpportunitySearch(e.target.value)}
                  placeholder={t('crm.searchOpportunities')}
                  className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-medium transition-all focus:ring-4 focus:ring-red-500/5 focus:border-red-500/40 outline-none placeholder:text-slate-400"
                />
              </div>

              <div className="relative w-full sm:w-56">
                <i className="fa-solid fa-user absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
                <select
                  value={opportunityOwnerFilter}
                  onChange={(e) => setOpportunityOwnerFilter(e.target.value)}
                  className="w-full pl-11 pr-10 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 appearance-none transition-all focus:ring-4 focus:ring-red-500/5 focus:border-red-500/40 outline-none cursor-pointer"
                >
                  <option value="">{t('crm.allOwners')}</option>
                  {meta.users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                </select>
                <i className="fa-solid fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] pointer-events-none"></i>
              </div>

              <div className="relative w-full sm:w-56">
                <i className="fa-solid fa-filter absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
                <select
                  value={opportunityStatusFilter}
                  onChange={(e) => setOpportunityStatusFilter(e.target.value)}
                  className="w-full pl-11 pr-10 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 appearance-none transition-all focus:ring-4 focus:ring-red-500/5 focus:border-red-500/40 outline-none cursor-pointer"
                >
                  <option value="">{t('crm.allStatuses')}</option>
                  {opportunityStatusOptions.map((statusOpt) => <option key={statusOpt} value={statusOpt}>{statusOpt}</option>)}
                </select>
                <i className="fa-solid fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] pointer-events-none"></i>
              </div>
            </div>
          )}

          {view === 'activities' && (
            <div className="flex-1 flex flex-col sm:flex-row items-center gap-3">
              <div className="relative w-full sm:flex-1">
                <i className="fa-solid fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
                <input
                  value={activitySearch}
                  onChange={(e) => setActivitySearch(e.target.value)}
                  placeholder={t('crm.searchActivities')}
                  className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-medium transition-all focus:ring-4 focus:ring-red-500/5 focus:border-red-500/40 outline-none placeholder:text-slate-400"
                />
              </div>

              <div className="relative w-full sm:w-56">
                <i className="fa-solid fa-user absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
                <select
                  value={activityAssignedToFilter}
                  onChange={(e) => setActivityAssignedToFilter(e.target.value)}
                  className="w-full pl-11 pr-10 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 appearance-none transition-all focus:ring-4 focus:ring-red-500/5 focus:border-red-500/40 outline-none cursor-pointer"
                >
                  <option value="">{t('crm.allOwners')}</option>
                  {meta.users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                </select>
                <i className="fa-solid fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] pointer-events-none"></i>
              </div>

              <div className="relative w-full sm:w-56">
                <i className="fa-solid fa-filter absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
                <select
                  value={activityStatusFilter}
                  onChange={(e) => setActivityStatusFilter(e.target.value)}
                  className="w-full pl-11 pr-10 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 appearance-none transition-all focus:ring-4 focus:ring-red-500/5 focus:border-red-500/40 outline-none cursor-pointer"
                >
                  <option value="">{t('crm.allStatuses')}</option>
                  {activityStatusOptions.map((statusOpt) => <option key={statusOpt} value={statusOpt}>{statusOpt}</option>)}
                </select>
                <i className="fa-solid fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] pointer-events-none"></i>
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl text-sm font-medium">{error}</div>
      )}

      {loading && <div className="text-sm text-slate-500">{t('crm.loading')}</div>}

      {!loading && view === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <p className="text-xs text-slate-500">{t('crm.totalOpen')}</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{overview?.stats.openOpportunities || 0}</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <p className="text-xs text-slate-500">{t('crm.pipelineValue')}</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{currencyFormatter.format(overview?.stats.pipelineValue || 0)}</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <p className="text-xs text-slate-500">{t('crm.wonThisMonth')}</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">{currencyFormatter.format(overview?.stats.wonThisMonth || 0)}</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <p className="text-xs text-slate-500">{t('crm.leadPool')}</p>
              <p className="text-2xl font-bold text-indigo-600 mt-1">{overview?.stats.leadPool || 0}</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <p className="text-xs text-slate-500">{t('crm.overdueActivities')}</p>
              <p className="text-2xl font-bold text-amber-600 mt-1">{overview?.stats.overdueActivities || 0}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="xl:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 mb-4">{t('crm.byStage')}</h3>
              <div className="space-y-3">
                {(overview?.byStage || []).map((row) => {
                  const total = Math.max(overview?.stats.openOpportunities || 1, 1);
                  const width = Math.max(4, Math.round((row.count / total) * 100));
                  return (
                    <div key={row.stage}>
                      <div className="flex justify-between text-xs font-semibold text-slate-600 mb-1">
                        <span>{row.stage}</span>
                        <span>{row.count} - {currencyFormatter.format(row.value || 0)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full bg-red-500 rounded-full" style={{ width: `${width}%` }}></div>
                      </div>
                    </div>
                  );
                })}
                {(overview?.byStage || []).length === 0 && (
                  <div className="text-xs text-slate-400">{t('crm.noOpportunities')}</div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 mb-4">{t('crm.upcomingActivities')}</h3>
              <div className="space-y-3">
                {(overview?.upcomingActivities || []).map((item) => (
                  <button
                    key={item.id}
                    className="w-full text-left rounded-xl border border-slate-200 p-3 hover:bg-slate-50"
                    onClick={() => {
                      setActivitySearch(item.code || '');
                    }}
                  >
                    <p className="text-[11px] text-red-600 font-mono">{item.code}</p>
                    <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                    <p className="text-xs text-slate-500">{item.opportunityCode} - {item.clientName}</p>
                    <p className="text-[11px] text-slate-400 mt-1">{item.dueDate ? new Date(item.dueDate).toLocaleString() : '-'}</p>
                  </button>
                ))}
                {(overview?.upcomingActivities || []).length === 0 && (
                  <div className="text-xs text-slate-400">{t('crm.noUpcomingActivities')}</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {!loading && view === 'pipeline' && (
        <DragDropContext onDragEnd={handlePipelineDragEnd}>
          <div className="overflow-x-auto pb-2">
            <div className="flex gap-4 min-w-[980px]">
              {stageOptions.map((stage) => (
                <Droppable key={stage} droppableId={stage}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`w-[320px] border rounded-2xl p-3 transition-all ${
                        snapshot.isDraggingOver
                          ? 'border-red-300 bg-red-50/60 ring-2 ring-red-100'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="mb-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">{stage}</h3>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-500">{pipelineByStage[stage]?.length || 0}</span>
                        </div>
                        <p className="mt-1 text-[12px] font-semibold text-slate-700">
                          {currencyFormatter.format((pipelineByStage[stage] || []).reduce((sum, item) => sum + Number(item.amount || 0), 0))}
                        </p>
                      </div>

                      <div className="space-y-3 min-h-8">
                        {(pipelineByStage[stage] || []).map((item, index) => {
                          return (
                            <Draggable key={item.id} draggableId={item.id} index={index}>
                              {(dragProvided, dragSnapshot) => (
                                <div
                                  ref={dragProvided.innerRef}
                                  {...dragProvided.draggableProps}
                                  {...dragProvided.dragHandleProps}
                                  className={`bg-white border border-slate-200 rounded-xl p-3 space-y-2 transition-all cursor-grab active:cursor-grabbing ${
                                    dragSnapshot.isDragging
                                      ? 'shadow-xl shadow-red-100/70 rotate-[0.4deg] ring-2 ring-red-200'
                                      : 'shadow-sm'
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div>
                                      <p className="text-[11px] text-red-600 font-mono">{item.code}</p>
                                      <p className="text-sm font-bold text-slate-900">{item.title}</p>
                                      <p className="text-xs text-slate-500">{item.clientCode} - {item.clientName}</p>
                                    </div>
                                    <span className="w-7 h-7 shrink-0 rounded-md bg-slate-100 text-slate-500 grid place-items-center cursor-grab active:cursor-grabbing"><i className="fa-solid fa-grip-vertical text-xs"></i></span>
                                  </div>

                                  <div className="flex items-center justify-end text-[11px]">
                                    <span className="font-semibold text-slate-700">{currencyFormatter.format(item.amount || 0)}</span>
                                  </div>

                                  <div className="flex gap-1.5">
                                    <button title={t('crm.newActivity')} aria-label={t('crm.newActivity')} onClick={() => openCreateActivity(item.id)} className="w-8 h-8 rounded-md bg-slate-100 text-slate-500 hover:bg-red-500 hover:text-white"><i className="fa-solid fa-calendar-plus text-xs"></i></button>
                                    <button onClick={() => openEditOpportunity(item)} className="w-8 h-8 rounded-md bg-slate-100 text-slate-500 hover:bg-red-500 hover:text-white"><i className="fa-solid fa-pen text-xs"></i></button>
                                    <button onClick={() => archiveOpportunity(item.id)} className="w-8 h-8 rounded-md bg-slate-100 text-slate-500 hover:bg-rose-500 hover:text-white"><i className="fa-solid fa-trash text-xs"></i></button>
                                  </div>
                                </div>
                              )}
                            </Draggable>
                          );
                        })}

                        {provided.placeholder}

                        {(pipelineByStage[stage] || []).length === 0 && (
                          <div className="text-xs text-slate-400 text-center py-6">{t('crm.noOpportunities')}</div>
                        )}
                      </div>
                    </div>
                  )}
                </Droppable>
              ))}
            </div>
          </div>
        </DragDropContext>
      )}
      {!loading && view === 'won' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-left min-w-[860px]">
            <thead className="bg-table-header border-b border-foreground/10">
              <tr>
                {[t('crm.opportunity'), t('crm.client'), t('crm.owner'), t('crm.amount'), t('crm.expectedCloseDate'), t('crm.actions')].map((h) => (
                  <th key={h} className="px-5 py-3 text-[10px] uppercase tracking-widest text-table-header-foreground font-bold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {wonOpportunities.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-sm text-slate-400">{t('crm.noOpportunities')}</td>
                </tr>
              )}
              {wonOpportunities.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/70">
                  <td className="px-5 py-4">
                    <p className="text-sm font-bold text-slate-900">{item.title}</p>
                    <p className="text-xs text-red-600 font-mono">{item.code}</p>
                  </td>
                  <td className="px-5 py-4 text-xs text-slate-600">{item.clientName}</td>
                  <td className="px-5 py-4 text-xs text-slate-600">{item.ownerName}</td>
                  <td className="px-5 py-4 text-xs font-semibold text-emerald-600">{currencyFormatter.format(item.amount || 0)}</td>
                  <td className="px-5 py-4 text-xs text-slate-500">{item.expectedCloseDate ? new Date(item.expectedCloseDate).toLocaleDateString() : '-'}</td>
                  <td className="px-5 py-4">
                    <div className="flex gap-2">
                      <button onClick={() => openEditOpportunity(item)} className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 hover:bg-red-500 hover:text-white"><i className="fa-solid fa-pen text-xs"></i></button>
                      <button onClick={() => archiveOpportunity(item.id)} className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 hover:bg-rose-500 hover:text-white"><i className="fa-solid fa-trash text-xs"></i></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && view === 'activities' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-left min-w-[960px]">
            <thead className="bg-table-header border-b border-foreground/10">
              <tr>
                {[t('crm.activity'), t('crm.activityForOpportunity'), t('crm.assignedTo'), t('crm.dueDate'), t('crm.status'), t('crm.actions')].map((h) => (
                  <th key={h} className="px-5 py-3 text-[10px] uppercase tracking-widest text-table-header-foreground font-bold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredActivities.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-sm text-slate-400">{t('crm.noActivities')}</td>
                </tr>
              )}
              {filteredActivities.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/70">
                  <td className="px-5 py-4">
                    <p className="text-sm font-bold text-slate-900">{item.title}</p>
                    <p className="text-xs text-red-600 font-mono">{item.code} - {item.type}</p>
                  </td>
                  <td className="px-5 py-4 text-xs text-slate-600">{item.opportunityCode} - {item.clientName}</td>
                  <td className="px-5 py-4 text-xs text-slate-600">{item.assignedToName}</td>
                  <td className="px-5 py-4 text-xs text-slate-500">{item.dueDate ? new Date(item.dueDate).toLocaleString() : '-'}</td>
                  <td className="px-5 py-4">
                    <select
                      value={item.status}
                      onChange={(e) => patchActivityStatus(item.id, e.target.value)}
                      className="px-2 py-1.5 border border-slate-200 rounded-md text-xs"
                    >
                      {activityStatusOptions.map((statusOpt) => <option key={statusOpt} value={statusOpt}>{statusOpt}</option>)}
                    </select>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex gap-2">
                      <button onClick={() => openEditActivity(item)} className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 hover:bg-red-500 hover:text-white"><i className="fa-solid fa-pen text-xs"></i></button>
                      <button onClick={() => cancelActivity(item.id)} className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 hover:bg-rose-500 hover:text-white"><i className="fa-solid fa-trash text-xs"></i></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {opportunityModalOpen && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setOpportunityModalOpen(false)}></div>
          <div className="relative bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-3xl overflow-hidden">
            <form onSubmit={submitOpportunity}>
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900">{editingOpportunity ? t('crm.editOpportunity') : t('crm.newOpportunity')}</h3>
                <button type="button" onClick={() => setOpportunityModalOpen(false)} className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-500"><i className="fa-solid fa-xmark"></i></button>
              </div>

              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[70vh] overflow-y-auto">
                <div className="md:col-span-2">
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('crm.titleLabel')}</label>
                  <input required value={opportunityForm.title} onChange={(e) => setOpportunityForm((p) => ({ ...p, title: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('crm.client')}</label>

                  {!editingOpportunity && (
                    <div className="mt-1 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
                      <button
                        type="button"
                        onClick={() => setOpportunityLeadMode('existing')}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-md ${opportunityLeadMode === 'existing' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
                      >
                        {t('crm.existingLead')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setOpportunityLeadMode('new')}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-md ${opportunityLeadMode === 'new' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
                      >
                        {t('crm.newLead')}
                      </button>
                    </div>
                  )}

                  {(editingOpportunity || opportunityLeadMode === 'existing') && (
                    <select
                      required
                      value={opportunityForm.clientId}
                      onChange={(e) => setOpportunityForm((p) => ({ ...p, clientId: e.target.value }))}
                      className="mt-2 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    >
                      <option value="">-</option>
                      {meta.leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.code} - {lead.name}</option>)}
                      {opportunities.filter((item) => !selectedLeadMap.has(item.clientId)).map((item) => (
                        <option key={item.clientId} value={item.clientId}>{item.clientCode} - {item.clientName}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('crm.company')}</label>
                  {lockOpportunityToCurrentCompany && (
                    <input
                      value={currentCompanyName || String(companyId || '')}
                      readOnly
                      className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50"
                    />
                  )}

                  {!lockOpportunityToCurrentCompany && (
                    <select
                      required
                      value={opportunityForm.companyId}
                      onChange={(e) => setOpportunityForm((p) => ({ ...p, companyId: e.target.value }))}
                      className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    >
                      <option value="">{t('crm.selectCompany')}</option>
                      {availableCompanies.map((company) => (
                        <option key={company.id} value={company.id}>{company.name}</option>
                      ))}
                      {opportunityForm.companyId && !availableCompanies.some((company) => company.id === opportunityForm.companyId) && (
                        <option value={opportunityForm.companyId}>{opportunityForm.companyId}</option>
                      )}
                    </select>
                  )}
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('crm.owner')}</label>
                  <select required value={opportunityForm.ownerId} onChange={(e) => setOpportunityForm((p) => ({ ...p, ownerId: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
                    <option value="">-</option>
                    {meta.users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                  </select>
                </div>

                {!editingOpportunity && opportunityLeadMode === 'new' && (
                  <>
                    <div>
                      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('crm.leadName')}</label>
                      <input
                        required
                        value={opportunityForm.leadName}
                        onChange={(e) => setOpportunityForm((p) => ({ ...p, leadName: e.target.value }))}
                        className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('crm.leadEmail')}</label>
                      <input
                        type="email"
                        value={opportunityForm.leadEmail}
                        onChange={(e) => setOpportunityForm((p) => ({ ...p, leadEmail: e.target.value }))}
                        className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('crm.leadPhone')}</label>
                      <input
                        value={opportunityForm.leadPhone}
                        onChange={(e) => setOpportunityForm((p) => ({ ...p, leadPhone: e.target.value }))}
                        className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('crm.leadTaxId')}</label>
                      <input
                        value={opportunityForm.leadTaxId}
                        onChange={(e) => setOpportunityForm((p) => ({ ...p, leadTaxId: e.target.value }))}
                        className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('crm.amount')}</label>
                  <input type="number" min={0} step="0.01" value={opportunityForm.amount} onChange={(e) => setOpportunityForm((p) => ({ ...p, amount: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('crm.probability')}</label>
                  <input type="number" min={0} max={100} value={opportunityForm.probability} onChange={(e) => setOpportunityForm((p) => ({ ...p, probability: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('crm.stage')}</label>
                  <select value={opportunityForm.stage} onChange={(e) => setOpportunityForm((p) => ({ ...p, stage: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
                    {stageOptions.map((stageOpt) => <option key={stageOpt} value={stageOpt}>{stageOpt}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('crm.status')}</label>
                  <select value={opportunityForm.status} onChange={(e) => setOpportunityForm((p) => ({ ...p, status: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
                    {opportunityStatusOptions.map((statusOpt) => <option key={statusOpt} value={statusOpt}>{statusOpt}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('crm.expectedCloseDate')}</label>
                  <input type="date" value={opportunityForm.expectedCloseDate} onChange={(e) => setOpportunityForm((p) => ({ ...p, expectedCloseDate: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('crm.source')}</label>
                  <input value={opportunityForm.source} onChange={(e) => setOpportunityForm((p) => ({ ...p, source: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                </div>

                <div className="md:col-span-2">
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('crm.notes')}</label>
                  <textarea value={opportunityForm.notes} onChange={(e) => setOpportunityForm((p) => ({ ...p, notes: e.target.value }))} rows={4} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none" />
                </div>
              </div>

              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
                <button type="button" onClick={() => setOpportunityModalOpen(false)} className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700">{t('crm.cancel')}</button>
                <button type="submit" className="px-5 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-sm font-semibold text-white">{editingOpportunity ? t('crm.save') : t('crm.create')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activityModalOpen && (
        <div className="fixed inset-0 z-[96] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setActivityModalOpen(false)}></div>
          <div className="relative bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden">
            <form onSubmit={submitActivity}>
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900">{editingActivity ? t('crm.editActivity') : t('crm.newActivity')}</h3>
                <button type="button" onClick={() => setActivityModalOpen(false)} className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-500"><i className="fa-solid fa-xmark"></i></button>
              </div>

              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[70vh] overflow-y-auto">
                <div className="md:col-span-2">
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('crm.activityForOpportunity')}</label>
                  <select required value={activityForm.opportunityId} onChange={(e) => setActivityForm((p) => ({ ...p, opportunityId: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
                    <option value="">-</option>
                    {opportunities.filter((item) => String(item.status || '').toLowerCase() !== 'archived').map((item) => (
                      <option key={item.id} value={item.id}>{item.code} - {item.title}</option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('crm.titleLabel')}</label>
                  <input required value={activityForm.title} onChange={(e) => setActivityForm((p) => ({ ...p, title: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('crm.type')}</label>
                  <select value={activityForm.type} onChange={(e) => setActivityForm((p) => ({ ...p, type: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
                    {activityTypeOptions.map((typeOpt) => <option key={typeOpt} value={typeOpt}>{typeOpt}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('crm.status')}</label>
                  <select value={activityForm.status} onChange={(e) => setActivityForm((p) => ({ ...p, status: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
                    {activityStatusOptions.map((statusOpt) => <option key={statusOpt} value={statusOpt}>{statusOpt}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('crm.dueDate')}</label>
                  <input type="datetime-local" value={activityForm.dueDate} onChange={(e) => setActivityForm((p) => ({ ...p, dueDate: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('crm.assignedTo')}</label>
                  <select required value={activityForm.assignedToId} onChange={(e) => setActivityForm((p) => ({ ...p, assignedToId: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
                    <option value="">-</option>
                    {meta.users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{t('crm.details')}</label>
                  <textarea value={activityForm.details} onChange={(e) => setActivityForm((p) => ({ ...p, details: e.target.value }))} rows={4} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none" />
                </div>
              </div>

              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
                <button type="button" onClick={() => setActivityModalOpen(false)} className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700">{t('crm.cancel')}</button>
                <button type="submit" className="px-5 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-sm font-semibold text-white">{editingActivity ? t('crm.save') : t('crm.create')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CrmModule;

























