import { cn } from '@/lib/cn';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-outline';
type ButtonSize = 'sm' | 'md';

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'border border-primary/30 bg-primary text-on-primary hover:bg-primary-hover disabled:bg-primary/50',
  secondary:
    'border border-border bg-surface-soft text-fg hover:border-primary/50 hover:text-fg',
  ghost:
    'border border-transparent bg-transparent text-fg-muted hover:border-border hover:bg-nav-hover hover:text-fg',
  danger:
    'border border-danger-border bg-danger-muted text-danger-fg hover:border-danger/60 hover:bg-danger/20',
  'danger-outline':
    'border border-danger-border bg-transparent text-danger-fg hover:border-danger/50 hover:bg-danger-muted',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-9 min-h-9 px-3 text-xs',
  md: 'h-11 min-h-11 px-4 text-sm',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  type = 'button',
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}) {
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      disabled={isDisabled}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-60',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {loading ? (
        <span
          className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"
          aria-hidden
        />
      ) : null}
      {children}
    </button>
  );
}
