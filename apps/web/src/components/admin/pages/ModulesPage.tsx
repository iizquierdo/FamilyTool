import React from 'react';
import ModuleManagement from '@/components/ModuleManagement';
import { getAdminToken } from '../api';

const ModulesPage: React.FC = () => {
  const token = getAdminToken();
  return <ModuleManagement apiBasePath="/api/admin/modules" defaultHeaders={{ Authorization: `Bearer ${token}` }} />;
};

export default ModulesPage;
