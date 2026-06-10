import { cn } from '@/lib/cn';

type AlertVariant = 'success' | 'error' | 'warning' | 'info';

const variantClasses: Record<AlertVariant, string> = {
  success: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200',
  error: 'border-rose-500/20 bg-rose-500/10 text-rose-200',
  warning: 'border-amber-500/20 bg-amber-500/10 text-amber-200',
  info: 'border-cyan-500/20 bg-cyan-500/10 text-cyan-200',
};

export function Alert({
  variant = 'info',
  className,
  children,
}: {
  variant?: AlertVariant;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="alert"
      className={cn(
        'rounded-xl border px-4 py-3.5 text-sm',
        variantClasses[variant],
        className,
      )}
    >
      {children}
    </div>
  );
}
