import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import UserManagement from './UserManagement';
import RoleManagement from './RoleManagement';
import ModuleManagement from './ModuleManagement';
import ReferenceManagement from './ReferenceManagement';
import CompaniesSettingsTable from './settings/CompaniesSettingsTable';
import CategoriesSettingsTable from './settings/CategoriesSettingsTable';
import LanguagesSettingsTable from './settings/LanguagesSettingsTable';
import CompanyProfile from './CompanyProfile';
import MenuManagement from './MenuManagement';
import { SYSTEM_LANGUAGES } from '../types';
import { ModuleClientDefinition } from '../modules/module-contract';

interface Company {
    id: string;
    code: string;
    fullreference?: string;
    name: string;
    description: string;
    city: string;
    state: string;
    country: string;
    website: string;
    vatCode: string;
    notes: string;
    status: 'Active' | 'Inactive';
    language: string;
    dateFormat: string;
    timeFormat: string;
    timezone: string;
    baseCurrency: string;
    moneyFormat: string;
    currencyPosition: string;
    defaultLanguage: string;
    type: string;
    category: string;
    organizationId: string;
    email: string;
    phone: string;
    logoUrl?: string;
    address: string;
    zipcode: string;
}

interface Language {
    id: string;
    name: string;
    code: string;
    status: 'Active' | 'Inactive';
}

interface PaymentGateway {
    id: string;
    name: string;
    type: string;
    status: 'Live' | 'Sandbox' | 'Inactive';
}

interface Category {
    id: string;
    code: string;
    name: string;
    description: string;
    module: string;
    status: 'Active' | 'Inactive';
    sortingRule: 'Manual' | 'Alpha_ASC' | 'Alpha_DESC';
    _count?: { items: number };
}

interface CategoryItem {
    id: string;
    code: string;
    name: string;
    description: string;
    status: 'Active' | 'Inactive';
    sortOrder: number;
    categoryId: string;
    organizationId?: string | null;
    companyId?: string | null;
    isSystem?: boolean;
}

interface SettingsModuleProps {
    view: 'Organization' | 'MyPlan' | 'Companies' | 'SMTP' | 'Languages' | 'Backup' | 'Payments' | 'Users' | 'Categories' | 'References' | 'RoleSettings' | 'ModuleSettings' | 'Storage' | 'Menus';
    onSubTitleChange?: (subtitle: string) => void;
    companyFilter?: string;
    clientModules?: ModuleClientDefinition[];
    activeModuleCodes?: string[];
}

const SettingsModule: React.FC<SettingsModuleProps> = ({ view, onSubTitleChange, companyFilter, clientModules = [], activeModuleCodes = [] }) => {
    const { t } = useTranslation();

    // Organization State
    const [orgData, setOrgData] = useState({
        name: '',
        taxId: '',
        email: '',
        address: '',
        addressAdditional: '',
        zipcode: '',
        city: '',
        state: '',
        country: '',
        website: '',
        dateFormat: 'YYYY/MM/DD',
        timeFormat: 'HH:mm',
        timezone: 'UTC',
        baseCurrency: 'USD',
        moneyFormat: '1,234.56',
        currencyPosition: 'Prefix',
        defaultLanguage: 'English'
    });

    const [baseCurrencies, setBaseCurrencies] = useState<CategoryItem[]>([]);
    const [timezoneSearch, setTimezoneSearch] = useState('');
    const [isTimezoneOpen, setIsTimezoneOpen] = useState(false);
    const timezoneDropdownRef = useRef<HTMLDivElement>(null);

    type SubscriptionPlanDto = {
        id: string;
        code: string;
        name: string;
        description: string | null;
        status: string;
        sortOrder: number;
        billingPeriod: string;
        priceCents: number;
        currency: string;
        trialDays: number;
        badgeLabel: string | null;
        maxUsers: number | null;
        maxCompanies: number | null;
        maxStorageMb: number | null;
        maxApiCallsPerDay: number | null;
        features: unknown;
    };

    const [myPlanCurrent, setMyPlanCurrent] = useState<SubscriptionPlanDto | null>(null);
    const [myPlanCatalog, setMyPlanCatalog] = useState<SubscriptionPlanDto[]>([]);
    const [myPlanSelectedId, setMyPlanSelectedId] = useState('');
    const [myPlanLoading, setMyPlanLoading] = useState(false);
    const [myPlanError, setMyPlanError] = useState<string | null>(null);
    const [myPlanSaving, setMyPlanSaving] = useState(false);
    const [myPlanNotice, setMyPlanNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    // Storage State
    const [storageData, setStorageData] = useState({
        provider: 'Local',
        settings: {} as any
    });

    useEffect(() => {
        if (view !== 'MyPlan') return;
        let cancelled = false;
        setMyPlanLoading(true);
        setMyPlanError(null);
        setMyPlanNotice(null);
        void Promise.all([fetch('/api/subscription-plans/me'), fetch('/api/subscription-plans/catalog')])
            .then(async ([meRes, catRes]) => {
                if (cancelled) return;
                if (!meRes.ok) {
                    const err = await meRes.json().catch(() => ({}));
                    throw new Error(String((err as { error?: string })?.error || t('settings.myPlanLoadError')));
                }
                const meJson = (await meRes.json()) as { plan?: SubscriptionPlanDto | null };
                const catJson = catRes.ok ? ((await catRes.json()) as SubscriptionPlanDto[]) : [];
                const plan = meJson.plan || null;
                setMyPlanCurrent(plan);
                setMyPlanSelectedId(plan?.id || '');
                setMyPlanCatalog(Array.isArray(catJson) ? catJson : []);
            })
            .catch((e: unknown) => {
                if (!cancelled) {
                    setMyPlanError(e instanceof Error ? e.message : t('settings.myPlanLoadError'));
                    setMyPlanCurrent(null);
                    setMyPlanCatalog([]);
                }
            })
            .finally(() => {
                if (!cancelled) setMyPlanLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [view, t]);

    useEffect(() => {
        if (view === 'Organization' || view === 'Storage') {
            fetch('/api/organization')
                .then(res => {
                    if (res.ok) return res.json();
                    throw new Error('Not found');
                })
                .then(data => {
                    if (data) {
                        setOrgData({
                            name: data.name || '',
                            taxId: data.taxId || '',
                            email: data.email || '',
                            address: data.address || '',
                            addressAdditional: data.addressAdditional || '',
                            zipcode: data.zipcode || '',
                            city: data.city || '',
                            state: data.state || '',
                            country: data.country || '',
                            website: data.website || '',
                            dateFormat: data.dateFormat || 'YYYY/MM/DD',
                            timeFormat: data.timeFormat || 'HH:mm',
                            timezone: data.timezone || 'UTC',
                            baseCurrency: data.baseCurrency || 'USD',
                            moneyFormat: data.moneyFormat || '1,234.56',
                            currencyPosition: data.currencyPosition || 'Prefix',
                            defaultLanguage: data.defaultLanguage || 'English'
                        });
                        setStorageData({
                            provider: data.storageProvider || 'Local',
                            settings: data.storageSettings || {}
                        });
                    }
                })
                .catch(err => console.error(err));
        }

        if (view === 'Organization') {
            const catQs = companyFilter ? `?companyId=${encodeURIComponent(companyFilter)}&` : '?';
            fetch(`/api/categories${catQs}t=${Date.now()}`)
                .then(res => res.ok ? res.json() : [])
                .then((cats: Category[]) => {
                    const currencyCategory = cats.find(c => c.code === 'BASE_CURRENCY');
                    if (!currencyCategory) {
                        setBaseCurrencies([]);
                        return;
                    }

                    const itemQs = companyFilter
                        ? `?companyId=${encodeURIComponent(companyFilter)}&t=${Date.now()}`
                        : `?t=${Date.now()}`;
                    fetch(`/api/categories/${currencyCategory.id}${itemQs}`)
                        .then(r => r.ok ? r.json() : { items: [] })
                        .then(data => setBaseCurrencies((data.items || []).filter((item: CategoryItem) => item.status === 'Active')))
                        .catch(() => setBaseCurrencies([]));
                })
                .catch(() => setBaseCurrencies([]));
        }
    }, [view, companyFilter]);

    // Companies State
    const [companies, setCompanies] = useState<Company[]>([]);
    const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
    const [companyFormOpen, setCompanyFormOpen] = useState(false);
    const [editingCompany, setEditingCompany] = useState<Company | null>(null);
    const [companyForm, setCompanyForm] = useState<Omit<Company, 'id' | 'organizationId'>>({
        code: '', name: '', description: '', city: '', state: '',
        country: '', website: '', vatCode: '', notes: '',
        status: 'Active', language: '', dateFormat: '', timeFormat: '', timezone: '', baseCurrency: '', moneyFormat: '', currencyPosition: '', defaultLanguage: '', type: '', category: '',
        email: '', phone: '', logoUrl: '', address: '', zipcode: ''
    });

    const [availableTypes, setAvailableTypes] = useState<CategoryItem[]>([]);
    const [availableCats, setAvailableCats] = useState<CategoryItem[]>([]);

    useEffect(() => {
        if (view === 'Companies') {
            const url = companyFilter ? `/api/companies?companyId=${companyFilter}&t=${Date.now()}` : `/api/companies?t=${Date.now()}`;
            fetch(url)
                .then(res => res.ok ? res.json() : [])
                .then(data => setCompanies(data))
                .catch(() => setCompanies([]));

            // Fetch dropdown items (merged for current company context)
            const catQs = companyFilter ? `?companyId=${encodeURIComponent(companyFilter)}&` : '?';
            fetch(`/api/categories${catQs}t=${Date.now()}`)
                .then(res => res.ok ? res.json() : [])
                .then((cats: Category[]) => {
                    const typeCat = cats.find(c => c.code === 'COMPANY_TYPE');
                    const catCat = cats.find(c => c.code === 'COMPANY_CATEGORY');
                    const itemQs = companyFilter
                        ? `?companyId=${encodeURIComponent(companyFilter)}&t=${Date.now()}`
                        : `?t=${Date.now()}`;

                    if (typeCat) {
                        fetch(`/api/categories/${typeCat.id}${itemQs}`)
                            .then(r => r.json())
                            .then(data => setAvailableTypes((data.items || []).filter((i: any) => i.status === 'Active')));
                    }
                    if (catCat) {
                        fetch(`/api/categories/${catCat.id}${itemQs}`)
                            .then(r => r.json())
                            .then(data => setAvailableCats((data.items || []).filter((i: any) => i.status === 'Active')));
                    }
                });
        }
    }, [view, companyFilter]);

    useEffect(() => {
        if (view !== 'Companies') return;

        const selectedCompany = companies.find(c => c.id === selectedCompanyId);
        if (onSubTitleChange) onSubTitleChange(selectedCompany ? selectedCompany.name : '');
    }, [view, selectedCompanyId, companies, onSubTitleChange]);

    useEffect(() => {
        if (view !== 'Companies') return;

        const handleResetCompanySelection = () => setSelectedCompanyId(null);
        window.addEventListener('resetCompanySelection', handleResetCompanySelection);

        return () => {
            window.removeEventListener('resetCompanySelection', handleResetCompanySelection);
        };
    }, [view]);

    const openCompanyModal = (company?: Company) => {
        if (company) {
            setEditingCompany(company);
            setCompanyForm({
                code: company.code || '',
                name: company.name || '',
                description: company.description || '',
                city: company.city || '',
                state: company.state || '',
                country: company.country || '',
                website: company.website || '',
                vatCode: company.vatCode || '',
                notes: company.notes || '',
                status: company.status || 'Active',
                language: company.language || '',
                dateFormat: company.dateFormat || '',
                timeFormat: company.timeFormat || '',
                timezone: company.timezone || '',
                baseCurrency: company.baseCurrency || '',
                moneyFormat: company.moneyFormat || '',
                currencyPosition: company.currencyPosition || '',
                defaultLanguage: company.defaultLanguage || '',
                type: company.type || '',
                category: company.category || '',
                email: company.email || '',
                phone: company.phone || '',
                logoUrl: company.logoUrl || '',
                address: company.address || '',
                zipcode: company.zipcode || ''
            });
        } else {
            setEditingCompany(null);
            setCompanyForm({ code: '', name: '', description: '', city: '', state: '', country: '', website: '', vatCode: '', notes: '', status: 'Active', language: '', dateFormat: '', timeFormat: '', timezone: '', baseCurrency: '', moneyFormat: '', currencyPosition: '', defaultLanguage: '', type: '', category: '', email: '', phone: '', logoUrl: '', address: '', zipcode: '' });
        }
        setCompanyFormOpen(true);
    };

    const handleSaveCompany = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const method = editingCompany ? 'PUT' : 'POST';
            const url = editingCompany ? `/api/companies/${editingCompany.id}` : '/api/companies';
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(companyForm)
            });
            if (res.ok) {
                const url = companyFilter ? `/api/companies?companyId=${companyFilter}&t=${Date.now()}` : `/api/companies?t=${Date.now()}`;
                const updated = await fetch(url).then(r => r.json());
                setCompanies(updated);
                setCompanyFormOpen(false);
                window.dispatchEvent(new CustomEvent('companiesUpdated'));
            } else {
                alert('Error al guardar la compañía');
            }
        } catch (err) {
            console.error(err);
            alert('Error al conectar con el servidor');
        }
    };

    const handleDeleteCompany = async (id: string) => {
        if (!confirm('¿Eliminar esta compañía?')) return;
        try {
            await fetch(`/api/companies/${id}`, { method: 'DELETE' });
            setCompanies(prev => prev.filter(c => c.id !== id));
            window.dispatchEvent(new CustomEvent('companiesUpdated'));
        } catch (err) {
            alert('Error al eliminar');
        }
    };

    // Categories State
    const [categories, setCategories] = useState<Category[]>([]);
    const [categoryFormOpen, setCategoryFormOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<Category | null>(null);
    const [categoryForm, setCategoryForm] = useState<Omit<Category, 'id' | '_count'>>({
        code: '',
        name: '',
        description: '',
        module: '',
        status: 'Active',
        sortingRule: 'Manual'
    });

    const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
    const [categoryItems, setCategoryItems] = useState<CategoryItem[]>([]);
    const [scopeCompanies, setScopeCompanies] = useState<{ id: string; name: string }[]>([]);
    const [itemFormOpen, setItemFormOpen] = useState(false);
    const [editingCategoryItem, setEditingCategoryItem] = useState<CategoryItem | null>(null);
    const [itemForm, setItemForm] = useState<Omit<CategoryItem, 'id' | 'categoryId'> & { targetCompanyId: string }>({
        code: '',
        name: '',
        description: '',
        status: 'Active',
        targetCompanyId: ''
    });

    useEffect(() => {
        if (view === 'Categories') {
            fetch(`/api/companies?status=Active&t=${Date.now()}`)
                .then((res) => (res.ok ? res.json() : []))
                .then((data: Company[]) =>
                    setScopeCompanies((Array.isArray(data) ? data : []).map((c) => ({ id: c.id, name: c.name })))
                )
                .catch(() => setScopeCompanies([]));
        }
    }, [view]);

    useEffect(() => {
        if (view === 'Categories') {
            const catQs = companyFilter ? `?companyId=${encodeURIComponent(companyFilter)}&` : '?';
            fetch(`/api/categories${catQs}`)
                .then(res => res.ok ? res.json() : [])
                .then(data => setCategories(data))
                .catch(() => setCategories([]));
        }

        return () => {
            if (onSubTitleChange) onSubTitleChange('');
        };
    }, [view, onSubTitleChange, companyFilter]);

    const openCategoryModal = (category?: Category) => {
        if (category) {
            setEditingCategory(category);
            setCategoryForm({
                code: category.code || '',
                name: category.name || '',
                description: category.description || '',
                module: category.module || '',
                status: category.status || 'Active',
                sortingRule: category.sortingRule || 'Manual'
            });
        } else {
            setEditingCategory(null);
            setCategoryForm({ code: '', name: '', description: '', module: '', status: 'Active', sortingRule: 'Manual' });
        }
        setCategoryFormOpen(true);
    };

    const handleSaveCategory = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const method = editingCategory ? 'PUT' : 'POST';
            const url = editingCategory ? `/api/categories/${editingCategory.id}` : '/api/categories';
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(categoryForm)
            });
            if (res.ok) {
                const updated = await fetch('/api/categories').then(r => r.json());
                setCategories(updated);
                setCategoryFormOpen(false);
            } else {
                alert('Error al guardar la Categoría');
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleDeleteCategory = async (id: string) => {
        if (!confirm(t('common.confirmDelete') || '¿Estás seguro de eliminar esta Categoría?')) return;
        try {
            const res = await fetch(`/api/categories/${id}`, { method: 'DELETE' });
            if (res.ok) {
                setCategories(categories.filter(c => c.id !== id));
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleSelectCategory = async (category: Category) => {
        try {
            const itemQs = companyFilter
                ? `?companyId=${encodeURIComponent(companyFilter)}`
                : '';
            const res = await fetch(`/api/categories/${category.id}${itemQs}`);
            if (res.ok) {
                const data = await res.json();
                setSelectedCategory(data);
                setCategoryItems(data.items || []);
                if (onSubTitleChange) onSubTitleChange(data.name);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const openItemModal = (item?: CategoryItem) => {
        if (item) {
            setEditingCategoryItem(item);
            setItemForm({
                code: item.code || '',
                name: item.name || '',
                description: item.description || '',
                status: item.status || 'Active',
                targetCompanyId: item.companyId || ''
            });
        } else {
            setEditingCategoryItem(null);
            setItemForm({ code: '', name: '', description: '', status: 'Active', targetCompanyId: '' });
        }
        setItemFormOpen(true);
    };

    const handleSaveItem = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedCategory) return;
        if (editingCategoryItem?.isSystem) return;
        try {
            const method = editingCategoryItem ? 'PUT' : 'POST';
            const url = editingCategoryItem ? `/api/category-items/${editingCategoryItem.id}` : '/api/category-items';
            const { targetCompanyId, ...rest } = itemForm;
            const companyId = targetCompanyId ? targetCompanyId : null;
            const body = editingCategoryItem
                ? { ...rest, companyId }
                : { ...rest, categoryId: selectedCategory.id, companyId };
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (res.ok) {
                const itemQs = companyFilter
                    ? `?companyId=${encodeURIComponent(companyFilter)}`
                    : '';
                const updatedCat = await fetch(`/api/categories/${selectedCategory.id}${itemQs}`).then(r => r.json());
                setCategoryItems(updatedCat.items || []);
                setItemFormOpen(false);
            } else {
                const err = await res.json().catch(() => ({}));
                alert(err.error || 'Error al guardar');
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleDeleteItem = async (id: string) => {
        if (categoryItems.find((i) => i.id === id)?.isSystem) return;
        if (!confirm(t('common.confirmDelete') || '¿Estás seguro?')) return;
        try {
            const res = await fetch(`/api/category-items/${id}`, { method: 'DELETE' });
            if (res.ok) {
                setCategoryItems(prev => prev.filter(i => i.id !== id));
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleOnDragEnd = async (result: DropResult) => {
        if (!result.destination) return;

        const items = Array.from(categoryItems);
        const [reorderedItem] = items.splice(result.source.index, 1);
        items.splice(result.destination.index, 0, reorderedItem);

        // Optimistic update
        setCategoryItems(items);

        try {
            const updates = items.map((item, index) => ({
                id: item.id,
                sortOrder: index
            }));

            const reorderRes = await fetch('/api/category-items/reorder', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: updates })
            });
            if (reorderRes.ok && selectedCategory) {
                const itemQs = companyFilter
                    ? `?companyId=${encodeURIComponent(companyFilter)}`
                    : '';
                const updatedCat = await fetch(`/api/categories/${selectedCategory.id}${itemQs}`).then((r) => r.json());
                setCategoryItems(updatedCat.items || []);
            }
        } catch (err) {
            console.error('Failed to sync reorder:', err);
        }
    };

    // SMTP State
    const [smtpData, setSmtpData] = useState({
        provider: 'SMTP' as 'SMTP' | 'SES',
        smtp: {
            host: '',
            port: '587',
            user: '',
            pass: '',
            encryption: 'TLS',
            fromEmail: ''
        },
        ses: {
            region: 'us-east-1',
            accessKeyId: '',
            secretAccessKey: '',
            fromEmail: ''
        },
        testEmail: ''
    });
    const [isSmtpTesting, setIsSmtpTesting] = useState(false);
    const [isSmtpSaving, setIsSmtpSaving] = useState(false);
    const [smtpStatus, setSmtpStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    // Languages State
    const [languages, setLanguages] = useState<Language[]>(
        SYSTEM_LANGUAGES.map(lang => ({
            id: lang.id,
            name: lang.name,
            code: lang.code.toUpperCase(),
            status: lang.status as 'Active' | 'Inactive'
        }))
    );
    useEffect(() => {
        if (view !== 'SMTP') return;

        fetch('/api/smtp-config')
            .then(res => res.ok ? res.json() : Promise.reject(new Error('Failed to load SMTP config')))
            .then((data) => {
                const provider = data?.provider === 'SES' ? 'SES' : 'SMTP';
                const config = data?.config || {};

                setSmtpData(prev => ({
                    ...prev,
                    provider,
                    smtp: {
                        ...prev.smtp,
                        host: provider === 'SMTP' ? (config.host || '') : prev.smtp.host,
                        port: provider === 'SMTP' ? (config.port || '587') : prev.smtp.port,
                        user: provider === 'SMTP' ? (config.user || '') : prev.smtp.user,
                        pass: provider === 'SMTP' ? (config.pass || '') : prev.smtp.pass,
                        encryption: provider === 'SMTP' ? (config.encryption || 'TLS') : prev.smtp.encryption,
                        fromEmail: provider === 'SMTP' ? (config.fromEmail || '') : prev.smtp.fromEmail
                    },
                    ses: {
                        ...prev.ses,
                        region: provider === 'SES' ? (config.region || 'us-east-1') : prev.ses.region,
                        accessKeyId: provider === 'SES' ? (config.accessKeyId || '') : prev.ses.accessKeyId,
                        secretAccessKey: provider === 'SES' ? (config.secretAccessKey || '') : prev.ses.secretAccessKey,
                        fromEmail: provider === 'SES' ? (config.fromEmail || '') : prev.ses.fromEmail
                    },
                    testEmail: prev.testEmail || config.fromEmail || ''
                }));
                setSmtpStatus(null);
            })
            .catch((err) => {
                console.error(err);
                setSmtpStatus({ type: 'error', message: 'No se pudo cargar la Configuración SMTP/SES.' });
            });
    }, [view]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (timezoneDropdownRef.current && !timezoneDropdownRef.current.contains(event.target as Node)) {
                setIsTimezoneOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const timezoneOptions = Array.from(
        new Set([
            orgData.timezone,
            ...(typeof Intl !== 'undefined' && 'supportedValuesOf' in Intl
                ? (Intl as unknown as { supportedValuesOf: (type: string) => string[] }).supportedValuesOf('timeZone')
                : ['UTC'])
        ])
    )
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));

    const filteredTimezoneOptions = timezoneOptions.filter((zone) =>
        zone.toLowerCase().includes(timezoneSearch.toLowerCase())
    );

    // Payments State
    const [gateways, setGateways] = useState<PaymentGateway[]>([
        { id: '1', name: 'Stripe', type: 'Credit Card', status: 'Live' },
        { id: '2', name: 'PayPal', type: 'Wallet', status: 'Sandbox' },
        { id: '3', name: 'MercadoPago', type: 'Local', status: 'Inactive' },
    ]);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<any>(null);

    const handleSaveOrg = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch('/api/organization', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(orgData)
            });
            if (res.ok) {
                alert(t('settings.organizationTitle') + ' actualizada con éxito');
            } else {
                alert('Error al guardar Organización');
            }
        } catch (error) {
            console.error(error);
            alert('Error al guardar Organización');
        }
    };

    const handleSaveStorage = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch('/api/organization', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    storageProvider: storageData.provider,
                    storageSettings: storageData.settings
                })
            });
            if (res.ok) {
                alert(t('settings.storageTitle') + ' actualizada con éxito');
            } else {
                const errorData = await res.json();
                alert(`Error: ${errorData.details || errorData.error || 'Unknown error'}`);
            }
        } catch (error: any) {
            console.error(error);
            alert('Error al guardar Configuración de almacenamiento: ' + error.message);
        }
    };

    const handleSaveSmtp = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSmtpSaving(true);
        setSmtpStatus(null);

        try {
            const payload = {
                provider: smtpData.provider,
                config: smtpData.provider === 'SES' ? smtpData.ses : smtpData.smtp
            };

            const res = await fetch('/api/smtp-config', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data?.details || data?.error || 'No se pudo guardar la Configuración.');
            }

            setSmtpData(prev => ({
                ...prev,
                smtp: { ...prev.smtp, ...(data?.provider === 'SMTP' ? (data.config || {}) : {}) },
                ses: { ...prev.ses, ...(data?.provider === 'SES' ? (data.config || {}) : {}) }
            }));
            setSmtpStatus({ type: 'success', message: 'Configuración guardada correctamente.' });
        } catch (error: any) {
            setSmtpStatus({ type: 'error', message: error.message || 'Error al guardar Configuración.' });
        } finally {
            setIsSmtpSaving(false);
        }
    };

    const testSmtp = async () => {
        if (!smtpData.testEmail) {
            setSmtpStatus({ type: 'error', message: 'Ingresa un email para la prueba.' });
            return;
        }

        setIsSmtpTesting(true);
        setSmtpStatus(null);

        try {
            const payload = {
                provider: smtpData.provider,
                config: smtpData.provider === 'SES' ? smtpData.ses : smtpData.smtp,
                toEmail: smtpData.testEmail
            };

            const res = await fetch('/api/smtp-config/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data?.details || data?.error || 'No se pudo enviar email de prueba.');
            }

            setSmtpStatus({ type: 'success', message: data?.message || 'Correo de prueba enviado correctamente.' });
        } catch (error: any) {
            setSmtpStatus({ type: 'error', message: error.message || 'Error enviando correo de prueba.' });
        } finally {
            setIsSmtpTesting(false);
        }
    };

    const openModal = (type: string, item?: any) => {
        setEditingItem({ type, ...item });
        setIsModalOpen(true);
    };

    const renderOrganization = () => (
        <div className="w-full animate-in fade-in duration-500 pb-20">
            <div className="mb-8">
                <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">{t('settings.organizationTitle')}</h2>
                <p className="text-slate-500 font-medium">{t('settings.organizationDesc')}</p>
            </div>

            <form onSubmit={handleSaveOrg} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-8 space-y-10">
                    {/* Sección: Información del Negocio */}
                    <div className="space-y-6">
                        <div className="flex items-center gap-4 border-b border-slate-100 pb-4">
                            <h3 className="text-lg font-semibold text-primary">{t('settings.businessInfo')}</h3>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            <div className="space-y-1.5">
                                <label className="block text-sm font-medium text-slate-700">{t('settings.orgName')}</label>
                                <input
                                    type="text"
                                    value={orgData.name}
                                    onChange={(e) => setOrgData({ ...orgData, name: e.target.value })}
                                    className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium text-slate-700"
                                    placeholder="Ingrese nombre"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="block text-sm font-medium text-slate-700">{t('settings.taxId')}</label>
                                <input
                                    type="text"
                                    value={orgData.taxId}
                                    onChange={(e) => setOrgData({ ...orgData, taxId: e.target.value })}
                                    className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium text-slate-700"
                                    placeholder="00-00000000-0"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="block text-sm font-medium text-slate-700">{t('settings.adminEmail')}</label>
                                <input
                                    type="email"
                                    value={orgData.email}
                                    onChange={(e) => setOrgData({ ...orgData, email: e.target.value })}
                                    className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium text-slate-700"
                                    placeholder="contacto@empresa.com"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="block text-sm font-medium text-slate-700">{t('settings.website')}</label>
                                <input
                                    type="text"
                                    value={orgData.website}
                                    onChange={(e) => setOrgData({ ...orgData, website: e.target.value })}
                                    className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium text-slate-700"
                                    placeholder="https://www.ejemplo.com"
                                />
                            </div>
                            <div className="space-y-1.5 md:col-span-2 lg:col-span-4">
                                <label className="block text-sm font-medium text-slate-700">{t('settings.fiscalAddress')}</label>
                                <input
                                    type="text"
                                    value={orgData.address}
                                    onChange={(e) => setOrgData({ ...orgData, address: e.target.value })}
                                    className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium text-slate-700"
                                    placeholder="Ingrese Dirección"
                                />
                            </div>
                            <div className="space-y-1.5 md:col-span-2 lg:col-span-4">
                                <label className="block text-sm font-medium text-slate-700">{t('settings.addressAdditional') || 'Address additional'}</label>
                                <input
                                    type="text"
                                    value={orgData.addressAdditional}
                                    onChange={(e) => setOrgData({ ...orgData, addressAdditional: e.target.value })}
                                    className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium text-slate-700"
                                    placeholder="Piso, departamento, suite..."
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="block text-sm font-medium text-slate-700">{t('settings.zipcode') || 'Zipcode'}</label>
                                <input
                                    type="text"
                                    value={orgData.zipcode}
                                    onChange={(e) => setOrgData({ ...orgData, zipcode: e.target.value })}
                                    className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium text-slate-700"
                                    placeholder="5000"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="block text-sm font-medium text-slate-700">{t('common.city') || 'City'}</label>
                                <input
                                    type="text"
                                    value={orgData.city}
                                    onChange={(e) => setOrgData({ ...orgData, city: e.target.value })}
                                    className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium text-slate-700"
                                    placeholder="Cordoba"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="block text-sm font-medium text-slate-700">{t('settings.stateProvince') || 'State'}</label>
                                <input
                                    type="text"
                                    value={orgData.state}
                                    onChange={(e) => setOrgData({ ...orgData, state: e.target.value })}
                                    className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium text-slate-700"
                                    placeholder="Cordoba"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="block text-sm font-medium text-slate-700">{t('settings.country') || 'Country'}</label>
                                <input
                                    type="text"
                                    value={orgData.country}
                                    onChange={(e) => setOrgData({ ...orgData, country: e.target.value })}
                                    className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium text-slate-700"
                                    placeholder="Argentina"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Sección: localización & Formatos */}
                    <div className="space-y-6 pt-4">
                        <div className="flex items-center gap-4 border-b border-slate-100 pb-4">
                            <h3 className="text-lg font-semibold text-primary">{t('settings.locAndFormats')}</h3>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            <div className="space-y-1.5 relative">
                                <label className="block text-sm font-medium text-slate-700">{t('settings.dateFormat')}</label>
                                <div className="relative">
                                    <select
                                        value={orgData.dateFormat}
                                        onChange={(e) => setOrgData({ ...orgData, dateFormat: e.target.value })}
                                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium text-slate-700 appearance-none cursor-pointer"
                                    >
                                        <option>March 8, 2026</option>
                                        <option>2026/03/08</option>
                                        <option>03/08/2026</option>
                                        <option>08/03/2026</option>
                                        <option>08.03.2026</option>
                                    </select>
                                    <i className="fa-solid fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-xs"></i>
                                </div>
                            </div>
                            <div className="space-y-1.5 relative">
                                <label className="block text-sm font-medium text-slate-700">{t('settings.timeFormat')}</label>
                                <div className="relative">
                                    <select
                                        value={orgData.timeFormat}
                                        onChange={(e) => setOrgData({ ...orgData, timeFormat: e.target.value })}
                                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium text-slate-700 appearance-none cursor-pointer"
                                    >
                                        <option>2:19 am</option>
                                        <option>2:19 AM</option>
                                        <option>14:19</option>
                                    </select>
                                    <i className="fa-solid fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-xs"></i>
                                </div>
                            </div>
                            <div className="space-y-1.5 md:col-span-2 relative" ref={timezoneDropdownRef}>
                                <label className="block text-sm font-medium text-slate-700">{t('settings.timezone')}</label>
                                <button
                                    type="button"
                                    onClick={() => setIsTimezoneOpen(prev => !prev)}
                                    className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium text-slate-700 text-left flex items-center justify-between"
                                >
                                    <span>{orgData.timezone || 'UTC'}</span>
                                    <i className={`fa-solid fa-chevron-down text-slate-400 text-xs transition-transform ${isTimezoneOpen ? 'rotate-180' : ''}`}></i>
                                </button>
                                {isTimezoneOpen && (
                                    <div className="absolute z-20 mt-2 w-full bg-white border border-slate-200 rounded-lg shadow-lg p-2">
                                        <div className="relative mb-2">
                                            <i className="fa-solid fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                                            <input
                                                type="text"
                                                value={timezoneSearch}
                                                onChange={(e) => setTimezoneSearch(e.target.value)}
                                                placeholder="Search timezone..."
                                                className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                            />
                                        </div>
                                        <div className="max-h-56 overflow-y-auto">
                                            {filteredTimezoneOptions.length > 0 ? (
                                                filteredTimezoneOptions.map((zone) => (
                                                    <button
                                                        key={zone}
                                                        type="button"
                                                        onClick={() => {
                                                            setOrgData({ ...orgData, timezone: zone });
                                                            setIsTimezoneOpen(false);
                                                        }}
                                                        className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${orgData.timezone === zone ? 'bg-primary/10 text-primary' : 'text-slate-700 hover:bg-slate-50'}`}
                                                    >
                                                        {zone}
                                                    </button>
                                                ))
                                            ) : (
                                                <p className="px-3 py-2 text-sm text-slate-400">No timezones found</p>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="space-y-1.5 relative">
                                <label className="block text-sm font-medium text-slate-700">{t('settings.baseCurrency') || 'Base Currency'}</label>
                                <div className="relative">
                                    <select
                                        value={orgData.baseCurrency}
                                        onChange={(e) => setOrgData({ ...orgData, baseCurrency: e.target.value })}
                                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium text-slate-700 appearance-none cursor-pointer"
                                    >
                                        {(baseCurrencies.length > 0 ? baseCurrencies : [
                                            { id: 'usd', name: 'USD', code: 'USD', description: '', status: 'Active', sortOrder: 0, categoryId: '' },
                                            { id: 'eur', name: 'EUR', code: 'EUR', description: '', status: 'Active', sortOrder: 1, categoryId: '' },
                                            { id: 'ars', name: 'ARS', code: 'ARS', description: '', status: 'Active', sortOrder: 2, categoryId: '' },
                                            { id: 'clp', name: 'CLP', code: 'CLP', description: '', status: 'Active', sortOrder: 3, categoryId: '' }
                                        ] as CategoryItem[]).map((currency) => (
                                            <option key={currency.id} value={currency.code || currency.name}>{currency.code || currency.name}</option>
                                        ))}
                                    </select>
                                    <i className="fa-solid fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-xs"></i>
                                </div>
                            </div>
                            <div className="space-y-1.5 relative">
                                <label className="block text-sm font-medium text-slate-700">{t('settings.moneyFormat')}</label>
                                <div className="relative">
                                    <select
                                        value={orgData.moneyFormat}
                                        onChange={(e) => setOrgData({ ...orgData, moneyFormat: e.target.value })}
                                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium text-slate-700 appearance-none cursor-pointer"
                                    >
                                        <option>1,234.56</option>
                                        <option>1.234,56</option>
                                        <option>1234.56</option>
                                    </select>
                                    <i className="fa-solid fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-xs"></i>
                                </div>
                            </div>
                            <div className="space-y-1.5 relative">
                                <label className="block text-sm font-medium text-slate-700">{t('settings.currencyPosition')}</label>
                                <div className="relative">
                                    <select
                                        value={orgData.currencyPosition}
                                        onChange={(e) => setOrgData({ ...orgData, currencyPosition: e.target.value })}
                                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium text-slate-700 appearance-none cursor-pointer"
                                    >
                                        <option>$ 100</option>
                                        <option>100 $</option>
                                    </select>
                                    <i className="fa-solid fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-xs"></i>
                                </div>
                            </div>
                            <div className="space-y-1.5 md:col-span-2 relative">
                                <label className="block text-sm font-medium text-slate-700">{t('settings.defaultLanguage')}</label>
                                <div className="relative">
                                    <select
                                        value={orgData.defaultLanguage}
                                        onChange={(e) => setOrgData({ ...orgData, defaultLanguage: e.target.value })}
                                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium text-slate-700 appearance-none cursor-pointer"
                                    >
                                        {languages.map((lang) => (
                                            <option key={lang.id} value={lang.name}>{lang.name}</option>
                                        ))}
                                    </select>
                                    <i className="fa-solid fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-xs"></i>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-slate-50 px-8 py-5 border-t border-slate-200 flex justify-end">
                    <button type="submit" className="px-6 py-2 bg-primary text-white font-medium rounded-lg shadow-sm hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-all text-sm">
                        {t('settings.saveChanges')}
                    </button>
                </div>
            </form>
        </div>
    );

    const renderCompanies = () => {
        const selectedCompany = companies.find(c => c.id === selectedCompanyId);

        if (selectedCompanyId && selectedCompany) {
            return (
                <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
                    <CompanyProfile 
                        company={selectedCompany} 
                        onEdit={openCompanyModal}
                        onRefresh={() => {
                            const url = companyFilter ? `/api/companies?companyId=${companyFilter}&t=${Date.now()}` : `/api/companies?t=${Date.now()}`;
                            fetch(url).then(r => r.json()).then(setCompanies);
                        }}
                    />
                </div>
            );
        }

        return (
            <CompaniesSettingsTable
                companies={companies}
                onSelectCompany={setSelectedCompanyId}
                onEditCompany={openCompanyModal}
                onDeleteCompany={handleDeleteCompany}
                onNewCompany={() => openCompanyModal()}
            />
        );
    };

    const renderSmtp = () => (
        <div className="w-full max-w-none animate-in fade-in duration-500 pb-20">
            <div className="mb-8 flex flex-col lg:flex-row lg:justify-between lg:items-end gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900">{t('settings.smtpTitle')}</h2>
                    <p className="text-slate-500">{t('settings.smtpDesc')}</p>
                </div>
                <div className="flex items-end gap-3 w-full lg:w-auto">
                    <div className="w-full lg:w-[320px]">
                        <label className="block text-xs font-bold text-slate-600 mb-1">Email de prueba</label>
                        <input
                            type="email"
                            value={smtpData.testEmail}
                            onChange={(e) => setSmtpData({ ...smtpData, testEmail: e.target.value })}
                            placeholder="destino@dominio.com"
                            className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={testSmtp}
                        disabled={isSmtpTesting}
                        className={`px-6 py-2 text-sm font-medium rounded-lg shadow-sm transition-all flex items-center gap-2 whitespace-nowrap ${isSmtpTesting ? 'bg-slate-100 text-slate-400' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                    >
                        {isSmtpTesting ? <i className="fa-solid fa-circle-notch fa-spin text-indigo-500"></i> : <i className="fa-solid fa-paper-plane text-indigo-500"></i>}
                        {isSmtpTesting ? 'Probando...' : t('settings.sendTestEmail')}
                    </button>
                </div>
            </div>

            <form onSubmit={handleSaveSmtp} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden w-full">
                <div className="p-8 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div className="space-y-2 md:col-span-2">
                            <label className="text-sm font-bold text-slate-700">Proveedor</label>
                            <select
                                value={smtpData.provider}
                                onChange={(e) => setSmtpData({ ...smtpData, provider: e.target.value === 'SES' ? 'SES' : 'SMTP' })}
                                className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                            >
                                <option value="SMTP">SMTP</option>
                                <option value="SES">AWS SES</option>
                            </select>
                        </div>
                    </div>

                    {smtpData.provider === 'SMTP' ? (
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                            <div className="md:col-span-2 space-y-2">
                                <label className="text-sm font-bold text-slate-700">{t('settings.host')}</label>
                                <input type="text" value={smtpData.smtp.host} onChange={(e) => setSmtpData({ ...smtpData, smtp: { ...smtpData.smtp, host: e.target.value } })} className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700">{t('settings.port')}</label>
                                <input type="text" value={smtpData.smtp.port} onChange={(e) => setSmtpData({ ...smtpData, smtp: { ...smtpData.smtp, port: e.target.value } })} className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700">{t('settings.encryption')}</label>
                                <select value={smtpData.smtp.encryption} onChange={(e) => setSmtpData({ ...smtpData, smtp: { ...smtpData.smtp, encryption: e.target.value } })} className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
                                    <option>None</option>
                                    <option>SSL</option>
                                    <option>TLS</option>
                                </select>
                            </div>
                            <div className="md:col-span-2 space-y-2">
                                <label className="text-sm font-bold text-slate-700">{t('settings.userEmail')}</label>
                                <input type="text" value={smtpData.smtp.user} onChange={(e) => setSmtpData({ ...smtpData, smtp: { ...smtpData.smtp, user: e.target.value } })} className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                            </div>
                            <div className="md:col-span-2 space-y-2">
                                <label className="text-sm font-bold text-slate-700">{t('settings.password')}</label>
                                <input type="password" value={smtpData.smtp.pass} onChange={(e) => setSmtpData({ ...smtpData, smtp: { ...smtpData.smtp, pass: e.target.value } })} className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                            </div>
                            <div className="md:col-span-2 space-y-2">
                                <label className="text-sm font-bold text-slate-700">From Email</label>
                                <input type="email" value={smtpData.smtp.fromEmail} onChange={(e) => setSmtpData({ ...smtpData, smtp: { ...smtpData.smtp, fromEmail: e.target.value } })} placeholder="no-reply@dominio.com" className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700">AWS Region</label>
                                <input type="text" value={smtpData.ses.region} onChange={(e) => setSmtpData({ ...smtpData, ses: { ...smtpData.ses, region: e.target.value } })} placeholder="us-east-1" className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                            </div>
                            <div className="md:col-span-2 space-y-2">
                                <label className="text-sm font-bold text-slate-700">AWS Access Key ID</label>
                                <input type="text" value={smtpData.ses.accessKeyId} onChange={(e) => setSmtpData({ ...smtpData, ses: { ...smtpData.ses, accessKeyId: e.target.value } })} className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                            </div>
                            <div className="md:col-span-2 space-y-2">
                                <label className="text-sm font-bold text-slate-700">AWS Secret Access Key</label>
                                <input type="password" value={smtpData.ses.secretAccessKey} onChange={(e) => setSmtpData({ ...smtpData, ses: { ...smtpData.ses, secretAccessKey: e.target.value } })} className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                            </div>
                            <div className="md:col-span-2 space-y-2">
                                <label className="text-sm font-bold text-slate-700">SES From Email</label>
                                <input type="email" value={smtpData.ses.fromEmail} onChange={(e) => setSmtpData({ ...smtpData, ses: { ...smtpData.ses, fromEmail: e.target.value } })} placeholder="verified@dominio.com" className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                            </div>
                        </div>
                    )}

                    {smtpStatus && (
                        <div className={`rounded-lg px-4 py-3 text-sm font-medium ${smtpStatus.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                            {smtpStatus.message}
                        </div>
                    )}
                </div>

                <div className="bg-slate-50 px-8 py-4 border-t border-slate-200 flex justify-end">
                    <button type="submit" disabled={isSmtpSaving} className={`px-6 py-2 text-white font-bold rounded-lg transition-all text-sm ${isSmtpSaving ? 'cursor-not-allowed bg-muted text-muted-foreground' : 'bg-primary hover:bg-primary/90'}`}>
                        {isSmtpSaving ? 'Guardando...' : t('settings.saveConfig')}
                    </button>
                </div>
            </form>
        </div>
    );

    const renderLanguages = () => (
        <LanguagesSettingsTable languages={languages} onAddLanguage={() => openModal('Language')} />
    );

    const renderBackup = () => (
        <div className="max-w-4xl space-y-6 animate-in fade-in duration-500">
            <div className="mb-8">
                <h2 className="text-2xl font-bold text-slate-900">Backups & Restauración</h2>
                <p className="text-slate-500">Resguarda tu Información y el Código de tu aplicación.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center text-center space-y-4">
                    <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center text-2xl">
                        <i className="fa-solid fa-database"></i>
                    </div>
                    <div>
                        <h4 className="font-bold text-lg">Base de Datos</h4>
                        <p className="text-sm text-slate-500">Descarga un dump SQL de toda tu base de datos PostgreSQL.</p>
                    </div>
                    <button className="w-full py-2 bg-blue-600 text-white font-medium rounded-lg shadow-sm hover:bg-blue-700 transition-all flex items-center justify-center gap-2 text-sm">
                        <i className="fa-solid fa-download"></i>
                        Generar Backup SQL
                    </button>
                </div>

                <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center text-center space-y-4">
                    <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center text-2xl">
                        <i className="fa-solid fa-file-code"></i>
                    </div>
                    <div>
                        <h4 className="font-bold text-lg">Código Fuente</h4>
                        <p className="text-sm text-slate-500">Exporta un archivo comprimido (.zip) con el Código de la aplicación.</p>
                    </div>
                    <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90">
                        <i className="fa-solid fa-file-zipper"></i>
                        Descargar Código (.zip)
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                    <h4 className="font-bold text-slate-700">Historial de Backups</h4>
                    <span className="text-xs text-slate-400 font-medium">Auto-backup cada 24hs activo</span>
                </div>
                <div className="divide-y divide-slate-100">
                    {[
                        { name: 'full_backup_2024_03_07.sql', size: '42.5 MB', date: 'Hoy, 04:00 AM' },
                        { name: 'full_backup_2024_03_06.sql', size: '41.8 MB', date: 'Ayer, 04:00 AM' },
                        { name: 'full_backup_2024_03_05.sql', size: '41.2 MB', date: '05 Mar 2024, 04:00 AM' },
                    ].map((item, i) => (
                        <div key={i} className="px-6 py-4 flex justify-between items-center hover:bg-slate-50/50 transition-colors">
                            <div className="flex items-center gap-3">
                                <i className="fa-solid fa-file-export text-slate-300"></i>
                                <div className="flex flex-col">
                                    <span className="text-sm font-bold text-slate-700">{item.name}</span>
                                    <span className="text-xs text-slate-500 font-medium text-slate-400 uppercase tracking-wider">{item.date}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <span className="text-xs font-bold text-slate-500">{item.size}</span>
                                <button className="text-indigo-600 hover:text-indigo-700">
                                    <i className="fa-solid fa-download"></i>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );

    const renderPayments = () => (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex justify-between items-end">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900">Pasarelas de Pago</h2>
                    <p className="text-slate-500">Gestiona tus métodos de cobro y claves de API.</p>
                </div>
                <button
                    onClick={() => openModal('Payment')}
                    className="flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90"
                >
                    <i className="fa-solid fa-plus"></i>
                    Nueva Pasarela
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {gateways.map((gate) => (
                    <div key={gate.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                        <div className="p-6 flex-1">
                            <div className="flex justify-between items-start mb-4">
                                <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center text-xl text-slate-400">
                                    <i className={`fa-solid ${gate.name === 'Stripe' ? 'fa-cc-stripe' : gate.name === 'PayPal' ? 'fa-paypal' : 'fa-credit-card'}`}></i>
                                </div>
                                <span className={`px-2 py-1 rounded-lg text-xs text-slate-500 font-medium font-bold uppercase ${gate.status === 'Live' ? 'bg-emerald-100 text-emerald-700' :
                                    gate.status === 'Sandbox' ? 'bg-orange-100 text-orange-700' :
                                        'bg-slate-100 text-slate-500'
                                    }`}>
                                    {gate.status}
                                </span>
                            </div>
                            <h4 className="font-bold text-lg text-slate-900">{gate.name}</h4>
                            <p className="text-xs text-slate-400 font-medium">{gate.type}</p>
                        </div>
                        <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex justify-between gap-2">
                            <button onClick={() => openModal('Payment', gate)} className="text-xs font-bold text-indigo-600 hover:text-indigo-700">Configurar</button>
                            <button className="text-xs font-bold text-rose-600 hover:text-rose-700">Desactivar</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    const renderCategories = () => (
        <CategoriesSettingsTable
            categories={categories}
            showDevActions={false}
            readOnlyCategoryDefinitions
            onSelectCategory={handleSelectCategory}
            onEditCategory={openCategoryModal}
            onDeleteCategory={handleDeleteCategory}
            onNewCategory={() => openCategoryModal()}
        />
    );

    const categoryItemScopeLabel = (item: CategoryItem) => {
        if (item.isSystem) return 'Sistema';
        if (!item.companyId) return 'Todas las compañías';
        return scopeCompanies.find((c) => c.id === item.companyId)?.name || item.companyId;
    };

    const renderCategoryItems = () => {
        if (!selectedCategory) return null;
        return (
            <div className="w-full animate-in fade-in duration-500 pb-20">
                <div className="mb-6">
                    <button
                        type="button"
                        onClick={() => {
                            setSelectedCategory(null);
                            setCategoryItems([]);
                            if (onSubTitleChange) onSubTitleChange('');
                        }}
                        className="text-sm font-semibold text-primary hover:underline"
                    >
                        ← {t('settings.categoriesTitle') || 'Categorías'}
                    </button>
                </div>
                <div className="mb-8 flex justify-between items-end">
                    <div className="space-y-1">
                        <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
                            {selectedCategory.name}
                        </h2>
                        <div className="flex items-center gap-2 mt-1">
                            <p className="text-slate-500 font-medium">Gestiona las opciones que aparecerán en el selector de "{selectedCategory.module}".</p>
                            {selectedCategory.sortingRule !== 'Manual' && (
                                <span className="text-[10px] font-bold bg-amber-50 text-amber-600 px-2 py-0.5 rounded border border-amber-100 uppercase tracking-wider flex items-center gap-1">
                                    <i className="fa-solid fa-lock text-[9px]"></i> Orden: {selectedCategory.sortingRule === 'Alpha_ASC' ? 'Alfabético A-Z' : 'Alfabético Z-A'}
                                </span>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={() => openItemModal()}
                        className="flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                    >
                        <i className="fa-solid fa-plus text-xs"></i>
                        {t('settings.newItem') || 'Nueva Opción'}
                    </button>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
                    <DragDropContext onDragEnd={handleOnDragEnd}>
                        <table className="w-full text-left min-w-[800px]">
                            <thead className="border-b border-foreground/10 bg-table-header">
                                <tr>
                                    <th className="w-10 px-6 py-3"></th>
                                    <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-table-header-foreground">{t('settings.name') || 'Nombre / Etiqueta'}</th>
                                    <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-table-header-foreground">{t('settings.code') || 'Valor / Código'}</th>
                                    <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-table-header-foreground">{t('settings.description') || 'Descripción'}</th>
                                    <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-table-header-foreground">{t('settings.status') || 'Estado'}</th>
                                    <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-table-header-foreground">Ámbito</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-table-header-foreground">{t('settings.actions') || 'Acciones'}</th>
                                </tr>
                            </thead>
                            <Droppable droppableId="category-items">
                                {(provided) => (
                                    <tbody
                                        {...provided.droppableProps}
                                        ref={provided.innerRef}
                                        className="divide-y divide-slate-100"
                                    >
                                        {categoryItems.map((item, index) => (
                                            <Draggable
                                                key={item.id}
                                                draggableId={item.id}
                                                index={index}
                                                isDragDisabled={selectedCategory.sortingRule !== 'Manual' || Boolean(item.isSystem)}
                                            >
                                                {(provided, snapshot) => (
                                                    <tr
                                                        ref={provided.innerRef}
                                                        {...provided.draggableProps}
                                                        className={`transition-colors group ${snapshot.isDragging ? 'border-y border-primary/20 bg-primary/5 shadow-md' : 'hover:bg-slate-50/50'}`}
                                                    >
                                                        <td className="px-6 py-5">
                                                            {selectedCategory.sortingRule === 'Manual' && !item.isSystem ? (
                                                                <div
                                                                    {...provided.dragHandleProps}
                                                                    className="text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing transition-colors"
                                                                >
                                                                    <i className="fa-solid fa-grip-vertical"></i>
                                                                </div>
                                                            ) : (
                                                                <div className="w-5 h-5 rounded-md bg-slate-50 flex items-center justify-center text-[10px] text-slate-400 font-bold border border-slate-100 shadow-inner">
                                                                    {index + 1}
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="px-6 py-5 font-bold text-slate-900 group-hover:text-primary transition-colors">{item.name}</td>
                                                        <td className="px-6 py-5 text-slate-500 font-mono text-xs">{item.code || '-'}</td>
                                                        <td className="px-6 py-5 text-slate-500 font-medium truncate max-w-sm">{item.description || '-'}</td>
                                                        <td className="px-6 py-5">
                                                            <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border ${item.status === 'Active' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                                                                {item.status === 'Active' ? (t('settings.active') || 'Activo') : (t('settings.inactive') || 'Inactivo')}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-5 text-xs text-slate-500 font-medium">
                                                            {categoryItemScopeLabel(item)}
                                                        </td>
                                                        <td className="px-6 py-5">
                                                            <div className="flex justify-end gap-2">
                                                                {!item.isSystem && (
                                                                    <>
                                                                        <button type="button" onClick={() => openItemModal(item)} className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-indigo-600 hover:border-indigo-100 hover:bg-slate-50 flex items-center justify-center transition-all">
                                                                            <i className="fa-solid fa-pen-to-square text-xs"></i>
                                                                        </button>
                                                                        <button type="button" onClick={() => handleDeleteItem(item.id)} className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-400 hover:border-destructive/20 hover:bg-slate-50 hover:text-destructive flex items-center justify-center transition-all">
                                                                            <i className="fa-solid fa-trash-can text-xs"></i>
                                                                        </button>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </Draggable>
                                        ))}
                                        {provided.placeholder}
                                        {categoryItems.length === 0 && (
                                            <tr>
                                                <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                                                    {t('settings.noItems') || 'No hay opciones registradas para esta Categoría.'}
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                )}
                            </Droppable>
                        </table>
                    </DragDropContext>
                </div>
            </div>
        );
    };

    const renderStorage = () => (
        <div className="w-full animate-in fade-in duration-500 pb-20">
            <div className="mb-8">
                <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">{t('settings.storageTitle') || 'Configuración de Almacenamiento'}</h2>
                <p className="text-slate-500 font-medium">{t('settings.storageDesc') || 'Define dónde se guardarán los archivos de la Organización.'}</p>
            </div>

            <form onSubmit={handleSaveStorage} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-8 space-y-10">
                    <div className="space-y-6">
                        <div className="flex items-center gap-4 border-b border-slate-100 pb-4">
                            <h3 className="text-lg font-semibold text-primary">{t('settings.storageProvider') || 'Proveedor de Almacenamiento'}</h3>
                        </div>

                        <div className="space-y-6">
                            <div className="space-y-1.5 relative w-full">
                                <label className="block text-sm font-medium text-slate-700">{t('settings.selectProvider') || 'Seleccionar Proveedor'}</label>
                                <div className="relative w-full">
                                    <select
                                        value={storageData.provider}
                                        onChange={(e) => setStorageData({ ...storageData, provider: e.target.value })}
                                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium text-slate-700 appearance-none cursor-pointer"
                                    >
                                        <option value="Local">{t('settings.localProvider')}</option>
                                        <option value="S3">{t('settings.s3Provider')}</option>
                                        <option value="GoogleCloud">{t('settings.googleCloudProvider')}</option>
                                        <option value="Azure">{t('settings.azureProvider')}</option>
                                    </select>
                                    <i className="fa-solid fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-xs"></i>
                                </div>
                            </div>
                        </div>

                        {storageData.provider === 'Local' && (
                            <div className="p-4 bg-slate-50 rounded-lg border border-slate-100 animate-in slide-in-from-top-2">
                                <p className="text-sm text-slate-600 flex items-center gap-2">
                                    <i className="fa-solid fa-circle-info text-blue-500"></i>
                                    {t('settings.localPathInfo') || 'Los archivos se almacenarán localmente en la carpeta /storage de este servidor, organizados por compañía.'}
                                </p>
                            </div>
                        )}

                        {storageData.provider === 'S3' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-top-2">
                                <div className="space-y-1.5">
                                    <label className="block text-sm font-medium text-slate-700">{t('settings.s3AccessKey')}</label>
                                    <input
                                        type="text"
                                        value={storageData.settings.accessKey || ''}
                                        onChange={(e) => setStorageData({ ...storageData, settings: { ...storageData.settings, accessKey: e.target.value } })}
                                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium text-slate-700"
                                        placeholder="AKIA..."
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="block text-sm font-medium text-slate-700">{t('settings.s3SecretKey')}</label>
                                    <input
                                        type="password"
                                        value={storageData.settings.secretKey || ''}
                                        onChange={(e) => setStorageData({ ...storageData, settings: { ...storageData.settings, secretKey: e.target.value } })}
                                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium text-slate-700"
                                        placeholder="********"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="block text-sm font-medium text-slate-700">{t('settings.s3Bucket')}</label>
                                    <input
                                        type="text"
                                        value={storageData.settings.bucket || ''}
                                        onChange={(e) => setStorageData({ ...storageData, settings: { ...storageData.settings, bucket: e.target.value } })}
                                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium text-slate-700"
                                        placeholder="my-storage-bucket"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="block text-sm font-medium text-slate-700">{t('settings.s3Region')}</label>
                                    <input
                                        type="text"
                                        value={storageData.settings.region || ''}
                                        onChange={(e) => setStorageData({ ...storageData, settings: { ...storageData.settings, region: e.target.value } })}
                                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium text-slate-700"
                                        placeholder="us-east-1"
                                    />
                                </div>
                            </div>
                        )}

                        {storageData.provider === 'GoogleCloud' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-top-2">
                                <div className="space-y-1.5">
                                    <label className="block text-sm font-medium text-slate-700">{t('settings.googleCloudProject')}</label>
                                    <input
                                        type="text"
                                        value={storageData.settings.projectId || ''}
                                        onChange={(e) => setStorageData({ ...storageData, settings: { ...storageData.settings, projectId: e.target.value } })}
                                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium text-slate-700"
                                        placeholder="project-id-123"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="block text-sm font-medium text-slate-700">{t('settings.googleCloudBucket')}</label>
                                    <input
                                        type="text"
                                        value={storageData.settings.bucket || ''}
                                        onChange={(e) => setStorageData({ ...storageData, settings: { ...storageData.settings, bucket: e.target.value } })}
                                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium text-slate-700"
                                        placeholder="my-bucket"
                                    />
                                </div>
                                <div className="md:col-span-2 space-y-1.5">
                                    <label className="block text-sm font-medium text-slate-700">{t('settings.googleCloudKeyFile')}</label>
                                    <textarea
                                        value={storageData.settings.keyFile || ''}
                                        onChange={(e) => setStorageData({ ...storageData, settings: { ...storageData.settings, keyFile: e.target.value } })}
                                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium text-slate-700 resize-none"
                                        rows={4}
                                        placeholder='{ "type": "service_account", ... }'
                                    />
                                </div>
                            </div>
                        )}

                        {storageData.provider === 'Azure' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-top-2">
                                <div className="md:col-span-2 space-y-1.5">
                                    <label className="block text-sm font-medium text-slate-700">{t('settings.azureConnectionString')}</label>
                                    <input
                                        type="text"
                                        value={storageData.settings.connectionString || ''}
                                        onChange={(e) => setStorageData({ ...storageData, settings: { ...storageData.settings, connectionString: e.target.value } })}
                                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium text-slate-700"
                                        placeholder="DefaultEndpointsProtocol=https;AccountName=..."
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="block text-sm font-medium text-slate-700">{t('settings.azureContainer')}</label>
                                    <input
                                        type="text"
                                        value={storageData.settings.container || ''}
                                        onChange={(e) => setStorageData({ ...storageData, settings: { ...storageData.settings, container: e.target.value } })}
                                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-medium text-slate-700"
                                        placeholder="my-container"
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="bg-slate-50 px-8 py-5 border-t border-slate-200 flex justify-end">
                    <button type="submit" className="px-6 py-2 bg-primary text-white font-medium rounded-lg shadow-sm hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-all text-sm">
                        {t('settings.saveChanges')}
                    </button>
                </div>
            </form>
        </div>
    );

    const formatPlanLimit = (v: number | null) => (v == null ? t('settings.myPlanUnlimited') : String(v));

    const applyMyPlanChange = async () => {
        if (!myPlanSelectedId || myPlanSelectedId === myPlanCurrent?.id) return;
        setMyPlanSaving(true);
        setMyPlanNotice(null);
        try {
            const res = await fetch('/api/subscription-plans/current', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ planId: myPlanSelectedId })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(String((data as { error?: string })?.error || 'Request failed'));
            setMyPlanCurrent((data as { plan?: SubscriptionPlanDto }).plan || null);
            setMyPlanNotice({ type: 'success', message: t('settings.myPlanSaved') });
        } catch (e: unknown) {
            setMyPlanNotice({ type: 'error', message: e instanceof Error ? e.message : 'Error' });
        } finally {
            setMyPlanSaving(false);
        }
    };

    const renderMyPlan = () => (
        <div className="w-full max-w-3xl animate-in fade-in duration-500 pb-20 px-4 md:px-8">
            <div className="mb-8">
                <h2 className="text-2xl font-bold text-slate-900">{t('settings.myPlanTitle')}</h2>
                <p className="text-sm text-slate-500 mt-1">{t('settings.myPlanDesc')}</p>
            </div>
            {myPlanLoading && <p className="text-sm text-slate-500">{t('common.loading')}</p>}
            {myPlanError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{myPlanError}</div>
            )}
            {myPlanNotice && (
                <div
                    className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
                        myPlanNotice.type === 'success'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                            : 'border-red-200 bg-red-50 text-red-800'
                    }`}
                >
                    {myPlanNotice.message}
                </div>
            )}
            {!myPlanLoading && !myPlanError && myPlanCurrent && (
                <div className="space-y-8">
                    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                        <h3 className="text-lg font-semibold text-slate-900 mb-4">{t('settings.myPlanCurrent')}</h3>
                        <div className="grid gap-3 md:grid-cols-2">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('settings.name')}</p>
                                <p className="text-base font-medium text-slate-900">{myPlanCurrent.name}</p>
                                <p className="text-xs text-slate-500 mt-1">
                                    {t('settings.myPlanCode')}: {myPlanCurrent.code}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('settings.myPlanPrice')}</p>
                                <p className="text-base font-medium text-slate-900">
                                    {myPlanCurrent.currency}{' '}
                                    {(Number(myPlanCurrent.priceCents) || 0) / 100}
                                </p>
                                <p className="text-xs text-slate-500 mt-1">
                                    {t('settings.myPlanBilling')}: {myPlanCurrent.billingPeriod}
                                </p>
                            </div>
                            {myPlanCurrent.description ? (
                                <div className="md:col-span-2">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('settings.description')}</p>
                                    <p className="text-sm text-slate-700">{myPlanCurrent.description}</p>
                                </div>
                            ) : null}
                        </div>
                        <div className="mt-6 border-t border-slate-100 pt-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{t('settings.myPlanLimits')}</p>
                            <ul className="grid gap-2 md:grid-cols-2 text-sm text-slate-700">
                                <li>
                                    {t('settings.myPlanMaxUsers')}: {formatPlanLimit(myPlanCurrent.maxUsers)}
                                </li>
                                <li>
                                    {t('settings.myPlanMaxCompanies')}: {formatPlanLimit(myPlanCurrent.maxCompanies)}
                                </li>
                                <li>
                                    {t('settings.myPlanMaxStorageMb')}: {formatPlanLimit(myPlanCurrent.maxStorageMb)}
                                </li>
                            </ul>
                        </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                        <h3 className="text-lg font-semibold text-slate-900 mb-4">{t('settings.myPlanSelect')}</h3>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                            <div className="flex-1">
                                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                                    {t('settings.name')}
                                </label>
                                <select
                                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-800"
                                    value={myPlanSelectedId}
                                    onChange={(e) => setMyPlanSelectedId(e.target.value)}
                                >
                                    {myPlanCatalog.map((p) => (
                                        <option key={p.id} value={p.id}>
                                            {p.name} ({p.code})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <button
                                type="button"
                                onClick={() => void applyMyPlanChange()}
                                disabled={myPlanSaving || !myPlanSelectedId || myPlanSelectedId === myPlanCurrent.id}
                                className="px-6 py-2.5 bg-primary text-white font-medium rounded-lg shadow-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                            >
                                {myPlanSaving ? '…' : t('settings.myPlanApply')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    return (
        <div className="h-full">
            {view === 'Organization' && renderOrganization()}
            {view === 'MyPlan' && renderMyPlan()}
            {view === 'Companies' && renderCompanies()}
            {view === 'SMTP' && renderSmtp()}
            {view === 'Languages' && renderLanguages()}
            {view === 'Backup' && renderBackup()}
            {view === 'Payments' && renderPayments()}
            {view === 'Storage' && renderStorage()}
            {view === 'Users' && (
                <div className="w-full animate-in fade-in duration-500 pb-20">
                    <UserManagement companyFilter={companyFilter} onSelectedUserNameChange={onSubTitleChange} />
                </div>
            )}

            {view === 'Categories' && (selectedCategory ? renderCategoryItems() : renderCategories())}
            {view === 'References' && <ReferenceManagement companyFilter={companyFilter} />}
            {view === 'RoleSettings' && (
                <div className="w-full animate-in fade-in duration-500 pb-20">
                    <RoleManagement />
                </div>
            )}
            {view === 'ModuleSettings' && (
                <div className="w-full animate-in fade-in duration-500 pb-20">
                    <ModuleManagement />
                </div>
            )}
            {view === 'Menus' && (
                <div className="w-full animate-in fade-in duration-500 pb-20">
                    <MenuManagement clientModules={clientModules} activeModuleCodes={activeModuleCodes} />
                </div>
            )}

            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
                    <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md animate-in zoom-in-95 duration-200 border border-white/20">
                        <div className="p-8">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-bold text-slate-900">
                                    {editingItem?.id ? 'Editar' : 'Nuevo'} {editingItem?.type === 'Language' ? 'Idioma' : 'Elemento'}
                                </h3>
                                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                    <i className="fa-solid fa-xmark"></i>
                                </button>
                            </div>
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-slate-700">Nombre</label>
                                    <input type="text" defaultValue={editingItem?.name} className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder-slate-400 transition-all font-medium" />
                                </div>
                                {editingItem?.type === 'Language' && (
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-slate-700">Código (ISO)</label>
                                        <input type="text" defaultValue={editingItem?.code} placeholder="ej: ES" className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder-slate-400 transition-all font-medium" />
                                    </div>
                                )}
                                <div className="flex gap-3 pt-4 justify-end">
                                    <button onClick={() => setIsModalOpen(false)} className="px-6 py-2 bg-white border border-slate-200 text-slate-600 font-medium rounded-lg hover:bg-slate-50 transition-all text-sm">Cancelar</button>
                                    <button className="px-6 py-2 bg-primary text-white font-medium rounded-lg hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-all text-sm shadow-sm">Guardar</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {companyFormOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setCompanyFormOpen(false)}></div>
                    <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                        {/* Modal header */}
                        <div className="flex justify-between items-center px-8 pt-7 pb-5 border-b border-slate-100">
                            <div>
                                <h3 className="text-xl font-bold text-slate-900">
                                    {editingCompany ? 'Editar compañía' : 'Nueva compañía'}
                                </h3>
                                <p className="text-slate-400 text-sm font-medium mt-0.5">
                                    {editingCompany ? `Editando: ${editingCompany.name}` : 'Completa los datos para registrar la compañía'}
                                </p>
                            </div>
                            <button onClick={() => setCompanyFormOpen(false)} className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-all">
                                <i className="fa-solid fa-xmark"></i>
                            </button>
                        </div>

                        {/* Modal body - scrollable */}
                        <form onSubmit={handleSaveCompany} className="flex flex-col flex-1 overflow-hidden">
                            <div className="overflow-y-auto flex-1 px-8 py-6 space-y-6">
                                {/* Basic Info */}
                                <div>
                                    <h4 className="text-xs font-bold text-primary uppercase tracking-widest mb-4 pb-2 border-b border-slate-100">{t('settings.generalInfo')}</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{t('settings.companyCode')}</label>
                                            <input type="text" value={companyForm.code} onChange={e => setCompanyForm(p => ({ ...p, code: e.target.value }))} placeholder="e.g. COMP-001" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder-slate-400 transition-all font-medium" />
                                        </div>
                                        <div className="md:col-span-2 space-y-1.5">
                                            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{t('settings.name')} <span className="text-primary">*</span></label>
                                            <input required type="text" value={companyForm.name} onChange={e => setCompanyForm(p => ({ ...p, name: e.target.value }))} placeholder={t('settings.name')} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder-slate-400 transition-all font-medium" />
                                        </div>
                                        <div className="md:col-span-3 space-y-1.5">
                                            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{t('settings.description')}</label>
                                            <input type="text" value={companyForm.description} onChange={e => setCompanyForm(p => ({ ...p, description: e.target.value }))} placeholder={t('settings.description')} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder-slate-400 transition-all font-medium" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{t('settings.vatCode')}</label>
                                            <input type="text" value={companyForm.vatCode} onChange={e => setCompanyForm(p => ({ ...p, vatCode: e.target.value }))} placeholder="e.g. 30-12345-6" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder-slate-400 transition-all font-medium" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{t('settings.website')}</label>
                                            <input type="url" value={companyForm.website} onChange={e => setCompanyForm(p => ({ ...p, website: e.target.value }))} placeholder="https://example.com" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder-slate-400 transition-all font-medium" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{t('settings.language')}</label>
                                            <select value={companyForm.language} onChange={e => setCompanyForm(p => ({ ...p, language: e.target.value }))} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-medium text-slate-700">
                                                <option value="">{t('settings.selectLanguage') || 'Select language'}</option>
                                                <option value="en">English</option>
                                                <option value="es">Español</option>
                                            </select>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{t('settings.userEmail')}</label>
                                            <input type="email" value={companyForm.email} onChange={e => setCompanyForm(p => ({ ...p, email: e.target.value }))} placeholder="email@company.com" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder-slate-400 transition-all font-medium" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{t('settings.contact')}</label>
                                            <input type="text" value={companyForm.phone} onChange={e => setCompanyForm(p => ({ ...p, phone: e.target.value }))} placeholder="+1 234 567 890" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder-slate-400 transition-all font-medium" />
                                        </div>
                                    </div>
                                </div>

                                {/* Location */}
                                <div>
                                    <h4 className="text-xs font-bold text-primary uppercase tracking-widest mb-4 pb-2 border-b border-slate-100">{t('settings.location')}</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="md:col-span-3 space-y-1.5">
                                            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{t('settings.address')}</label>
                                            <input type="text" value={companyForm.address} onChange={e => setCompanyForm(p => ({ ...p, address: e.target.value }))} placeholder={t('settings.address')} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder-slate-400 transition-all font-medium" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{t('settings.zipcode') || 'Zipcode'}</label>
                                            <input type="text" value={companyForm.zipcode} onChange={e => setCompanyForm(p => ({ ...p, zipcode: e.target.value }))} placeholder={t('settings.zipcode') || 'Zipcode'} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder-slate-400 transition-all font-medium" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{t('common.city' ) || 'City'}</label>
                                            <input type="text" value={companyForm.city} onChange={e => setCompanyForm(p => ({ ...p, city: e.target.value }))} placeholder={t('common.city' ) || 'City'} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder-slate-400 transition-all font-medium" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{t('settings.stateProvince')}</label>
                                            <input type="text" value={companyForm.state} onChange={e => setCompanyForm(p => ({ ...p, state: e.target.value }))} placeholder={t('settings.stateProvince')} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder-slate-400 transition-all font-medium" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{t('settings.country')}</label>
                                            <input type="text" value={companyForm.country} onChange={e => setCompanyForm(p => ({ ...p, country: e.target.value }))} placeholder={t('settings.country')} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder-slate-400 transition-all font-medium" />
                                        </div>
                                    </div>
                                </div>

                                {/* Classification */}
                                <div>
                                    <h4 className="text-xs font-bold text-primary uppercase tracking-widest mb-4 pb-2 border-b border-slate-100">{t('settings.classification')}</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{t('settings.type')}</label>
                                            <select value={companyForm.type} onChange={e => setCompanyForm(p => ({ ...p, type: e.target.value }))} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-medium text-slate-700">
                                                <option value="">{t('settings.selectType')}</option>
                                                {availableTypes.map(t => (
                                                    <option key={t.id} value={t.name}>{t.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{t('settings.category')}</label>
                                            <select value={companyForm.category} onChange={e => setCompanyForm(p => ({ ...p, category: e.target.value }))} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-medium text-slate-700">
                                                <option value="">{t('settings.selectCategory')}</option>
                                                {availableCats.map(c => (
                                                    <option key={c.id} value={c.name}>{c.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{t('settings.status')}</label>
                                            <select value={companyForm.status} onChange={e => setCompanyForm(p => ({ ...p, status: e.target.value as 'Active' | 'Inactive' }))} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-medium text-slate-700">
                                                <option value="Active">{t('settings.active')}</option>
                                                <option value="Inactive">{t('settings.inactive')}</option>
                                            </select>
                                        </div>
                                        <div className="md:col-span-3 space-y-1.5">
                                            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{t('settings.notes')}</label>
                                            <textarea rows={3} value={companyForm.notes} onChange={e => setCompanyForm(p => ({ ...p, notes: e.target.value }))} placeholder={t('settings.notesPlaceholder')} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder-slate-400 transition-all font-medium resize-none" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Modal footer */}
                            <div className="px-8 py-5 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 rounded-b-2xl">
                                <button type="button" onClick={() => setCompanyFormOpen(false)} className="px-6 py-2 bg-white border border-slate-200 text-slate-600 font-medium rounded-lg hover:bg-slate-50 transition-all text-sm">
                                    {t('common.cancel')}
                                </button>
                                <button type="submit" className="px-6 py-2 bg-primary text-white font-medium rounded-lg hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-all text-sm shadow-sm">
                                    {editingCompany ? t('settings.saveChanges') : t('settings.createCompany')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {categoryFormOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setCategoryFormOpen(false)}></div>
                    <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md animate-in zoom-in-95 duration-200 border border-white/20">
                        <div className="p-8">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-bold text-slate-900">
                                    {editingCategory ? (t('settings.editCategory') || 'Editar Categoría') : (t('settings.newCategory') || 'Nueva Categoría')}
                                </h3>
                                <button onClick={() => setCategoryFormOpen(false)} className="text-slate-400 hover:text-slate-600">
                                    <i className="fa-solid fa-xmark"></i>
                                </button>
                            </div>

                            <form onSubmit={handleSaveCategory} className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-slate-700">{t('settings.name') || 'Nombre'}</label>
                                    <input required type="text" value={categoryForm.name} onChange={e => setCategoryForm(p => ({ ...p, name: e.target.value }))} placeholder="Ej: Tecnología" className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder-slate-400 transition-all font-medium" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-slate-700">{t('settings.module') || 'Módulo'}</label>
                                    <input required type="text" value={categoryForm.module} onChange={e => setCategoryForm(p => ({ ...p, module: e.target.value }))} placeholder="Ej: Companies, Users, etc." className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder-slate-400 transition-all font-medium" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-slate-700">{t('settings.code') || 'Código'}</label>
                                    <input type="text" value={categoryForm.code} onChange={e => setCategoryForm(p => ({ ...p, code: e.target.value }))} placeholder="Ej: TECH" className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder-slate-400 transition-all font-medium" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-slate-700">{t('settings.description') || 'Descripción'}</label>
                                    <textarea value={categoryForm.description} onChange={e => setCategoryForm(p => ({ ...p, description: e.target.value }))} placeholder="Descripción de la Categoría..." className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder-slate-400 transition-all font-medium resize-none" rows={3} />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-slate-700">{t('settings.status') || 'Estado'}</label>
                                    <select value={categoryForm.status} onChange={e => setCategoryForm(p => ({ ...p, status: e.target.value as 'Active' | 'Inactive' }))} className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-medium">
                                        <option value="Active">{t('settings.active') || 'Activo'}</option>
                                        <option value="Inactive">{t('settings.inactive') || 'Inactivo'}</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-slate-700">Regla de Ordenamiento</label>
                                    <select value={categoryForm.sortingRule} onChange={e => setCategoryForm(p => ({ ...p, sortingRule: e.target.value as any }))} className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-medium">
                                        <option value="Manual">Manual (Drag and Drop)</option>
                                        <option value="Alpha_ASC">Alfabético Ascendente (A-Z)</option>
                                        <option value="Alpha_DESC">Alfabético Descendente (Z-A)</option>
                                    </select>
                                </div>
                                <div className="flex gap-3 pt-4 justify-end">
                                    <button type="button" onClick={() => setCategoryFormOpen(false)} className="px-6 py-2 bg-white border border-slate-200 text-slate-600 font-medium rounded-lg hover:bg-slate-50 transition-all text-sm">{t('common.cancel') || 'Cancelar'}</button>
                                    <button type="submit" className="px-6 py-2 bg-primary text-white font-medium rounded-lg hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-all text-sm shadow-sm">{t('common.save') || 'Guardar'}</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {itemFormOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setItemFormOpen(false)}></div>
                    <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md animate-in zoom-in-95 duration-200 border border-white/20">
                        <div className="p-8">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-bold text-slate-900">
                                    {editingCategoryItem ? (t('settings.editItem') || 'Editar Opción') : (t('settings.newItem') || 'Nueva Opción')}
                                </h3>
                                <button onClick={() => setItemFormOpen(false)} className="text-slate-400 hover:text-slate-600">
                                    <i className="fa-solid fa-xmark"></i>
                                </button>
                            </div>

                            <form onSubmit={handleSaveItem} className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-slate-700">{t('settings.nameLabel') || 'Nombre / Etiqueta'}</label>
                                    <input required type="text" value={itemForm.name} onChange={e => setItemForm(p => ({ ...p, name: e.target.value }))} placeholder="Ej: Hardware" className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder-slate-400 transition-all font-medium" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-slate-700">{t('settings.codeValue') || 'Valor / Código (único global)'}</label>
                                    <input
                                        required
                                        type="text"
                                        value={itemForm.code}
                                        onChange={e => setItemForm(p => ({ ...p, code: e.target.value }))}
                                        placeholder="Ej: HW"
                                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder-slate-400 transition-all font-medium"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-slate-700">Compañía (opcional)</label>
                                    <select
                                        value={itemForm.targetCompanyId}
                                        onChange={(e) => setItemForm((p) => ({ ...p, targetCompanyId: e.target.value }))}
                                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-medium"
                                    >
                                        <option value="">Todas las compañías del tenant</option>
                                        {scopeCompanies.map((c) => (
                                            <option key={c.id} value={c.id}>
                                                {c.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-slate-700">{t('settings.description') || 'Descripción'}</label>
                                    <textarea value={itemForm.description} onChange={e => setItemForm(p => ({ ...p, description: e.target.value }))} placeholder="Descripción de la Opción..." className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder-slate-400 transition-all font-medium resize-none" rows={3} />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-slate-700">{t('settings.status') || 'Estado'}</label>
                                    <select value={itemForm.status} onChange={e => setItemForm(p => ({ ...p, status: e.target.value as 'Active' | 'Inactive' }))} className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-medium">
                                        <option value="Active">{t('settings.active') || 'Activo'}</option>
                                        <option value="Inactive">{t('settings.inactive') || 'Inactivo'}</option>
                                    </select>
                                </div>
                                <div className="flex gap-3 pt-4 justify-end">
                                    <button type="button" onClick={() => setItemFormOpen(false)} className="px-6 py-2 bg-white border border-slate-200 text-slate-600 font-medium rounded-lg hover:bg-slate-50 transition-all text-sm">{t('common.cancel') || 'Cancelar'}</button>
                                    <button type="submit" className="px-6 py-2 bg-primary text-white font-medium rounded-lg hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-all text-sm shadow-sm">{t('common.save') || 'Guardar'}</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SettingsModule;
