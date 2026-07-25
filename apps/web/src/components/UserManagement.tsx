import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AppUser, SYSTEM_LANGUAGES } from '../types';
import UserProfile from './UserProfile';
import { useTranslation } from 'react-i18next';
import {
  type ColumnDef,
  type SortingState,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable
} from '@tanstack/react-table';
import { Eye, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  CardHeading,
  CardTable,
  CardTitle,
  CardToolbar
} from '@/components/ui/card';
import { DataGrid } from '@/components/ui/data-grid';
import { DataGridColumnHeader } from '@/components/ui/data-grid-column-header';
import { DataGridTable } from '@/components/ui/data-grid-table';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface UserManagementProps {
  companyFilter?: string;
  onSelectedUserNameChange?: (name: string) => void;
}

const ORG_ACCESS_ID = 'org';

const UserManagement: React.FC<UserManagementProps> = ({ companyFilter, onSelectedUserNameChange }) => {
  const { t } = useTranslation();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [availableRoles, setAvailableRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Form State
  const [userFormOpen, setUserFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [userForm, setUserForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    roleId: '',
    role: 'Administrator', // Legacy support
    companyId: '',
    language: 'es',
    accessCompanyIds: [] as string[]
  });

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const url = companyFilter
        ? `/api/users?companyId=${companyFilter}&t=${Date.now()}`
        : `/api/users?t=${Date.now()}`;
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      } else {
        console.error('Failed to fetch real users from DB');
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCompanies = async () => {
    try {
      const res = await fetch(`/api/companies?status=Active&t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        setCompanies(data);
      }
    } catch (error) {
      console.error('Error fetching companies:', error);
    }
  };

  const fetchRoles = async () => {
    try {
      const res = await fetch('/api/roles');
      if (res.ok) {
        const data = await res.json();
        setAvailableRoles(data);
      }
    } catch (error) {
      console.error('Error fetching roles:', error);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchCompanies();
    fetchRoles();
  }, [companyFilter]);

  const handleOpenModal = (user?: AppUser) => {
    if (user) {
      setEditingUser(user);
      setUserForm({
        firstName: user.firstName || (user.name || '').split(' ')[0] || '',
        lastName: user.lastName || (user.name || '').split(' ').slice(1).join(' ') || '',
        email: user.email || '',
        password: '',
        role: user.role || 'Administrator',
        roleId: user.roleId || '',
        companyId: user.companyId || '',
        language: user.language || 'es',
        accessCompanyIds: Array.isArray(user.accessCompanyIds)
          ? user.accessCompanyIds
          : (user.companyId ? [user.companyId] : [])
      });
    } else {
      setEditingUser(null);
      setUserForm({
        firstName: '',
        lastName: '',
        email: '',
        password: '',
        role: 'Administrator',
        roleId: '',
        companyId: '',
        language: 'es',
        accessCompanyIds: []
      });
    }
    setUserFormOpen(true);
  };

  const handleToggleAccessCompany = (companyId: string) => {
    setUserForm(prev => ({
      ...prev,
      accessCompanyIds: prev.accessCompanyIds.includes(companyId)
        ? prev.accessCompanyIds.filter(id => id !== companyId)
        : [...prev.accessCompanyIds, companyId]
    }));
  };

  const handleToggleOrganizationAccess = () => {
    setUserForm(prev => ({
      ...prev,
      accessCompanyIds: prev.accessCompanyIds.includes(ORG_ACCESS_ID)
        ? prev.accessCompanyIds.filter(id => id !== ORG_ACCESS_ID)
        : [...prev.accessCompanyIds, ORG_ACCESS_ID]
    }));
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const method = editingUser ? 'PUT' : 'POST';
      const url = editingUser ? `/api/users/${editingUser.id}` : '/api/users';

      const composedName = `${userForm.firstName} ${userForm.lastName}`.trim();
      const normalizedAccessCompanyIds = Array.from(new Set(userForm.accessCompanyIds.filter(Boolean)));
      const payload = {
        ...userForm,
        accessCompanyIds: normalizedAccessCompanyIds,
        name: composedName
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setUserFormOpen(false);
        fetchUsers();
      } else {
        const err = await res.json();
        alert('Error: ' + (err.error || err.details || 'Failed to save user'));
      }
    } catch (error) {
      console.error('Error saving user:', error);
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm(t('common.confirmDelete') || '¿Estás seguro de eliminar este usuario?')) return;
    try {
      const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchUsers();
      }
    } catch (error) {
      console.error('Error deleting user:', error);
    }
  };

  const baseUsers = useMemo(
    () => (companyFilter ? users.filter((u) => u.companyId === companyFilter) : users),
    [users, companyFilter]
  );

  const filteredUsers = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return baseUsers.filter((u) => {
      const roleLabel = (u.roleRef?.name || u.role || '').toLowerCase();
      const companyLabel = (u.company?.name || '').toLowerCase();
      return (
        (u.name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.firstName || '').toLowerCase().includes(q) ||
        (u.lastName || '').toLowerCase().includes(q) ||
        roleLabel.includes(q) ||
        companyLabel.includes(q)
      );
    });
  }, [baseUsers, searchTerm]);

  const selectedUser = users.find(u => u.id === selectedUserId);

  useEffect(() => {
    if (!onSelectedUserNameChange) return;
    onSelectedUserNameChange(selectedUser ? selectedUser.name : '');
  }, [selectedUser, onSelectedUserNameChange]);

  useEffect(() => {
    const handleResetSelection = () => setSelectedUserId(null);
    window.addEventListener('resetUserSelection', handleResetSelection);
    return () => window.removeEventListener('resetUserSelection', handleResetSelection);
  }, []);

  const resolveUserAvatarUrl = useCallback((avatar?: string) => {
    if (!avatar) return '';
    if (avatar.startsWith('http://') || avatar.startsWith('https://')) return avatar;
    if (avatar.startsWith('/')) return avatar;
    return avatar;
  }, []);

  const [sorting, setSorting] = useState<SortingState>([]);

  const columns: ColumnDef<AppUser>[] = [
      {
        id: 'user',
        accessorFn: (row) => row.name || '',
        meta: { headerTitle: t('users.user') },
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('users.user')} />,
        cell: ({ row }) => {
          const user = row.original;
          return (
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-sm font-bold text-red-500">
                {user.avatar ? (
                  <img
                    src={resolveUserAvatarUrl(user.avatar)}
                    alt=""
                    className="h-full w-full rounded-xl object-cover"
                  />
                ) : (
                  user.name?.[0]
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{user.name}</p>
                <p className="text-[11px] font-medium text-muted-foreground">{user.email}</p>
              </div>
            </div>
          );
        }
      },
      {
        id: 'company',
        accessorFn: (row) => row.company?.name || '',
        meta: { headerTitle: t('users.company') },
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('users.company')} />,
        cell: ({ row }) => (
          <span className="text-sm font-medium text-muted-foreground">{row.original.company?.name || '—'}</span>
        )
      },
      {
        id: 'role',
        accessorFn: (row) => row.roleRef?.name || row.role || '',
        meta: { headerTitle: t('users.role') },
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('users.role')} />,
        cell: ({ row }) => {
          const user = row.original;
          const label = user.roleRef?.name || user.role;
          return (
            <span
              className={cn(
                'rounded-lg px-3 py-1 text-[10px] font-bold uppercase tracking-wider',
                user.role === 'Administrator'
                  ? 'bg-red-50 text-red-600'
                  : user.role === 'Analyst'
                    ? 'bg-amber-50 text-amber-600'
                    : user.role === 'Developer'
                      ? 'bg-indigo-50 text-indigo-600'
                      : 'bg-muted text-muted-foreground'
              )}
            >
              {label}
            </span>
          );
        }
      },
      {
        accessorKey: 'joinedDate',
        meta: { headerTitle: t('users.joinDate') },
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('users.joinDate')} />,
        cell: ({ row }) => (
          <span className="text-sm font-medium text-muted-foreground">{row.original.joinedDate}</span>
        )
      },
      {
        id: 'actions',
        enableSorting: false,
        meta: {
          headerTitle: t('users.actions'),
          headerClassName: 'text-end',
          cellClassName: 'text-end'
        },
        header: () => (
          <span className="inline-flex w-full justify-end text-[0.8125rem] font-medium uppercase tracking-wide text-table-header-foreground">
            {t('users.actions')}
          </span>
        ),
        cell: ({ row }) => {
          const user = row.original;
          return (
            <div className="flex justify-end gap-1">
              <Button
                type="button"
                mode="icon"
                size="sm"
                variant="outline"
                className="size-8"
                onClick={() => setSelectedUserId(user.id)}
                title={t('settings.viewProfile')}
                aria-label={t('settings.viewProfile')}
              >
                <Eye className="size-3.5" />
              </Button>
              <Button
                type="button"
                mode="icon"
                size="sm"
                variant="outline"
                className="size-8"
                onClick={() => handleOpenModal(user)}
                aria-label={t('settings.edit')}
              >
                <Pencil className="size-3.5" />
              </Button>
              <Button
                type="button"
                mode="icon"
                size="sm"
                variant="outline"
                className="size-8 text-destructive hover:bg-destructive/10"
                onClick={() => handleDeleteUser(user.id)}
                aria-label={t('common.delete')}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          );
        }
      }
    ];

  const table = useReactTable({
    data: filteredUsers,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel()
  });

  const emptyMessage = baseUsers.length === 0 ? t('users.noUsers') : t('users.noMatch');

  if (selectedUserId && selectedUser) {
    return (
      <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
        <UserProfile
          user={selectedUser}
          onRefresh={fetchUsers}
          onEdit={() => handleOpenModal(selectedUser)}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400">
        <i className="fa-solid fa-circle-notch fa-spin text-3xl mb-4"></i>
        <p className="font-bold text-sm uppercase tracking-widest">{t('users.loading')}</p>
      </div>
    );
  }

  return (
    <div className="w-full animate-in fade-in duration-500 pb-12">
      <div className="mb-6">
        <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">{t('settings.usersTitle')}</h2>
        <p className="mt-1 font-medium text-slate-500">{t('settings.usersDesc')}</p>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="min-h-0 flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <CardHeading>
            <CardTitle>{t('settings.usersCardTitle')}</CardTitle>
          </CardHeading>
          <CardToolbar className="w-full flex-wrap justify-stretch gap-2 sm:w-auto sm:justify-end">
            <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
              <Search className="text-muted-foreground absolute start-3 top-1/2 size-4 -translate-y-1/2" aria-hidden />
              <Input
                type="search"
                placeholder={t('users.searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={cn('ps-9')}
                aria-label={t('users.searchPlaceholder')}
              />
            </div>
            <Button
              type="button"
              variant="primary"
              onClick={() => handleOpenModal()}
            >
              <Plus className="size-4" />
              {t('users.addUser')}
            </Button>
          </CardToolbar>
        </CardHeader>
        <CardTable className="p-0">
          <DataGrid
            table={table}
            recordCount={filteredUsers.length}
            emptyMessage={emptyMessage}
            tableLayout={{
              rowBorder: true,
              headerBackground: true,
              headerBorder: true,
              width: 'auto'
            }}
          >
            <div className="overflow-x-auto">
              <DataGridTable />
            </div>
          </DataGrid>
        </CardTable>
      </Card>

      {userFormOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto p-3 sm:items-center sm:p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setUserFormOpen(false)}></div>
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto animate-in zoom-in-95 duration-200 border border-white/20">
            <div className="px-4 sm:px-8 pt-5 sm:pt-8 pb-4 sm:pb-6 border-b border-slate-100">
              <h3 className="text-2xl font-extrabold text-slate-900">
                {editingUser ? 'Editar Usuario' : 'Nuevo Usuario'}
              </h3>
              <p className="text-slate-500 font-medium text-sm mt-1">Completa la información para gestionar el acceso.</p>
            </div>

            <form onSubmit={handleSaveUser} className="p-4 sm:p-8 space-y-5 sm:space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nombre</label>
                  <input
                    required
                    type="text"
                    value={userForm.firstName}
                    onChange={e => setUserForm(p => ({ ...p, firstName: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400 transition-all font-medium"
                    placeholder="Ej: Juan"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Apellido</label>
                  <input
                    required
                    type="text"
                    value={userForm.lastName}
                    onChange={e => setUserForm(p => ({ ...p, lastName: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400 transition-all font-medium"
                    placeholder="Ej: Pérez"
                  />
                </div>
                <div className="md:col-span-2 space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Email</label>
                  <input
                    required
                    type="email"
                    value={userForm.email}
                    onChange={e => setUserForm(p => ({ ...p, email: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400 transition-all font-medium"
                    placeholder="usuario@ejemplo.com"
                  />
                </div>
                <div className="md:col-span-2 space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Contraseña</label>
                  <input
                    required={!editingUser}
                    type="password"
                    value={userForm.password}
                    onChange={e => setUserForm(p => ({ ...p, password: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400 transition-all font-medium"
                    placeholder="••••••••"
                  />
                  {editingUser && <p className="text-[10px] text-slate-400 font-medium italic">Dejar en blanco para mantener la actual</p>}
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Rol</label>
                  <select
                    value={userForm.roleId}
                    onChange={e => {
                      const r = availableRoles.find(role => role.id === e.target.value);
                      setUserForm(p => ({ ...p, roleId: e.target.value, role: r?.name || p.role }));
                    }}
                    className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400 transition-all font-medium"
                  >
                    <option value="">Seleccionar rol</option>
                    {availableRoles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Compañía</label>
                  <select
                    value={userForm.companyId}
                    onChange={e => setUserForm(p => ({ ...p, companyId: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400 transition-all font-medium"
                  >
                    <option value="">Seleccionar compañía</option>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Idioma</label>
                  <select
                    value={userForm.language}
                    onChange={e => setUserForm(p => ({ ...p, language: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400 transition-all font-medium"
                  >
                    {SYSTEM_LANGUAGES.map(lang => <option key={lang.code} value={lang.code}>{lang.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Acceso a compañías</label>
                  <div className="border border-slate-200 rounded-xl bg-slate-50/50 p-2 space-y-2">
                    <label className="flex items-center gap-2 px-2 py-1 rounded hover:bg-white text-sm font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={userForm.accessCompanyIds.includes(ORG_ACCESS_ID)}
                        onChange={handleToggleOrganizationAccess}
                      />
                      <span>Acceso a la organización</span>
                    </label>
                    <div className="h-px bg-slate-200"></div>
                    <div className="max-h-28 overflow-y-auto space-y-1">
                      {companies.map(c => (
                        <label key={c.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-white text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={userForm.accessCompanyIds.includes(c.id)}
                            onChange={() => handleToggleAccessCompany(c.id)}
                          />
                          <span>{c.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => setUserFormOpen(false)}
                  className="w-full sm:flex-1 px-6 py-3 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-all text-sm shadow-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-full sm:flex-1 px-6 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-600 transition-all text-sm"
                >
                  {editingUser ? 'Guardar Cambios' : 'Crear Usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
