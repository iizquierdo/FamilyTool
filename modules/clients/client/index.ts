import { CLIENT_TRANSLATIONS } from './translations';
import React from 'react';
import ClientModule from './ClientModule';
import { ModuleClientDefinition } from '@sinapsis/module-sdk-client';

const moduleDefinition: ModuleClientDefinition = {
  code: 'CLIENTS',
  mainNav: {
    id: 'clients',
    icon: 'fa-users'
  },
  views: {
    Clients: ({ setView, currentUser, companyId, onSubTitleChange }) => React.createElement(ClientModule, { view: 'all', setView, currentUser, companyId, onSubTitleChange }),
    ClientLeads: ({ setView, currentUser, companyId, onSubTitleChange }) => React.createElement(ClientModule, { view: 'leads', setView, currentUser, companyId, onSubTitleChange }),
    ClientActive: ({ setView, currentUser, companyId, onSubTitleChange }) => React.createElement(ClientModule, { view: 'active', setView, currentUser, companyId, onSubTitleChange }),
    ClientInactive: ({ setView, currentUser, companyId, onSubTitleChange }) => React.createElement(ClientModule, { view: 'inactive', setView, currentUser, companyId, onSubTitleChange }),
    ClientDetails: ({ setView, currentUser, companyId, onSubTitleChange }) => React.createElement(ClientModule, { view: 'details', setView, currentUser, companyId, onSubTitleChange })
  },
  sidebarSections: [
    {
      label: 'clients.title',
      items: [
        { name: 'clients.allClients', view: 'Clients', icon: 'fa-layer-group' },
        { name: 'clients.leads', view: 'ClientLeads', icon: 'fa-user-clock' },
        { name: 'clients.active', view: 'ClientActive', icon: 'fa-user-check' },
        { name: 'clients.inactive', view: 'ClientInactive', icon: 'fa-user-slash' }
      ]
    }
  ],
  breadcrumbs: {
    Clients: { main: 'clients.title', sub: 'clients.allClients' },
    ClientLeads: { main: 'clients.title', sub: 'clients.leads' },
    ClientActive: { main: 'clients.title', sub: 'clients.active' },
    ClientInactive: { main: 'clients.title', sub: 'clients.inactive' },
    ClientDetails: { main: 'clients.title', sub: 'clients.allClients', listTarget: 'Clients' }
  },
  translations: CLIENT_TRANSLATIONS
};

export default moduleDefinition;

