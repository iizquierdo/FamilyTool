import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AppUser, ViewType } from '../types';
import { ModuleClientDefinition } from '../modules/module-contract';
import { AppHeaderNav } from './AppHeaderNav';

interface TopBarProps {
  onLogout?: () => void;
  user?: AppUser;
  onToggleSidebar?: () => void;
  setView?: (view: ViewType) => void;
  currentView?: string;
  activeModuleCodes?: string[];
  clientModules?: ModuleClientDefinition[];
  blockedViewKeys?: string[];
}

const nameInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
  }
  const p = parts[0] || '?';
  return (p.length >= 2 ? p.slice(0, 2) : `${p}${p}`).toUpperCase();
};

const TopBar: React.FC<TopBarProps> = ({
  onLogout,
  user,
  onToggleSidebar,
  setView,
  currentView,
  activeModuleCodes = [],
  clientModules = [],
  blockedViewKeys = []
}) => {
  const { t } = useTranslation();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const displayName = user?.name || [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() || 'Super Admin';
  const displayEmail = user?.email || 'admin@sinapsis.app';
  const rawAvatar = user?.avatar?.trim();
  const avatarSrc =
    rawAvatar && (rawAvatar.startsWith('http://') || rawAvatar.startsWith('https://') || rawAvatar.startsWith('/'))
      ? rawAvatar
      : '';

  return (
    <div
      role="banner"
      className="flex h-full min-h-0 w-full items-center justify-between gap-2 overflow-visible border-0 bg-transparent px-2 py-0 md:px-0"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-visible">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent lg:hidden"
          aria-label="Open menu"
        >
          <i className="fa-solid fa-bars"></i>
        </button>
        {setView && (
          <AppHeaderNav
            setView={setView}
            currentView={currentView}
            activeModuleCodes={activeModuleCodes}
            clientModules={clientModules}
            blockedViewKeys={blockedViewKeys}
          />
        )}
      </div>

      <div className="relative shrink-0" ref={userMenuRef}>
          <div
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="group flex cursor-pointer items-center gap-2 rounded-lg px-1 py-0.5 transition-all hover:bg-accent active:scale-95 md:gap-2"
          >
            <div className="hidden flex-col items-end justify-center gap-0.5 sm:flex">
              <span className="text-xs font-bold leading-tight text-foreground">{displayName}</span>
              <span className="text-[10px] font-medium leading-tight text-muted-foreground">{displayEmail}</span>
            </div>
            <div className="relative h-8 w-8 overflow-hidden rounded-lg border border-border shadow-sm transition-all group-hover:ring-2 group-hover:ring-primary/20">
              {avatarSrc ? (
                <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
              ) : (
                <div
                  className="flex h-full w-full items-center justify-center bg-primary/15 text-[10px] font-bold text-primary"
                  aria-hidden
                >
                  {nameInitials(displayName)}
                </div>
              )}
              <div className="absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-white bg-emerald-500"></div>
            </div>
          </div>

          {isUserMenuOpen && (
            <div className="animate-in fade-in zoom-in-95 absolute right-0 z-50 mt-2 w-52 rounded-xl border border-border bg-popover py-1.5 text-popover-foreground shadow-lg duration-200">
              <div className="mb-1 border-b border-border px-3 py-2">
                <p className="text-[11px] font-bold leading-none text-foreground">{displayName}</p>
                <p className="mt-1 text-[9px] font-medium text-muted-foreground">{displayEmail}</p>
              </div>

              <div className="p-1">
                <button
                  onClick={() => {
                    if (setView) setView('Profile');
                    setIsUserMenuOpen(false);
                  }}
                  className="group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[11px] font-bold text-foreground/80 transition-all hover:bg-accent hover:text-primary"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted transition-colors group-hover:bg-primary/10">
                    <i className="fa-solid fa-user text-[10px]"></i>
                  </div>
                  {t('topbar.myProfile')}
                </button>

                <div className="mx-2 my-1 h-px bg-border"></div>

                <button
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    if (onLogout) onLogout();
                  }}
                  className="group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[11px] font-bold text-primary transition-all hover:bg-primary/10"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 transition-colors group-hover:bg-primary/15">
                    <i className="fa-solid fa-right-from-bracket text-[10px]"></i>
                  </div>
                  {t('topbar.logout')}
                </button>
              </div>
            </div>
          )}
        </div>
    </div>
  );
};

export default TopBar;

