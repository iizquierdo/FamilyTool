import React from 'react';
import FinancialDocumentsModule from './FinancialDocumentsModule';
import { FINANCIAL_TRANSLATIONS } from './translations';
import { ModuleClientDefinition } from '@sinapsis/module-sdk-client';

const moduleDefinition: ModuleClientDefinition = {
  code: 'FIN_DOCS',
  mainNav: {
    id: 'financial-documents',
    icon: 'fa-file-invoice-dollar'
  },
  views: {
    FinancialDocuments: ({ setView, currentUser, companyId }) => React.createElement(FinancialDocumentsModule, { view: 'all', setView, currentUser, companyId }),
    FinancialInvoices: ({ setView, currentUser, companyId }) => React.createElement(FinancialDocumentsModule, { view: 'invoices', setView, currentUser, companyId }),
    FinancialCreditMemos: ({ setView, currentUser, companyId }) => React.createElement(FinancialDocumentsModule, { view: 'credit-memos', setView, currentUser, companyId }),
    FinancialDebitMemos: ({ setView, currentUser, companyId }) => React.createElement(FinancialDocumentsModule, { view: 'debit-memos', setView, currentUser, companyId }),
    FinancialPurchaseOrders: ({ setView, currentUser, companyId }) => React.createElement(FinancialDocumentsModule, { view: 'purchase-orders', setView, currentUser, companyId }),
    FinancialReceipts: ({ setView, currentUser, companyId }) => React.createElement(FinancialDocumentsModule, { view: 'receipts', setView, currentUser, companyId }),
    FinancialDeliveryNotes: ({ setView, currentUser, companyId }) => React.createElement(FinancialDocumentsModule, { view: 'delivery-notes', setView, currentUser, companyId }),
    FinancialDocumentDetails: ({ setView, currentUser, companyId }) => React.createElement(FinancialDocumentsModule, { view: 'details', setView, currentUser, companyId })
  },
  sidebarSections: [
    {
      label: 'financial.title',
      items: [
        { name: 'financial.allDocuments', view: 'FinancialDocuments', icon: 'fa-layer-group' },
        { name: 'financial.invoices', view: 'FinancialInvoices', icon: 'fa-file-invoice' },
        { name: 'financial.creditMemos', view: 'FinancialCreditMemos', icon: 'fa-file-circle-minus' },
        { name: 'financial.debitMemos', view: 'FinancialDebitMemos', icon: 'fa-file-circle-plus' },
        { name: 'financial.purchaseOrders', view: 'FinancialPurchaseOrders', icon: 'fa-cart-flatbed' },
        { name: 'financial.receipts', view: 'FinancialReceipts', icon: 'fa-receipt' },
        { name: 'financial.deliveryNotes', view: 'FinancialDeliveryNotes', icon: 'fa-truck' }
      ]
    }
  ],
  breadcrumbs: {
    FinancialDocuments: { main: 'financial.title', sub: 'financial.allDocuments' },
    FinancialInvoices: { main: 'financial.title', sub: 'financial.invoices' },
    FinancialCreditMemos: { main: 'financial.title', sub: 'financial.creditMemos' },
    FinancialDebitMemos: { main: 'financial.title', sub: 'financial.debitMemos' },
    FinancialPurchaseOrders: { main: 'financial.title', sub: 'financial.purchaseOrders' },
    FinancialReceipts: { main: 'financial.title', sub: 'financial.receipts' },
    FinancialDeliveryNotes: { main: 'financial.title', sub: 'financial.deliveryNotes' },
    FinancialDocumentDetails: { main: 'financial.title', sub: 'financial.documentDetails' }
  },
  translations: FINANCIAL_TRANSLATIONS
};

export default moduleDefinition;
