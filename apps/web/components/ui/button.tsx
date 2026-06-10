import { cn } from '@/lib/cn';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-outline';
type ButtonSize = 'sm' | 'md';

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'border border-cyan-400/30 bg-cyan-500 text-slate-950 hover:bg-cyan-400 disabled:bg-cyan-500/50',
  secondary:
    'border border-slate-600/80 bg-panel-soft text-slate-200 hover:border-cyan-400/50 hover:text-white',
  ghost:
    'border border-transparent bg-transparent text-slate-300 hover:border-slate-600/60 hover:bg-slate-900/40 hover:text-white',
  danger:
    'border border-rose-500/40 bg-rose-500/20 text-rose-100 hover:border-rose-400/60 hover:bg-rose-500/30',
  'danger-outline':
    'border border-rose-500/30 bg-transparent text-rose-200 hover:border-rose-400/50 hover:bg-rose-500/10',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-9 min-h-9 px-3 text-xs',
  md: 'h-10 min-h-10 px-4 text-sm',
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
