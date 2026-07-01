import { type ReactNode } from 'react';

export type BadgeVariant = 'success' | 'error' | 'warning' | 'info' | 'secondary' | 'neutral';
type BadgeSize = 'sm' | 'xs';

const variantClasses: Record<BadgeVariant, string> = {
  success: 'border-emerald-500 text-emerald-600 dark:text-emerald-400',
  error: 'border-red-500 text-red-600 dark:text-red-400',
  warning: 'border-amber-500 text-amber-600 dark:text-amber-400',
  info: 'border-sky-500 text-sky-600 dark:text-sky-400',
  secondary: 'border-violet-500 text-violet-600 dark:text-violet-400',
  neutral: 'border-base-300 text-base-content/60',
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
    <span className={`inline-flex items-center font-mono font-medium border ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}>
      {children}
    </span>
  );
}
