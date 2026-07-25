import React from 'react';
import { useTranslation } from 'react-i18next';
import type { ViewType } from '@/types';

export interface BreadcrumbBarProps {
  currentView?: string;
  subTitle?: string;
  setView?: (view: ViewType) => void;
  /** Module breadcrumbs may include `listTarget` for “back to list” navigation */
  moduleBreadcrumbs?: Record<string, { main: string; sub: string; listTarget?: string }>;
}

/**
 * Breadcrumb strip shown below the main header (see SinapsisShell).
 */
export const BreadcrumbBar: React.FC<BreadcrumbBarProps> = ({
  currentView = 'Dashboard',
  subTitle,
  setView,
  moduleBreadcrumbs = {}
}) => {
  const { t } = useTranslation();

  const viewBreadcrumbs: Record<string, { main: string; sub: string }> = {
    Dashboard: { main: t('topbar.main'), sub: t('sidebar.dashboard') },
    OrganizationSettings: { main: t('sidebar.settings'), sub: t('sidebar.organization') },
    MyPlanSettings: { main: t('sidebar.settings'), sub: t('sidebar.myPlan') },
    CompanySettings: { main: t('sidebar.settings'), sub: t('sidebar.companies') },
    UserSettings: { main: t('sidebar.settings'), sub: t('sidebar.users') },
    SMTPSettings: { main: t('sidebar.settings'), sub: t('sidebar.smtp') },
    LanguageSettings: { main: t('sidebar.settings'), sub: t('sidebar.translations') },
    BackupSettings: { main: t('sidebar.settings'), sub: t('sidebar.backup') || 'Backup' },
    PaymentSettings: { main: t('sidebar.settings'), sub: t('sidebar.payments') || 'Payments' },
    ReferenceSettings: { main: t('sidebar.settings'), sub: t('sidebar.references') },
    Users: { main: t('sidebar.administration'), sub: t('sidebar.users') },
    Account: { main: t('topbar.profile'), sub: t('topbar.myAccount') },
    CategorySettings: { main: t('sidebar.settings'), sub: t('sidebar.categories') || 'Categories' },
    ModuleSettings: { main: t('sidebar.settings'), sub: t('sidebar.modules') },
    RoleSettings: { main: t('sidebar.settings'), sub: t('sidebar.roles') },
    StorageSettings: { main: t('sidebar.settings'), sub: t('sidebar.storage') || 'Storage' },
    MenuSettings: { main: t('sidebar.settings'), sub: t('sidebar.menus') || 'Menus' },
    Profile: { main: t('topbar.profile') || 'Profile', sub: t('topbar.myProfile') || 'My Profile' }
  };

  const mergedBreadcrumbs = { ...viewBreadcrumbs, ...moduleBreadcrumbs };
  const rawBreadcrumb = mergedBreadcrumbs[currentView] || { main: 'topbar.app', sub: currentView };
  const breadcrumb = { main: t(rawBreadcrumb.main), sub: t(rawBreadcrumb.sub) };

  const moduleEntry = moduleBreadcrumbs[currentView];
  const moduleListView = moduleEntry?.listTarget;

  const canGoToCompanyList = currentView === 'CompanySettings' && Boolean(subTitle);
  const canGoToUserList = currentView === 'UserSettings' && Boolean(subTitle);
  const canGoToModuleList = Boolean(
    moduleEntry && setView && moduleListView && (currentView !== moduleListView || Boolean(subTitle))
  );
  const canGoToListFromBreadcrumb = canGoToCompanyList || canGoToUserList || canGoToModuleList;
  const subIsLastSegment = !subTitle;

  const handleBreadcrumbListClick = () => {
    if (canGoToModuleList && moduleListView) {
      setView?.(moduleListView);
      return;
    }

    if (canGoToCompanyList) {
      window.dispatchEvent(new CustomEvent('resetCompanySelection'));
      if (setView) setView('CompanySettings');
      return;
    }

    if (canGoToUserList) {
      window.dispatchEvent(new CustomEvent('resetUserSelection'));
      if (setView) setView('UserSettings');
    }
  };

  const homeIcon = (
    <i className="fa-solid fa-house text-[12px] leading-none" aria-hidden />
  );

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 md:gap-2">
      {setView ? (
        <button
          type="button"
          onClick={() => setView('Dashboard')}
          className="text-muted-foreground hover:text-foreground inline-flex shrink-0 items-center justify-center rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={t('breadcrumb.goHome')}
        >
          {homeIcon}
        </button>
      ) : (
        <span className="text-muted-foreground inline-flex shrink-0 items-center" aria-hidden>
          {homeIcon}
        </span>
      )}
      <span className="text-muted-foreground/60 shrink-0 text-[12px] font-normal" aria-hidden>
        /
      </span>
      <span className="text-foreground max-w-[min(100%,12rem)] truncate text-[12px] font-normal leading-tight md:max-w-none">
        {breadcrumb.main}
      </span>
      <span className="text-muted-foreground/60 shrink-0 text-[12px] font-normal" aria-hidden>
        /
      </span>
      <div className="text-muted-foreground flex min-w-0 flex-wrap items-center text-[12px] font-normal leading-tight">
        <span
          role={canGoToListFromBreadcrumb ? 'button' : undefined}
          tabIndex={canGoToListFromBreadcrumb ? 0 : undefined}
          onClick={canGoToListFromBreadcrumb ? handleBreadcrumbListClick : undefined}
          onKeyDown={
            canGoToListFromBreadcrumb
              ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleBreadcrumbListClick();
                  }
                }
              : undefined
          }
          className={
            canGoToListFromBreadcrumb
              ? subIsLastSegment
                ? 'cursor-pointer truncate font-normal text-brand transition-colors hover:text-brand/90'
                : 'cursor-pointer truncate font-normal text-foreground/80 transition-colors hover:text-foreground'
              : subIsLastSegment
                ? 'truncate font-normal text-brand'
                : 'truncate font-normal text-foreground/80'
          }
        >
          {breadcrumb.sub}
        </span>
        {subTitle && (
          <>
            <span className="text-muted-foreground/60 mx-1 shrink-0 font-normal">/</span>
            <span className="truncate font-normal text-brand">{subTitle}</span>
          </>
        )}
      </div>
    </nav>
  );
};
