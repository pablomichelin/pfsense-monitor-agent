import { cn } from '@/lib/cn';

type BadgeVariant = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const variantClasses: Record<BadgeVariant, string> = {
  neutral: 'border-neutral-border bg-neutral-muted text-neutral-fg',
  info: 'border-info-border bg-info-muted text-info-fg',
  success: 'border-success-border bg-success-muted text-success-fg',
  warning: 'border-warning-border bg-warning-muted text-warning-fg',
  danger: 'border-danger-border bg-danger-muted text-danger-fg',
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
