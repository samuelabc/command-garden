import { type ReactNode } from 'react';

export type BadgeVariant = 'success' | 'error' | 'warning' | 'info' | 'secondary' | 'neutral';
type BadgeSize = 'sm' | 'xs';

const variantClasses: Record<BadgeVariant, string> = {
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20',
  error: 'bg-red-50 text-red-700 ring-red-600/10 dark:bg-red-500/10 dark:text-red-400 dark:ring-red-500/20',
  warning: 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/20',
  info: 'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-400 dark:ring-sky-500/20',
  secondary: 'bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-500/10 dark:text-violet-400 dark:ring-violet-500/20',
  neutral: 'bg-slate-100 text-slate-600 ring-slate-500/10 dark:bg-slate-400/10 dark:text-slate-400 dark:ring-slate-400/20',
};

const sizeClasses: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-xs',
  xs: 'px-1.5 py-px text-[0.65rem]',
};

export function Badge({
  variant = 'neutral',
  size = 'sm',
  className = '',
  children,
}: {
  variant?: BadgeVariant;
  size?: BadgeSize;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={`inline-flex items-center rounded-md font-medium ring-1 ring-inset ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}>
      {children}
    </span>
  );
}
