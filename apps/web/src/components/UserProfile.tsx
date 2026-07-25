import React, { useEffect, useRef, useState } from 'react';
import { AppUser } from '../types';

interface UserProfileProps {
  user?: AppUser;
  onRefresh?: () => void;
  onEdit?: () => void;
}

const nameInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
  }
  const p = parts[0] || '?';
  return (p.length >= 2 ? p.slice(0, 2) : `${p}${p}`).toUpperCase();
};

const UserProfile: React.FC<UserProfileProps> = ({ user, onRefresh, onEdit }) => {
  const profileName = user?.name || 'Max Smith';
  const profileRole = user?.roleRef?.name || user?.role || 'Developer';
  const profileEmail = user?.email || 'max@kt.com';
  const profileAvatar = user?.avatar || '';
  const profileCompany = user?.company?.name || 'Sinapsis Labs';

  const fallbackFirstName = user?.firstName || profileName.split(' ')[0] || '';
  const fallbackLastName = user?.lastName || profileName.split(' ').slice(1).join(' ') || '';

  const [activeTab, setActiveTab] = useState<'Overview' | 'Security'>('Overview');
  const [firstName, setFirstName] = useState(fallbackFirstName);
  const [lastName, setLastName] = useState(fallbackLastName);
  const [language, setLanguage] = useState('Español');
  const [timezone, setTimezone] = useState('(GMT-03:00) Buenos Aires');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setFirstName(user?.firstName || (user?.name || '').split(' ')[0] || '');
    setLastName(user?.lastName || (user?.name || '').split(' ').slice(1).join(' ') || '');
  }, [user]);

  const resolveAvatarUrl = (avatar?: string) => {
    if (!avatar) return '';
    if (avatar.startsWith('http://') || avatar.startsWith('https://')) return avatar;
    if (avatar.startsWith('/')) return avatar;
    return avatar;
  };

  const handleAvatarClick = () => {
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user?.id) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('avatar', file);

    try {
      const response = await fetch(`/api/users/${user.id}/avatar`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to upload avatar');
      }

      if (onRefresh) onRefresh();
    } catch (error: any) {
      console.error('Error uploading avatar:', error);
      alert(error.message || 'Error uploading avatar');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleAvatarChange}
        accept="image/*"
        className="hidden"
      />

      <div className="bg-white rounded-2xl border border-slate-200 px-8 pt-8 pb-4 shadow-sm">
        <div className="flex flex-col lg:flex-row gap-8 items-start">
          <div className="relative group cursor-pointer" onClick={handleAvatarClick}>
            <div className="flex h-40 w-40 items-center justify-center overflow-hidden rounded-2xl border-4 border-white bg-primary/15 text-5xl font-bold text-primary shadow-lg">
              {profileAvatar ? (
                <img src={resolveAvatarUrl(profileAvatar)} alt="Profile" className="h-full w-full object-cover" />
              ) : (
                nameInitials(profileName)
              )}
              {isUploading && (
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                  <i className="fa-solid fa-circle-notch fa-spin text-white text-3xl"></i>
                </div>
              )}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                <i className="fa-solid fa-camera text-white text-2xl"></i>
              </div>
            </div>
            <span className="absolute bottom-2 right-2 w-5 h-5 bg-emerald-500 border-4 border-white rounded-full"></span>
          </div>

          <div className="flex-1 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
                  {profileName}
                  <i className="fa-solid fa-circle-check text-primary text-xl"></i>
                </h2>
                <div className="flex flex-wrap gap-4 mt-2 text-slate-500 text-sm font-medium">
                  <span className="flex items-center gap-1.5"><i className="fa-solid fa-user text-slate-400"></i> {profileRole}</span>
                  <span className="flex items-center gap-1.5"><i className="fa-solid fa-building text-slate-400"></i> {profileCompany}</span>
                  <span className="flex items-center gap-1.5"><i className="fa-solid fa-envelope text-slate-400"></i> {profileEmail}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={onEdit} className="px-5 py-2 bg-slate-50 text-slate-700 font-medium text-sm rounded-lg border border-slate-200 hover:bg-slate-100 transition-all">
                  Edit
                </button>
                <button className="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2">
                  PDF Document
                </button>
                <button className="px-3 py-2 bg-slate-50 text-slate-400 rounded-lg border border-slate-200 hover:text-slate-600">
                  <i className="fa-solid fa-ellipsis"></i>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="border border-dashed border-slate-200 rounded-2xl p-4">
                <div className="flex items-center gap-2 text-emerald-600 text-xs font-bold mb-1">
                  <i className="fa-solid fa-arrow-up"></i> 4500$
                </div>
                <p className="text-slate-500 text-sm font-medium italic">Earnings</p>
              </div>
              <div className="border border-dashed border-slate-200 rounded-2xl p-4">
                <div className="flex items-center gap-2 text-rose-600 text-xs font-bold mb-1">
                  <i className="fa-solid fa-arrow-down"></i> 75
                </div>
                <p className="text-slate-500 text-sm font-medium italic">Projects</p>
              </div>
              <div className="border border-dashed border-slate-200 rounded-2xl p-4">
                <div className="flex items-center gap-2 text-emerald-600 text-xs font-bold mb-1">
                  <i className="fa-solid fa-arrow-up"></i> 60%
                </div>
                <p className="text-slate-500 text-sm font-medium italic">Success Rate</p>
              </div>
            </div>
          </div>
        </div>

        <nav className="flex gap-8 mt-10 border-t border-slate-100 pt-3 pb-0 overflow-x-auto no-scrollbar">
          {['Overview', 'Security'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as 'Overview' | 'Security')}
              className={`border-b-2 py-[3px] text-xs font-bold uppercase tracking-wide transition-all ${activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'Overview' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-8 py-6 border-b border-slate-100">
            <h3 className="text-lg font-bold text-slate-900">Profile Details</h3>
          </div>

          <div className="px-8 py-8 space-y-8">
            <div>
              <h4 className="text-base font-bold text-primary">General information</h4>
              <div className="mt-3 border-b border-slate-100"></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700">First Name</label>
                  <input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700">Last Name</label>
                  <input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="md:col-span-2 space-y-2">
                  <label className="block text-sm font-medium text-slate-700">Email Address</label>
                  <input
                    value={profileEmail}
                    disabled
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-400"
                  />
                  <p className="text-xs text-slate-400 italic">Contact support to change your primary email.</p>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-base font-bold text-primary">Localization</h4>
              <div className="mt-3 border-b border-slate-100"></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700">Language</label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option>Español</option>
                    <option>English</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700">Timezone</label>
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option>(GMT-03:00) Buenos Aires</option>
                    <option>(UTC+00:00) UTC</option>
                    <option>(UTC-05:00) New York</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="px-8 py-5 border-t border-slate-100 flex justify-end gap-3">
            <button className="px-6 py-2 bg-white border border-slate-200 text-slate-700 font-medium text-sm rounded-lg hover:bg-slate-50 transition-all">Discard</button>
            <button className="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90">Save Changes</button>
          </div>
        </div>
      )}

      {activeTab === 'Security' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-8 py-6 border-b border-slate-100">
            <h3 className="text-lg font-bold text-slate-900">Security Settings</h3>
          </div>

          <div className="px-8 py-8">
            <h4 className="text-base font-bold text-primary">Change password</h4>
            <div className="mt-3 border-b border-slate-100"></div>

            <div className="max-w-2xl mt-6 space-y-6">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">Current Password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">Confirm New Password</label>
                <input
                  type="password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          </div>

          <div className="px-8 py-5 border-t border-slate-100 flex justify-end gap-3">
            <button className="px-6 py-2 bg-white border border-slate-200 text-slate-700 font-medium text-sm rounded-lg hover:bg-slate-50 transition-all">Discard</button>
            <button className="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90">Save Changes</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserProfile;
