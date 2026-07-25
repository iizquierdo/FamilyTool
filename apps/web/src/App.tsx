import React, { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import { BreadcrumbBar } from './components/BreadcrumbBar';
import { LayoutProvider } from '@/components/layouts/layout-1/components/context';
import { SinapsisShell } from '@/components/layouts/sinapsis-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import AuthFlow, { AuthSessionPayload } from './components/AuthFlow';
import FileManager from './components/FileManager';
import { Wand2 } from 'lucide-react';

const UserAccount = lazy(() => import('./components/UserAccount'));
const SocialFeed = lazy(() => import('./components/SocialFeed'));
const ProjectManagement = lazy(() => import('./components/ProjectManagement'));
const TicketManagement = lazy(() => import('./components/TicketManagement'));
const UserManagement = lazy(() => import('./components/UserManagement'));
const RoleManagement = lazy(() => import('./components/RoleManagement'));
const SubscriptionManagement = lazy(() => import('./components/SubscriptionManagement'));
const InboxModule = lazy(() => import('./components/InboxModule'));
const ChatModule = lazy(() => import('./components/ChatModule'));
const CalendarModule = lazy(() => import('./components/CalendarModule'));
const FAQModule = lazy(() => import('./components/FAQModule'));
const InvoiceModule = lazy(() => import('./components/InvoiceModule'));
const SettingsModule = lazy(() => import('./components/SettingsModule'));
import { ViewType, Customer, AppUser } from '@sinapsis/shared-types';
import { CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, XAxis, YAxis } from 'recharts';
import { getBusinessAdvice } from './services/geminiService';
import { useTranslation } from 'react-i18next';
import { getClientModules } from './module-registry';
import type { ModuleClientDefinition } from '@sinapsis/module-sdk-client';
import AdminApp from './components/admin/AdminApp';

type PublicCorePayload = {
  appName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  loginBackgroundUrl?: string | null;
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
};

const MOCK_REVENUE = [
  { name: 'Mon', value: 4000 },
  { name: 'Tue', value: 3000 },
  { name: 'Wed', value: 2000 },
  { name: 'Thu', value: 2780 },
  { name: 'Fri', value: 1890 },
  { name: 'Sat', value: 2390 },
  { name: 'Sun', value: 3490 },
];

const AUTH_STORAGE_KEY = 'sinapsis.auth.session';
const VIEW_STORAGE_KEY = 'sinapsis.app.currentView';
const ALL_CLIENT_MODULES: ModuleClientDefinition[] = getClientModules();
const TENANT_BLOCKED_SETTINGS_VIEWS: ViewType[] = [
  'ModuleSettings',
  'SMTPSettings',
  'LanguageSettings',
  'StorageSettings',
  'MenuSettings'
];

const DEFAULT_APP_DISPLAY_NAME = 'Sinapsis CRM/ERP';
const DEFAULT_FAVICON_PATH = '/media/app/favicon.ico';

const faviconMimeForUrl = (href: string): string | undefined => {
  const lower = href.split('?')[0].toLowerCase();
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.ico')) return 'image/x-icon';
  return undefined;
};

const ViewSuspenseFallback = () => (
  <div className="text-muted-foreground flex min-h-[40vh] items-center justify-center text-sm">Loading…</div>
);

const getInitialView = (): ViewType => {
  const saved = localStorage.getItem(VIEW_STORAGE_KEY);
  return (saved || 'Dashboard') as ViewType;
};

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const { t, i18n } = useTranslation();
  const [currentView, setView] = useState<ViewType>(getInitialView);
  const [subTitle, setSubTitle] = useState<string>('');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('org');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [aiAdvice, setAiAdvice] = useState<string>(t('dashboard.loadingAIAdvice'));
  const [currentUser, setCurrentUser] = useState<AppUser | undefined>(undefined);
  const [activeModuleCodes, setActiveModuleCodes] = useState<string[]>([]);
  const [publicCore, setPublicCore] = useState<PublicCorePayload | null>(null);
  const publicCoreRef = useRef<PublicCorePayload | null>(null);
  publicCoreRef.current = publicCore;

  const readableModuleCodes = useMemo(() => {
    const permissions = currentUser?.roleRef?.permissions || [];
    const legacyRole = String(currentUser?.role || '').trim().toLowerCase();
    const hasAdminRole = legacyRole === 'administrator' || legacyRole === 'admin';

    if (hasAdminRole) {
      return activeModuleCodes;
    }

    const byPermission = new Set(
      permissions
        .filter((perm) => Boolean(perm?.canRead))
        .map((perm) => String(perm?.module?.code || perm?.moduleCode || '').toUpperCase())
        .filter(Boolean)
    );

    if (byPermission.size === 0) return [];
    return activeModuleCodes.filter((code) => byPermission.has(String(code || '').toUpperCase()));
  }, [activeModuleCodes, currentUser]);

  const activeClientModules = useMemo(
    () => ALL_CLIENT_MODULES.filter((module) => readableModuleCodes.includes(String(module.code || '').toUpperCase())),
    [readableModuleCodes]
  );

  const dynamicModuleViews = activeClientModules.reduce((acc, module) => {
    for (const [view, render] of Object.entries(module.views)) {
      if (!render) continue;
      acc[view as ViewType] = render;
    }
    return acc;
  }, {} as Partial<Record<ViewType, (ctx: { setView: (view: ViewType) => void; currentUser?: AppUser; companyId?: string; onSubTitleChange?: (subtitle: string) => void }) => React.ReactElement>>);

  const dynamicModuleViewNames = Object.keys(dynamicModuleViews) as ViewType[];
  const dynamicBreadcrumbs = activeClientModules.reduce((acc, module) => ({ ...acc, ...(module.breadcrumbs || {}) }), {} as Record<string, { main: string; sub: string; listTarget?: string; resetEvent?: string }>);

  const resolveUserLanguage = (language?: string | null) => {
    const code = String(language || '').trim().toLowerCase();
    if (code.startsWith('es') || code === 'español' || code === 'espanol') return 'es';
    if (code.startsWith('en') || code === 'english') return 'en';
    return 'en';
  };

  const applyUserLanguage = (language?: string | null) => {
    i18n.changeLanguage(resolveUserLanguage(language));
  };

  const resolveBrowserLanguage = () => {
    const code = String((typeof navigator !== 'undefined' ? navigator.language : 'en') || 'en').toLowerCase();
    return code.startsWith('es') ? 'es' : 'en';
  };

  useEffect(() => {
    const loadCore = async () => {
      try {
        const res = await fetch('/api/public/core');
        if (!res.ok) return;
        const data = (await res.json()) as PublicCorePayload;
        setPublicCore(data);
      } catch {
        setPublicCore(null);
      }
    };
    void loadCore();
  }, []);

  useEffect(() => {
    if (!publicCore) return;
    const root = document.documentElement;
    if (publicCore.primaryColor) {
      root.style.setProperty('--primary', publicCore.primaryColor);
      root.style.setProperty('--brand', publicCore.primaryColor);
    }
    if (publicCore.secondaryColor) {
      root.style.setProperty('--secondary', publicCore.secondaryColor);
    }
  }, [publicCore]);

  useEffect(() => {
    if (!publicCore || isAuthenticated) return;
    applyUserLanguage(publicCore.defaultLanguage);
  }, [publicCore, isAuthenticated]);

  useEffect(() => {
    if (!publicCore || !isAuthenticated || !currentUser) return;
    if (currentUser.language) return;
    applyUserLanguage(publicCore.defaultLanguage);
  }, [publicCore, isAuthenticated, currentUser?.id, currentUser?.language]);

  const headerShellStyle = useMemo(() => {
    if (!publicCore?.menuBarColor?.trim()) return undefined;
    return { backgroundColor: publicCore.menuBarColor } as React.CSSProperties;
  }, [publicCore?.menuBarColor]);

  const displayAppName = useMemo(
    () => publicCore?.appName?.trim() || DEFAULT_APP_DISPLAY_NAME,
    [publicCore?.appName]
  );
  const faviconHref = useMemo(
    () => publicCore?.faviconUrl?.trim() || DEFAULT_FAVICON_PATH,
    [publicCore?.faviconUrl]
  );
  const faviconType = useMemo(() => faviconMimeForUrl(faviconHref), [faviconHref]);

  useEffect(() => {
    document.title = displayAppName;
    document.querySelectorAll('link[rel="icon"],link[rel="shortcut icon"]').forEach((el) => {
      if (el.id !== 'sinapsis-favicon') el.remove();
    });
    let link = document.getElementById('sinapsis-favicon') as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.id = 'sinapsis-favicon';
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = faviconHref;
    if (faviconType) link.setAttribute('type', faviconType);
    else link.removeAttribute('type');
  }, [displayAppName, faviconHref, faviconType]);

  useEffect(() => {
    const restoreSession = async () => {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      if (!raw) {
        setAuthReady(true);
        return;
      }

      try {
        const parsed = JSON.parse(raw);
        const token = String(parsed?.token || '');
        if (!token) {
          localStorage.removeItem(AUTH_STORAGE_KEY);
          setAuthReady(true);
          return;
        }

        const res = await fetch('/api/auth/session', {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!res.ok) {
          localStorage.removeItem(AUTH_STORAGE_KEY);
          setAuthReady(true);
          return;
        }

        const data = await res.json();
        const user = data?.user;

        if (!user) {
          localStorage.removeItem(AUTH_STORAGE_KEY);
          setAuthReady(true);
          return;
        }

        setCurrentUser({
          ...user,
          name: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
          lastLogin: new Date().toISOString(),
          joinedDate: user.createdAt || new Date().toISOString(),
          twoStep: false
        });
        setIsAuthenticated(true);
        applyUserLanguage(user.language || null);
      } catch (error) {
        console.error('Error restoring auth session:', error);
        localStorage.removeItem(AUTH_STORAGE_KEY);
      } finally {
        setAuthReady(true);
      }
    };

    restoreSession();
  }, []);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      // #region agent log
      if ((window as any).__fetchDepth === undefined) (window as any).__fetchDepth = 0;
      (window as any).__fetchDepth++;
      if ((window as any).__fetchDepth > 10) {
        const stack = new Error('fetch interceptor recursion detected').stack || '';
        localStorage.setItem('dbg-902272-err', JSON.stringify({ msg: 'recursion', depth: (window as any).__fetchDepth, stack: stack.slice(0, 2000), ts: Date.now() }));
        (window as any).__fetchDepth = 0;
        throw new RangeError('[DBG-902272] fetch interceptor called recursively – check localStorage["dbg-902272-err"]');
      }
      // #endregion
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      let token = '';
      try {
        token = raw ? String(JSON.parse(raw || '{}')?.token || '') : '';
      } catch {
        token = '';
      }

      const rawUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : typeof Request !== 'undefined' && input instanceof Request
              ? input.url
              : '';

      const pathForApiGate = (() => {
        const base = (rawUrl || '').split('#')[0];
        if (base.startsWith('/')) return base;
        if (base.startsWith('http://') || base.startsWith('https://')) {
          try {
            const u = new URL(base);
            if (u.origin === window.location.origin) {
              return `${u.pathname}${u.search}`;
            }
          } catch {
            /* ignore */
          }
        }
        return '';
      })();

      const isApiRequest = pathForApiGate.startsWith('/api/');
      const isAdminApiRequest = pathForApiGate.startsWith('/api/admin/');
      if (!isApiRequest || isAdminApiRequest) {
        return originalFetch(input, init);
      }

      const headers = new Headers(init?.headers || (typeof input === 'object' && 'headers' in input ? input.headers : undefined));
      if (token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      if (currentUser?.id && !headers.has('X-User-Id')) {
        headers.set('X-User-Id', currentUser.id);
      }

      // #region agent log
      (window as any).__fetchDepth--;
      // #endregion
      return originalFetch(input, {
        ...(init || {}),
        headers
      });
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [currentUser?.id]);

  const handleLoginSuccess = (payload: AuthSessionPayload) => {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token: payload.token }));

    const user = payload.user || {};
    setCurrentUser({
      ...user,
      name: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
      lastLogin: new Date().toISOString(),
      joinedDate: user.createdAt || new Date().toISOString(),
      twoStep: false
    });
    setIsAuthenticated(true);
    applyUserLanguage(user.language || publicCoreRef.current?.defaultLanguage || null);
  };

  const handleSetView = (view: ViewType) => {
    if (TENANT_BLOCKED_SETTINGS_VIEWS.includes(view)) {
      setView('Dashboard');
      setSubTitle('');
      setIsSidebarOpen(false);
      return;
    }
    setView(view);
    setSubTitle('');
    setIsSidebarOpen(false);
    if (isAuthenticated) {
      localStorage.setItem(VIEW_STORAGE_KEY, view);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      localStorage.setItem(VIEW_STORAGE_KEY, currentView);
    }
  }, [isAuthenticated, currentView]);
  const refreshActiveModules = () => {
    fetch('/api/modules')
      .then((res) => (res.ok ? res.json() : []))
      .then((mods: { code?: string; status?: string }[]) => {
        const codes = mods
          .filter((mod) => String(mod.status || '') === 'Active')
          .map((mod) => String(mod.code || '').toUpperCase())
          .filter(Boolean);
        setActiveModuleCodes(codes);
      })
      .catch(() => setActiveModuleCodes([]));
  };

  useEffect(() => {
    if (!isAuthenticated) {
      setActiveModuleCodes([]);
      return;
    }

    refreshActiveModules();
    window.addEventListener('modulesUpdated', refreshActiveModules);
    return () => window.removeEventListener('modulesUpdated', refreshActiveModules);
  }, [isAuthenticated]);

  useEffect(() => {
    if (TENANT_BLOCKED_SETTINGS_VIEWS.includes(currentView)) {
      setView('Dashboard');
      return;
    }

    if (dynamicModuleViewNames.includes(currentView)) return;

    const knownStaticViews: ViewType[] = [
      'Dashboard', 'Projects', 'Social', 'Profile', 'Tickets', 'Users',
      'Roles', 'Subscriptions', 'FileManager', 'Inbox', 'Chat', 'Calendar',
      'FAQ', 'Invoices', 'CreateInvoice', 'InvoiceDetail',
      'OrganizationSettings', 'MyPlanSettings', 'CompanySettings', 'SMTPSettings', 'LanguageSettings',
      'BackupSettings', 'PaymentSettings', 'UserSettings', 'RoleSettings',
      'ModuleSettings', 'CategorySettings', 'ReferenceSettings', 'StorageSettings', 'MenuSettings'
    ];

    if (!knownStaticViews.includes(currentView)) {
      setView('Dashboard');
    }
  }, [currentView, dynamicModuleViewNames]);

  const handleCurrentUserUpdate = (nextUser: AppUser) => {
    setCurrentUser((prev) => {
      if (!prev) return nextUser;
      return {
        ...prev,
        ...nextUser,
        name: nextUser.name || [nextUser.firstName, nextUser.lastName].filter(Boolean).join(' ').trim() || prev.name
      };
    });
  };

  useEffect(() => {
    console.log('[DEBUG] App Context - selectedCompanyId:', selectedCompanyId);
  }, [selectedCompanyId]);

  const [customers] = useState<Customer[]>([
    { id: '1', name: 'Acme Corp', email: 'contact@acme.com', status: 'Active', value: 12500, lastContact: '2h ago' },
    { id: '2', name: 'Global Tech', email: 'hr@global.tech', status: 'Lead', value: 3200, lastContact: '1d ago' },
    { id: '3', name: 'Nexus Ltd', email: 'support@nexus.io', status: 'Active', value: 45000, lastContact: '5m ago' },
  ]);

  useEffect(() => {
    if (isAuthenticated) {
      const fetchAdvice = async () => {
        const advice = await getBusinessAdvice('Current revenue is stable, but client Acme Corp has high potential. Inventory is at 80% capacity.');
        setAiAdvice(advice || t('dashboard.noAdviceAvailable'));
      };
      fetchAdvice();
    }
  }, [isAuthenticated, t]);

  const handleLogout = async () => {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      const token = raw ? JSON.parse(raw)?.token : '';
      if (token) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        });
      }
    } catch (error) {
      console.error('Error in logout:', error);
    } finally {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      localStorage.removeItem(VIEW_STORAGE_KEY);
      setIsAuthenticated(false);
      setCurrentUser(undefined);
      setView('Dashboard');
      setSubTitle('');
      setSelectedCompanyId('org');
      i18n.changeLanguage(resolveBrowserLanguage());
    }
  };

  if (!authReady) {
    return (
      <div className="text-muted-foreground flex min-h-screen items-center justify-center bg-background">
        Loading session...
      </div>
    );
  }

  const renderDashboard = () => (
    <div className="animate-in fade-in space-y-6 duration-500">
      <Card className="shadow-xs">
        <CardContent className="pt-6">
          <h2 className="text-foreground text-2xl font-bold">Consola de administración · FamilyTool</h2>
          <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
            Este panel es solo para <strong>administración y configuración</strong> de la familia.
            La app que usan los miembros (billetera, tareas, responsabilidades, metas y
            gamificación) es la <strong>PWA</strong>.
          </p>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              { icon: 'fa-users', title: 'Miembros', desc: 'Gestioná las personas de la familia y sus roles.', view: 'Users' },
              { icon: 'fa-user-shield', title: 'Roles', desc: 'Definí permisos (padre/hijo) del sistema.', view: 'Roles' },
              { icon: 'fa-gear', title: 'Configuración', desc: 'Organización, sucursales y branding de la app.', view: 'OrganizationSettings' },
            ].map((c, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setView(c.view)}
                className="border-input hover:bg-muted/50 rounded-xl border p-4 text-left transition-colors"
              >
                <div className="bg-primary/10 text-primary mb-3 inline-flex rounded-lg p-2">
                  <i className={`fa-solid ${c.icon}`}></i>
                </div>
                <h3 className="text-foreground font-semibold">{c.title}</h3>
                <p className="text-muted-foreground mt-1 text-sm">{c.desc}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const authenticatedBody = (
    <>
      {currentView === 'Dashboard' && renderDashboard()}
            {currentView === 'Projects' && <ProjectManagement />}
            {currentView === 'Social' && <SocialFeed />}
            {currentView === 'Profile' && <UserAccount user={currentUser} onUserUpdate={handleCurrentUserUpdate} />}
            {currentView === 'Tickets' && <TicketManagement />}
            {currentView === 'Users' && <UserManagement companyFilter={selectedCompanyId === 'org' ? undefined : selectedCompanyId} />}
            {currentView === 'Roles' && <RoleManagement />}
            {currentView === 'Subscriptions' && <SubscriptionManagement />}
            {currentView === 'FileManager' && <FileManager />}
            {currentView === 'Inbox' && <InboxModule />}
            {currentView === 'Chat' && <ChatModule />}
            {currentView === 'Calendar' && <CalendarModule />}
            {currentView === 'FAQ' && <FAQModule />}
            {currentView === 'Invoices' && <InvoiceModule view="list" setView={setView} />}
            {currentView === 'CreateInvoice' && <InvoiceModule view="create" setView={setView} />}
            {currentView === 'InvoiceDetail' && <InvoiceModule view="detail" setView={setView} />}
            {dynamicModuleViews[currentView]?.({
              setView,
              currentUser,
              companyId: selectedCompanyId === 'org' ? undefined : selectedCompanyId,
              onSubTitleChange: setSubTitle
            })}
            {currentView === 'OrganizationSettings' && <SettingsModule view="Organization" companyFilter={selectedCompanyId === 'org' ? undefined : selectedCompanyId} />}
            {currentView === 'MyPlanSettings' && <SettingsModule view="MyPlan" companyFilter={selectedCompanyId === 'org' ? undefined : selectedCompanyId} />}
            {currentView === 'CompanySettings' && <SettingsModule view="Companies" companyFilter={selectedCompanyId === 'org' ? undefined : selectedCompanyId} onSubTitleChange={setSubTitle} />}
            {currentView === 'SMTPSettings' && <SettingsModule view="SMTP" companyFilter={selectedCompanyId === 'org' ? undefined : selectedCompanyId} />}
            {currentView === 'LanguageSettings' && <SettingsModule view="Languages" companyFilter={selectedCompanyId === 'org' ? undefined : selectedCompanyId} />}
            {currentView === 'BackupSettings' && <SettingsModule view="Backup" companyFilter={selectedCompanyId === 'org' ? undefined : selectedCompanyId} />}
            {currentView === 'PaymentSettings' && <SettingsModule view="Payments" companyFilter={selectedCompanyId === 'org' ? undefined : selectedCompanyId} />}
            {currentView === 'UserSettings' && <SettingsModule view="Users" companyFilter={selectedCompanyId === 'org' ? undefined : selectedCompanyId} onSubTitleChange={setSubTitle} />}
            {currentView === 'RoleSettings' && <SettingsModule view="RoleSettings" companyFilter={selectedCompanyId === 'org' ? undefined : selectedCompanyId} />}
            {currentView === 'ModuleSettings' && <SettingsModule view="ModuleSettings" companyFilter={selectedCompanyId === 'org' ? undefined : selectedCompanyId} />}
            {currentView === 'CategorySettings' && <SettingsModule view="Categories" companyFilter={selectedCompanyId === 'org' ? undefined : selectedCompanyId} onSubTitleChange={setSubTitle} />}
            {currentView === 'ReferenceSettings' && <SettingsModule view="References" companyFilter={selectedCompanyId === 'org' ? undefined : selectedCompanyId} />}
            {currentView === 'StorageSettings' && <SettingsModule view="Storage" companyFilter={selectedCompanyId === 'org' ? undefined : selectedCompanyId} />}
            {currentView === 'MenuSettings' && (
              <SettingsModule
                view="Menus"
                companyFilter={selectedCompanyId === 'org' ? undefined : selectedCompanyId}
                clientModules={ALL_CLIENT_MODULES}
                activeModuleCodes={readableModuleCodes}
              />
            )}

      {![
        'Dashboard', 'Projects', 'Social', 'Profile', 'Tickets', 'Users',
        'Roles', 'Subscriptions', 'FileManager', 'Inbox', 'Chat', 'Calendar',
        'FAQ', 'Invoices', 'CreateInvoice', 'InvoiceDetail', ...dynamicModuleViewNames,
        'OrganizationSettings', 'MyPlanSettings', 'CompanySettings', 'SMTPSettings', 'LanguageSettings', 'BackupSettings', 'PaymentSettings', 'UserSettings', 'RoleSettings', 'ModuleSettings', 'CategorySettings', 'ReferenceSettings', 'StorageSettings', 'MenuSettings'
      ].includes(currentView) && (
        <div className="text-muted-foreground flex h-[60vh] flex-col items-center justify-center">
          <i className="fa-solid fa-rocket mb-4 text-6xl opacity-20"></i>
          <h2 className="text-foreground text-xl font-bold">{currentView} Module</h2>
          <p>This module is under development.</p>
        </div>
      )}
    </>
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-background">
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Routes>
          <Route path="/admin/*" element={<AdminApp />} />
          <Route
            path="*"
            element={
              isAuthenticated ? (
                <LayoutProvider>
                  <SinapsisShell
                    headerStyle={headerShellStyle}
                    headerLeading={<i className="fa-solid fa-bars shrink-0 text-lg text-muted-foreground" aria-hidden />}
                    footerAppNavigation={{
                      setView: handleSetView,
                      currentView,
                      activeModuleCodes: readableModuleCodes,
                      clientModules: ALL_CLIENT_MODULES,
                      blockedViewKeys: TENANT_BLOCKED_SETTINGS_VIEWS
                    }}
                    footerAppName={displayAppName}
                    sidebar={
                      <Sidebar
                        currentView={currentView}
                        setView={handleSetView}
                        selectedCompanyId={selectedCompanyId}
                        onCompanyChange={setSelectedCompanyId}
                        allowedCompanyIds={currentUser?.accessCompanyIds || []}
                        userCompanyId={currentUser?.companyId}
                        mobileOpen={isSidebarOpen}
                        onMobileClose={() => setIsSidebarOpen(false)}
                        activeModuleCodes={readableModuleCodes}
                        clientModules={ALL_CLIENT_MODULES}
                        sidebarBackgroundColor={publicCore?.sidebarBackgroundColor}
                        sidebarLogoUrl={publicCore?.sidebarLogoUrl}
                      />
                    }
                    header={
                      <TopBar
                        onLogout={handleLogout}
                        user={currentUser}
                        onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
                        setView={handleSetView}
                        currentView={currentView}
                        activeModuleCodes={readableModuleCodes}
                        clientModules={ALL_CLIENT_MODULES}
                      />
                    }
                    breadcrumb={
                      <BreadcrumbBar
                        currentView={currentView}
                        subTitle={subTitle}
                        setView={handleSetView}
                        moduleBreadcrumbs={dynamicBreadcrumbs}
                      />
                    }
                  >
                    <Suspense fallback={<ViewSuspenseFallback />}>{authenticatedBody}</Suspense>
                  </SinapsisShell>
                </LayoutProvider>
              ) : (
                <AuthFlow
                  onLoginSuccess={handleLoginSuccess}
                  appName={displayAppName}
                  logoUrl={publicCore?.logoUrl?.trim() || null}
                  loginBackgroundUrl={publicCore?.loginBackgroundUrl?.trim() || null}
                />
              )
            }
          />
        </Routes>
      </BrowserRouter>
    </div>
  );
};

export default App;










