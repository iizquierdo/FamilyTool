import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppUser, SYSTEM_LANGUAGES } from '../types';

interface UserAccountProps {
    user?: AppUser;
    onUserUpdate?: (user: AppUser) => void;
}

const AUTH_STORAGE_KEY = 'sinapsis.auth.session';

type AccountTab = 'profile' | 'security';

type MessageState = {
    type: 'success' | 'error';
    text: string;
} | null;

const nameInitials = (name: string) => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
        return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
    }
    const p = parts[0] || '?';
    return (p.length >= 2 ? p.slice(0, 2) : `${p}${p}`).toUpperCase();
};

const UserAccount: React.FC<UserAccountProps> = ({ user, onUserUpdate }) => {
    const { t, i18n } = useTranslation();
    const [activeTab, setActiveTab] = useState<AccountTab>('profile');
    const [loading, setLoading] = useState(false);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [message, setMessage] = useState<MessageState>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [form, setForm] = useState({
        firstName: user?.firstName || user?.name?.split(' ')[0] || '',
        lastName: user?.lastName || user?.name?.split(' ').slice(1).join(' ') || '',
        email: user?.email || '',
        language: user?.language || 'es',
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });

    useEffect(() => {
        if (!user) return;
        setForm((prev) => ({
            ...prev,
            firstName: user.firstName || user.name?.split(' ')[0] || '',
            lastName: user.lastName || user.name?.split(' ').slice(1).join(' ') || '',
            email: user.email || '',
            language: (user.language || 'es').toLowerCase().startsWith('en') ? 'en' : 'es'
        }));
    }, [user]);

    const tabs = useMemo(
        () => [
            { id: 'profile' as AccountTab, label: t('profile.tabs.overview') || 'Overview', icon: 'fa-user' },
            { id: 'security' as AccountTab, label: t('profile.tabs.security') || 'Security', icon: 'fa-shield-halved' }
        ],
        [t]
    );

    const getSessionToken = () => {
        try {
            const raw = localStorage.getItem(AUTH_STORAGE_KEY);
            return raw ? String(JSON.parse(raw)?.token || '') : '';
        } catch {
            return '';
        }
    };

    const resolveAvatarUrl = (avatar?: string) => {
        if (!avatar) return '';
        if (avatar.startsWith('http://') || avatar.startsWith('https://')) return avatar;
        if (avatar.startsWith('/')) return avatar;
        return avatar;
    };

    const pushMessage = (next: MessageState) => {
        setMessage(next);
        if (next?.type === 'success') {
            setTimeout(() => setMessage(null), 3000);
        }
    };

    const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !user?.id) return;

        const token = getSessionToken();
        if (!token) {
            pushMessage({ type: 'error', text: t('profile.userRequired') || 'Session required.' });
            return;
        }

        setUploadingAvatar(true);
        setMessage(null);

        const formData = new FormData();
        formData.append('avatar', file);

        try {
            const response = await fetch(`/api/users/${user.id}/avatar`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: formData
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data?.error || t('profile.avatarUploadError') || 'Error uploading avatar.');
            }

            const nextUser: AppUser = {
                ...user,
                ...data?.user,
                avatar: data?.avatar || data?.user?.avatar || user.avatar,
                name: data?.user?.name || [data?.user?.firstName || form.firstName, data?.user?.lastName || form.lastName].filter(Boolean).join(' ') || user.name
            };
            if (onUserUpdate) onUserUpdate(nextUser);
            pushMessage({ type: 'success', text: t('profile.avatarUpdated') || 'Avatar updated.' });
        } catch (error: any) {
            pushMessage({ type: 'error', text: error?.message || t('profile.avatarUploadError') || 'Error uploading avatar.' });
        } finally {
            setUploadingAvatar(false);
            event.target.value = '';
        }
    };

    const handleProfileSave = async () => {
        if (!user?.id) {
            pushMessage({ type: 'error', text: t('profile.userRequired') || 'User required.' });
            return;
        }

        setLoading(true);
        setMessage(null);

        try {
            const response = await fetch(`/api/users/${user.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: user.email,
                    name: [form.firstName, form.lastName].filter(Boolean).join(' ').trim(),
                    firstName: form.firstName,
                    lastName: form.lastName,
                    role: user.role,
                    companyId: user.companyId,
                    roleId: user.roleId,
                    language: form.language,
                    accessCompanyIds: user.accessCompanyIds || []
                })
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data?.error || t('profile.profileSaveError') || 'Error saving profile.');
            }

            const nextUser: AppUser = {
                ...user,
                ...data,
                language: form.language,
                firstName: form.firstName,
                lastName: form.lastName,
                name: [form.firstName, form.lastName].filter(Boolean).join(' ').trim() || user.name
            };

            if (onUserUpdate) onUserUpdate(nextUser);
            await i18n.changeLanguage(form.language);
            pushMessage({ type: 'success', text: t('profile.changesSaved') || 'Changes saved.' });
        } catch (error: any) {
            pushMessage({ type: 'error', text: error?.message || t('profile.profileSaveError') || 'Error saving profile.' });
        } finally {
            setLoading(false);
        }
    };

    const handlePasswordSave = async () => {
        if (!user?.id) {
            pushMessage({ type: 'error', text: t('profile.userRequired') || 'User required.' });
            return;
        }

        if (!form.currentPassword || !form.newPassword || !form.confirmPassword) {
            pushMessage({ type: 'error', text: t('profile.passwordRequired') || 'All password fields are required.' });
            return;
        }

        if (form.newPassword !== form.confirmPassword) {
            pushMessage({ type: 'error', text: t('profile.passwordMismatch') || 'Passwords do not match.' });
            return;
        }

        const token = getSessionToken();
        if (!token) {
            pushMessage({ type: 'error', text: t('profile.userRequired') || 'Session required.' });
            return;
        }

        setLoading(true);
        setMessage(null);

        try {
            const response = await fetch(`/api/users/${user.id}/change-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    currentPassword: form.currentPassword,
                    newPassword: form.newPassword,
                    confirmPassword: form.confirmPassword
                })
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data?.error || t('profile.passwordChangeError') || 'Error changing password.');
            }

            setForm((prev) => ({ ...prev, currentPassword: '', newPassword: '', confirmPassword: '' }));
            pushMessage({ type: 'success', text: t('profile.passwordUpdated') || 'Password updated.' });
        } catch (error: any) {
            pushMessage({ type: 'error', text: error?.message || t('profile.passwordChangeError') || 'Error changing password.' });
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (activeTab === 'profile') {
            await handleProfileSave();
            return;
        }
        await handlePasswordSave();
    };

    const handleDiscard = () => {
        if (activeTab === 'profile') {
            setForm((prev) => ({
                ...prev,
                firstName: user?.firstName || user?.name?.split(' ')[0] || '',
                lastName: user?.lastName || user?.name?.split(' ').slice(1).join(' ') || '',
                email: user?.email || '',
                language: (user?.language || 'es').toLowerCase().startsWith('en') ? 'en' : 'es'
            }));
        } else {
            setForm((prev) => ({ ...prev, currentPassword: '', newPassword: '', confirmPassword: '' }));
        }
        setMessage(null);
    };

    const displayName = [form.firstName, form.lastName].filter(Boolean).join(' ').trim() || user?.name || 'User';
    const avatarSrc = resolveAvatarUrl(user?.avatar);

    return (
        <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-500 pb-20">
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                className="hidden"
            />

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="h-32 bg-gradient-to-r from-primary to-primary/75"></div>
                <div className="px-8 pb-8 flex flex-col md:flex-row gap-6">
                    <div className="relative -mt-12">
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="w-32 h-32 rounded-2xl border-4 border-white bg-white shadow-xl overflow-hidden relative group"
                        >
                            {avatarSrc ? (
                                <img src={avatarSrc} className="w-full h-full object-cover" alt="Avatar" />
                            ) : (
                                <div
                                    className="flex h-full w-full items-center justify-center bg-primary/15 text-3xl font-bold text-primary"
                                    aria-hidden
                                >
                                    {nameInitials(displayName)}
                                </div>
                            )}
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <i className={`fa-solid ${uploadingAvatar ? 'fa-circle-notch fa-spin' : 'fa-camera'} text-white text-xl`}></i>
                            </div>
                        </button>
                    </div>
                    <div className="flex-1 mt-4">
                        <h2 className="text-2xl font-bold text-slate-900">{displayName}</h2>
                        <div className="flex flex-wrap gap-4 mt-2">
                            <span className="flex items-center gap-1.5 text-sm text-slate-500 font-medium">
                                <i className="fa-solid fa-envelope text-slate-400"></i> {form.email}
                            </span>
                            <span className="flex items-center gap-1.5 text-sm text-slate-500 font-medium">
                                <i className="fa-solid fa-briefcase text-slate-400"></i> {user?.roleRef?.name || user?.role || 'User'}
                            </span>
                            <span className="flex items-center gap-1.5 text-sm text-slate-500 font-medium">
                                <i className="fa-solid fa-building text-slate-400"></i> {user?.company?.name || 'Main Organization'}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="px-8 border-t border-slate-100 flex gap-8">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 border-b-2 py-4 text-xs font-bold uppercase tracking-widest transition-all ${activeTab === tab.id
                                ? 'border-primary text-primary'
                                : 'border-transparent text-slate-400 hover:text-slate-600'
                                }`}
                        >
                            <i className={`fa-solid ${tab.icon} text-[10px]`}></i>
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
                <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center text-sm font-bold text-slate-900">
                    <h3>{activeTab === 'profile' ? (t('profile.profileDetails') || 'Profile Details') : (t('profile.securitySettings') || 'Security Settings')}</h3>
                    {message && (
                        <span className={`flex items-center gap-1.5 animate-in slide-in-from-right-4 ${message.type === 'success' ? 'text-emerald-500' : 'text-rose-500'}`}>
                            <i className={`fa-solid ${message.type === 'success' ? 'fa-circle-check' : 'fa-triangle-exclamation'}`}></i>
                            {message.text}
                        </span>
                    )}
                </div>

                <form onSubmit={handleSave} className="p-8 space-y-8">
                    {activeTab === 'profile' && (
                        <div className="space-y-8">
                            <section>
                                <p className="mb-6 border-b border-primary/10 pb-2 text-xs font-bold uppercase tracking-widest text-primary">{t('profile.generalInformation') || 'General Information'}</p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t('profile.firstName') || 'First Name'}</label>
                                        <input
                                            type="text"
                                            value={form.firstName}
                                            onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                                            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t('profile.lastName') || 'Last Name'}</label>
                                        <input
                                            type="text"
                                            value={form.lastName}
                                            onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                                            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                        />
                                    </div>
                                    <div className="md:col-span-2 space-y-1.5">
                                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t('profile.emailAddress') || 'Email Address'}</label>
                                        <input
                                            type="email"
                                            value={form.email}
                                            className="w-full px-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-sm text-slate-400"
                                            disabled
                                        />
                                        <p className="text-[10px] text-slate-400 italic">{t('profile.contactSupportEmail') || 'Contact support to change your primary email.'}</p>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t('profile.language') || 'Language'}</label>
                                        <select
                                            value={form.language}
                                            onChange={(e) => setForm({ ...form, language: e.target.value })}
                                            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                        >
                                            {SYSTEM_LANGUAGES.map((lang) => (
                                                <option key={lang.code} value={lang.code}>{lang.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </section>
                        </div>
                    )}

                    {activeTab === 'security' && (
                        <div className="space-y-8 max-w-xl">
                            <section>
                                <p className="mb-6 border-b border-primary/10 pb-2 text-xs font-bold uppercase tracking-widest text-primary">{t('profile.changePassword') || 'Change Password'}</p>
                                <div className="space-y-6">
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t('profile.currentPassword') || 'Current Password'}</label>
                                        <input
                                            type="password"
                                            value={form.currentPassword}
                                            onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
                                            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t('profile.newPassword') || 'New Password'}</label>
                                        <input
                                            type="password"
                                            value={form.newPassword}
                                            onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
                                            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t('profile.confirmNewPassword') || 'Confirm New Password'}</label>
                                        <input
                                            type="password"
                                            value={form.confirmPassword}
                                            onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                                            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                        />
                                    </div>
                                </div>
                            </section>
                        </div>
                    )}

                    <div className="pt-6 border-t border-slate-100 flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={handleDiscard}
                            className="px-6 py-2.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-all text-xs uppercase tracking-widest"
                        >
                            {t('profile.discard') || 'Discard'}
                        </button>
                        <button
                            type="submit"
                            disabled={loading || uploadingAvatar}
                            className="ml-2 flex items-center gap-2 rounded-xl bg-primary px-8 py-2.5 text-xs font-bold uppercase tracking-widest text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-70"
                        >
                            {loading ? <i className="fa-solid fa-circle-notch fa-spin"></i> : <i className="fa-solid fa-save"></i>}
                            {loading
                                ? (activeTab === 'profile' ? (t('profile.saving') || 'Saving...') : (t('profile.updatingPassword') || 'Updating...'))
                                : (activeTab === 'profile' ? (t('profile.saveChanges') || 'Save Changes') : (t('profile.changePassword') || 'Change Password'))}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default UserAccount;

