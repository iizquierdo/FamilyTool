import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import AdminLogin from './AdminLogin';
import { useAdminSession } from './hooks/useAdminSession';
import OrganizationsPage from './pages/OrganizationsPage';
import ModulesPage from './pages/ModulesPage';
import SmtpPage from './pages/SmtpPage';
import StoragePage from './pages/StoragePage';
import TranslationsPage from './pages/TranslationsPage';
import MenusPage from './pages/MenusPage';
import ConfigurationPage from './pages/ConfigurationPage';
import CategoriesPage from './pages/CategoriesPage';
import ReferencesPage from './pages/ReferencesPage';
import AssetsAdminPage from './pages/AssetsAdminPage';
import SubscriptionPlansPage from './pages/SubscriptionPlansPage';

const AdminProtectedRoutes: React.FC<{ email?: string; onLogout: () => void }> = ({ email, onLogout }) => (
  <Routes>
    <Route element={<AdminLayout email={email} onLogout={onLogout} />}>
      <Route path="organizations" element={<OrganizationsPage />} />
      <Route path="subscription-plans" element={<SubscriptionPlansPage />} />
      <Route path="assets" element={<AssetsAdminPage />} />
      <Route path="settings/modules" element={<ModulesPage />} />
      <Route path="settings/smtp" element={<SmtpPage />} />
      <Route path="settings/storage" element={<StoragePage />} />
      <Route path="settings/translations" element={<TranslationsPage />} />
      <Route path="settings/menus" element={<MenusPage />} />
      <Route path="settings/configuration" element={<ConfigurationPage />} />
      <Route path="settings/categories" element={<CategoriesPage />} />
      <Route path="settings/references" element={<ReferencesPage />} />
      <Route path="*" element={<Navigate to="/admin/organizations" replace />} />
    </Route>
  </Routes>
);

const AdminApp: React.FC = () => {
  const { ready, isAuthenticated, email, logout, completeLogin } = useAdminSession();

  if (!ready) {
    return <div className="flex min-h-screen items-center justify-center">Loading admin session...</div>;
  }

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="login" element={<AdminLogin onLoginSuccess={completeLogin} />} />
        <Route path="*" element={<Navigate to="/admin/login" replace />} />
      </Routes>
    );
  }

  return <AdminProtectedRoutes email={email} onLogout={logout} />;
};

export default AdminApp;
