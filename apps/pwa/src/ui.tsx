import type { ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[12px] bg-white p-4 shadow-[0_6px_24px_rgba(31,42,68,0.07)] ${className}`}>{children}</div>;
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  className = ''
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'danger' | 'accent';
  disabled?: boolean;
  className?: string;
}) {
  const styles: Record<string, string> = {
    primary: 'bg-blue-500 hover:bg-blue-600 text-white',
    accent: 'bg-amber-400 hover:bg-amber-500 text-slate-900',
    ghost: 'bg-slate-100 hover:bg-slate-200 text-slate-700',
    danger: 'bg-rose-500 hover:bg-rose-600 text-white'
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-2xl px-4 py-3 text-sm font-bold transition active:scale-95 disabled:opacity-40 disabled:active:scale-100 ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-slate-200 border-t-blue-500" />
    </div>
  );
}

export function Points({ value, kind = 'money' }: { value: number; kind?: 'money' | 'xp' }) {
  return (
    <span className={kind === 'money' ? 'font-extrabold text-amber-500' : 'font-extrabold text-indigo-500'}>
      {value.toLocaleString('es-AR')} {kind === 'money' ? 'pts' : 'XP'}
    </span>
  );
}

export function EmptyState({ text }: { text: string }) {
  return <div className="rounded-[12px] bg-white py-12 text-center text-sm text-slate-400 shadow-[0_6px_24px_rgba(31,42,68,0.07)]">{text}</div>;
}
