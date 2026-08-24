import { cn } from '@/lib/cn';

type AlertVariant = 'success' | 'error' | 'warning' | 'info';

const variantClasses: Record<AlertVariant, string> = {
  success: 'border-success-border bg-success-muted text-success-fg',
  error: 'border-danger-border bg-danger-muted text-danger-fg',
  warning: 'border-warning-border bg-warning-muted text-warning-fg',
  info: 'border-info-border bg-info-muted text-info-fg',
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
