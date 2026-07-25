import React from 'react';
import MenuManagement from '@/components/MenuManagement';
import { getClientModules } from '@/module-registry';
import { getAdminToken } from '../api';

const MenusPage: React.FC = () => {
  const token = getAdminToken();
  const clientModules = getClientModules();
  const activeModuleCodes = clientModules.map((mod) => String(mod.code || '').toUpperCase());
  return (
    <MenuManagement
      clientModules={clientModules}
      activeModuleCodes={activeModuleCodes}
      apiBasePath="/api/admin/menu-config"
      defaultHeaders={{ Authorization: `Bearer ${token}` }}
    />
  );
};

export default MenusPage;
