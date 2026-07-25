
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Role, AppPermission, SystemModule } from '../types';

const RoleManagement: React.FC = () => {
  const { t } = useTranslation();
  const [roles, setRoles] = useState<Role[]>([]);
  const [modules, setModules] = useState<SystemModule[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [roleForm, setRoleForm] = useState({
    name: '',
    description: '',
    permissions: [] as AppPermission[]
  });
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [rolesRes, modulesRes] = await Promise.all([
        fetch('/api/roles'),
        fetch('/api/modules')
      ]);

      if (rolesRes.ok && modulesRes.ok) {
        const rolesData = await rolesRes.json();
        const modulesData = await modulesRes.json();
        setRoles(rolesData);
        setModules(modulesData);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleEdit = (role: Role) => {
    setEditingRole(role);
    const formPermissions = modules.map(mod => {
      const existing = role.permissions?.find(p => p.moduleId === mod.id);
      return existing || {
        moduleId: mod.id,
        canRead: false,
        canWrite: false,
        canCreate: false,
        canDelete: false,
        moduleName: mod.name
      };
    }) as AppPermission[];

    setRoleForm({
      name: role.name,
      description: role.description || '',
      permissions: formPermissions
    });
    setIsModalOpen(true);
  };

  const handleCreate = () => {
    setEditingRole(null);
    setRoleForm({
      name: '',
      description: '',
      permissions: modules.map(mod => ({
        moduleId: mod.id,
        canRead: false,
        canWrite: false,
        canCreate: false,
        canDelete: false,
        moduleName: mod.name
      })) as AppPermission[]
    });
    setIsModalOpen(true);
  };

  const handlePermissionChange = (moduleId: string, field: keyof AppPermission, value: boolean) => {
    setRoleForm(prev => ({
      ...prev,
      permissions: prev.permissions.map(p =>
        p.moduleId === moduleId ? { ...p, [field]: value } : p
      )
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = editingRole ? `/api/roles/${editingRole.id}` : '/api/roles';
    const method = editingRole ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(roleForm)
      });
      if (res.ok) {
        setIsModalOpen(false);
        fetchData();
      }
    } catch (err) {
      console.error('Error saving role:', err);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-slate-400">
      <i className="fa-solid fa-circle-notch fa-spin text-3xl mb-4" />
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{t('settings.rolesTitle')}</h2>
          <p className="text-sm text-slate-500">{t('settings.rolesDesc')}</p>
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-xs font-bold uppercase tracking-widest text-primary-foreground transition-all hover:bg-primary/90"
        >
          <i className="fa-solid fa-plus text-[10px]" />
          {t('settings.addRole')}
        </button>
      </div>

      {/* Role Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {roles.map((role) => (
          <div key={role.id} className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm hover:shadow-md transition-shadow flex flex-col">
            <div className="mb-6">
              <h3 className="text-xl font-bold text-slate-900 mb-1">{role.name}</h3>
              <p className="text-xs text-slate-400 font-medium tracking-tight">
                {t('settings.rolesTitle')} · {role.totalUsers ?? 0} {t('users.user').toLowerCase()}
              </p>
            </div>

            <div className="flex-1 space-y-3 mb-8 min-h-[120px]">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">{t('settings.rolePermissions')}</p>
              <div className="flex flex-wrap gap-2">
                {role.permissions?.slice(0, 8).map((perm, i) => (
                  perm.canRead && (
                    <span key={i} className="px-2 py-1 bg-slate-50 text-[10px] text-slate-600 rounded-lg border border-slate-100 font-medium italic">
                      {perm.module?.name || perm.moduleName}
                    </span>
                  )
                ))}
                {(role.permissions?.length || 0) > 8 && <span className="text-[10px] text-slate-400">...</span>}
                {(role.permissions?.filter(p => p.canRead).length || 0) === 0 && (
                  <span className="text-[11px] text-slate-300 italic">{t('settings.noModules')}</span>
                )}
              </div>
            </div>

            <button
              onClick={() => handleEdit(role)}
              className="w-full bg-slate-50 text-slate-600 px-4 py-2.5 rounded-xl text-xs font-bold hover:bg-red-50 hover:text-red-600 transition-all border border-slate-100"
            >
              {t('settings.editRole')}
            </button>
          </div>
        ))}

        {/* Add new role card */}
        <div
          className="bg-white rounded-2xl border border-dashed border-slate-300 p-8 flex flex-col items-center justify-center min-h-[280px] text-center group cursor-pointer hover:border-red-300 transition-all"
          onClick={handleCreate}
        >
          <img
            src="https://preview.keenthemes.com/metronic8/demo1/assets/media/illustrations/sigma-1/4.png"
            className="w-36 h-36 object-contain mb-4 grayscale opacity-40 group-hover:grayscale-0 group-hover:opacity-100 transition-all"
            alt=""
          />
          <p className="text-red-500 font-bold text-sm group-hover:text-red-600 transition-colors">{t('settings.newRole')}</p>
        </div>
      </div>

      {/* Role Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ backgroundColor: 'rgba(15,23,42,0.45)' }}>
          <div className="absolute inset-0" onClick={() => setIsModalOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden">

            {/* Modal Header */}
            <div className="flex items-start justify-between px-8 py-6 border-b border-slate-100">
              <div>
                <h3 className="text-2xl font-bold text-slate-900">
                  {editingRole ? t('settings.editRole') : t('settings.newRole')}
                </h3>
                <p className="text-sm text-slate-500 mt-1">{t('settings.rolesDesc')}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-all mt-1"
              >
                <i className="fa-solid fa-xmark text-sm" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
              <div className="flex-1 overflow-y-auto px-8 py-6 space-y-8">

                {/* General Info */}
                <div>
                  <p className="text-xs font-bold text-red-500 uppercase tracking-widest mb-4">{t('settings.businessInfo')}</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        {t('settings.name')} <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={roleForm.name}
                        onChange={e => setRoleForm({ ...roleForm, name: e.target.value })}
                        placeholder={t('settings.rolesTitle')}
                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm shadow-sm focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400 placeholder-slate-400 transition-all"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        {t('settings.description')}
                      </label>
                      <input
                        type="text"
                        value={roleForm.description}
                        onChange={e => setRoleForm({ ...roleForm, description: e.target.value })}
                        placeholder="..."
                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm shadow-sm focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400 placeholder-slate-400 transition-all"
                      />
                    </div>
                  </div>
                </div>

                {/* Permissions Matrix */}
                <div>
                  <p className="text-xs font-bold text-red-500 uppercase tracking-widest mb-4">{t('settings.rolePermissions')}</p>
                  <div className="border border-slate-100 rounded-xl overflow-hidden">
                    {/* Table header */}
                    <div className="grid grid-cols-5 bg-slate-50 px-4 py-3 border-b border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest col-span-1">{t('sidebar.modules')}</span>
                      {['canRead', 'canCreate', 'canWrite', 'canDelete'].map(key => (
                        <span key={key} className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">
                          {key === 'canRead' ? 'Read' : key === 'canCreate' ? 'Create' : key === 'canWrite' ? 'Update' : 'Delete'}
                        </span>
                      ))}
                    </div>
                    {roleForm.permissions.length === 0 ? (
                      <div className="text-center py-8 text-slate-400">
                        <p className="text-xs">{t('settings.noModules')}</p>
                      </div>
                    ) : roleForm.permissions.map(perm => (
                      <div key={perm.moduleId} className="grid grid-cols-5 items-center px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                        <span className="text-sm font-semibold text-slate-700">{perm.module?.name || perm.moduleName}</span>
                        {(['canRead', 'canCreate', 'canWrite', 'canDelete'] as (keyof AppPermission)[]).map(field => (
                          <div key={field} className="flex justify-center">
                            <input
                              type="checkbox"
                              checked={perm[field] as boolean}
                              onChange={e => handlePermissionChange(perm.moduleId, field, e.target.checked)}
                              className="w-4 h-4 rounded border-slate-300 text-red-500 focus:ring-red-400 cursor-pointer transition-all"
                            />
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-8 py-5 border-t border-slate-100 flex items-center justify-end gap-3 bg-white">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-6 py-2.5 bg-white border border-slate-200 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-all text-sm"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="px-7 py-2.5 bg-red-500 text-white font-semibold rounded-lg hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-all text-sm shadow-sm"
                >
                  {editingRole ? t('common.save') : t('settings.addRole')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoleManagement;
