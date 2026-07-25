import React from 'react';
import { ModuleClientDefinition } from '@sinapsis/module-sdk-client';
import CrmModule from './CrmModule';
import { CRM_TRANSLATIONS } from './translations';

const moduleDefinition: ModuleClientDefinition = {
  code: 'CRM',
  mainNav: {
    id: 'crm',
    icon: 'fa-handshake'
  },
  views: {
    CrmOverview: ({ setView, currentUser, companyId, onSubTitleChange }) => React.createElement(CrmModule, { view: 'overview', setView, currentUser, companyId, onSubTitleChange }),
    CrmPipeline: ({ setView, currentUser, companyId, onSubTitleChange }) => React.createElement(CrmModule, { view: 'pipeline', setView, currentUser, companyId, onSubTitleChange }),
    CrmActivities: ({ setView, currentUser, companyId, onSubTitleChange }) => React.createElement(CrmModule, { view: 'activities', setView, currentUser, companyId, onSubTitleChange }),
    CrmWonDeals: ({ setView, currentUser, companyId, onSubTitleChange }) => React.createElement(CrmModule, { view: 'won', setView, currentUser, companyId, onSubTitleChange })
  },
  sidebarSections: [
    {
      label: 'crm.title',
      items: [
        { name: 'crm.overview', view: 'CrmOverview', icon: 'fa-chart-line' },
        { name: 'crm.pipeline', view: 'CrmPipeline', icon: 'fa-filter-circle-dollar' },
        { name: 'crm.activities', view: 'CrmActivities', icon: 'fa-calendar-check' },
        { name: 'crm.wonDeals', view: 'CrmWonDeals', icon: 'fa-trophy' }
      ]
    }
  ],
  breadcrumbs: {
    CrmOverview: { main: 'crm.title', sub: 'crm.overview' },
    CrmPipeline: { main: 'crm.title', sub: 'crm.pipeline' },
    CrmActivities: { main: 'crm.title', sub: 'crm.activities' },
    CrmWonDeals: { main: 'crm.title', sub: 'crm.wonDeals' }
  },
  translations: CRM_TRANSLATIONS
};

export default moduleDefinition;
