import type { JSX } from 'react';
import type { AppUser, ViewType } from '@sinapsis/shared-types';

export interface ModuleRenderContext {
  setView: (view: ViewType) => void;
  currentUser?: AppUser;
  companyId?: string;
  onSubTitleChange?: (subtitle: string) => void;
}

export interface ModuleMenuItem {
  name: string;
  view: ViewType;
  icon: string;
}

export interface ModuleMenuSection {
  label: string;
  items: ModuleMenuItem[];
}

export interface ModuleBreadcrumb {
  main: string;
  sub: string;
  listTarget?: ViewType;
}

export interface ModuleClientDefinition {
  code: string;
  mainNav: {
    id: string;
    icon: string;
  };
  views: Partial<Record<ViewType, (ctx: ModuleRenderContext) => JSX.Element>>;
  sidebarSections: ModuleMenuSection[];
  breadcrumbs?: Partial<Record<ViewType, ModuleBreadcrumb>>;
  translations?: Partial<Record<string, Record<string, unknown>>>;
}
