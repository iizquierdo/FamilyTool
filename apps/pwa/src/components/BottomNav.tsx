import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth';
import { isParent } from '../family';

const baseItems = [
  { to: '/', label: 'Billetera', icon: '💰', end: true },
  { to: '/available', label: 'Actividades', icon: '⚡' },
  { to: '/responsibilities', label: 'Tareas', icon: '🏠' },
  { to: '/goals', label: 'Metas', icon: '🎯' }
];

export default function BottomNav() {
  const { user } = useAuth();
  const items = isParent(user?.role) ? [...baseItems, { to: '/manage', label: 'Gestión', icon: '⚙️' }] : baseItems;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 px-3 pb-[calc(env(safe-area-inset-bottom)+10px)]">
      <div className="mx-auto flex max-w-lg items-center justify-around gap-1 rounded-[13px] bg-white px-2 py-2">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.end}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 rounded-lg py-2 text-[11px] font-bold transition ${
                isActive ? 'bg-blue-500 text-white' : 'text-slate-400'
              }`
            }
          >
            <span className="text-lg leading-none">{it.icon}</span>
            {it.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
