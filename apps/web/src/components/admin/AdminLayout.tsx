import React from 'react';
import { Outlet } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import AdminSidebar from './AdminSidebar';

interface AdminLayoutProps {
  email?: string;
  onLogout: () => void;
}

const AdminLayout: React.FC<AdminLayoutProps> = ({ email, onLogout }) => {
  return (
    <div className="flex min-h-screen bg-background">
      <AdminSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b bg-card px-6 py-3">
          <div>
            <h1 className="text-lg font-semibold">SaaS Administration</h1>
            <p className="text-xs text-muted-foreground">{email || 'admin'}</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onLogout}>
            Logout
          </Button>
        </header>
        <main className="min-h-0 flex-1 overflow-auto bg-muted/50 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
