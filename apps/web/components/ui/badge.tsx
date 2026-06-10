import { cn } from '@/lib/cn';

type BadgeVariant = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const variantClasses: Record<BadgeVariant, string> = {
  neutral: 'border-slate-600/60 bg-slate-800/60 text-slate-200',
  info: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200',
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  danger: 'border-rose-500/30 bg-rose-500/10 text-rose-200',
};

export function Badge({
  variant = 'neutral',
  className,
  children,
}: {
  variant?: BadgeVariant;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium',
        variantClasses[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
