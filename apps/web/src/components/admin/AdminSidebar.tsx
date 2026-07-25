import React from 'react';
import { NavLink } from 'react-router-dom';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const links = [
  { to: '/admin/organizations', label: 'Organizations', icon: 'fa-building' },
  { to: '/admin/subscription-plans', label: 'Plans', icon: 'fa-layer-group' },
  { to: '/admin/assets', label: 'Assets', icon: 'fa-boxes-stacked' },
  { to: '/admin/settings/categories', label: 'Categories', icon: 'fa-tags' },
  { to: '/admin/settings/references', label: 'References', icon: 'fa-hashtag' },
  { to: '/admin/settings/configuration', label: 'Configuración', icon: 'fa-sliders' },
  { to: '/admin/settings/modules', label: 'Modules', icon: 'fa-cubes' },
  { to: '/admin/settings/smtp', label: 'SMTP', icon: 'fa-at' },
  { to: '/admin/settings/storage', label: 'Storage', icon: 'fa-database' },
  { to: '/admin/settings/translations', label: 'Translations', icon: 'fa-language' },
  { to: '/admin/settings/menus', label: 'Menus', icon: 'fa-bars-staggered' }
];

const AdminSidebar: React.FC = () => {
  return (
    <aside className="w-64 border-r bg-card p-4">
      <div className="mb-4 text-sm font-semibold text-muted-foreground">SaaS Admin</div>
      <nav className="space-y-1">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              cn(
                buttonVariants({ variant: isActive ? 'primary' : 'ghost', size: 'md' }),
                'w-full justify-start gap-2 font-normal'
              )
            }
          >
            <i className={`fa-solid ${link.icon} text-xs`} />
            {link.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
};

export default AdminSidebar;
