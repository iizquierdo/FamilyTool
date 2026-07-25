import React from 'react';
import ExpenseModule from './ExpenseModule';
import { ModuleClientDefinition } from '@sinapsis/module-sdk-client';

const moduleDefinition: ModuleClientDefinition = {
  code: 'EXPENSES',
  mainNav: {
    id: 'expenses',
    icon: 'fa-wallet'
  },
  views: {
    Expenses: ({ setView, currentUser, companyId }) => React.createElement(ExpenseModule, { view: 'list', setView, currentUser, companyId }),
    RecurringExpenses: ({ setView, currentUser, companyId }) => React.createElement(ExpenseModule, { view: 'recurring', setView, currentUser, companyId }),
    ExchangeRates: ({ setView, currentUser, companyId }) => React.createElement(ExpenseModule, { view: 'rates', setView, currentUser, companyId })
  },
  sidebarSections: [
    {
      label: 'Expenses',
      items: [
        { name: 'Expenses', view: 'Expenses', icon: 'fa-receipt' },
        { name: 'Recurring', view: 'RecurringExpenses', icon: 'fa-arrows-rotate' },
        { name: 'Exchange Rates', view: 'ExchangeRates', icon: 'fa-money-bill-transfer' }
      ]
    }
  ],
  breadcrumbs: {
    Expenses: { main: 'Expenses', sub: 'Expenses' },
    RecurringExpenses: { main: 'Expenses', sub: 'Recurring' },
    ExchangeRates: { main: 'Expenses', sub: 'Exchange Rates' }
  }
};

export default moduleDefinition;
