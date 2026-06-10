import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';

export type StatusBadgeStatus =
  | 'online'
  | 'offline'
  | 'degraded'
  | 'maintenance'
  | 'unknown'
  | 'backup-ok'
  | 'backup-late'
  | 'backup-failed'
  | 'backup-never';

const statusConfig: Record<
  StatusBadgeStatus,
  { label: string; variant: 'success' | 'danger' | 'warning' | 'info' | 'neutral'; dotClass: string }
> = {
  online: { label: 'Online', variant: 'success', dotClass: 'text-signal-online' },
  offline: { label: 'Offline', variant: 'danger', dotClass: 'text-signal-offline' },
  degraded: { label: 'Degradado', variant: 'warning', dotClass: 'text-signal-degraded' },
  maintenance: { label: 'Manutenção', variant: 'info', dotClass: 'text-signal-maintenance' },
  unknown: { label: 'Desconhecido', variant: 'neutral', dotClass: 'text-signal-unknown' },
  'backup-ok': { label: 'Backup OK', variant: 'success', dotClass: 'text-signal-online' },
  'backup-late': { label: 'Backup atrasado', variant: 'warning', dotClass: 'text-signal-degraded' },
  'backup-failed': { label: 'Backup falhou', variant: 'danger', dotClass: 'text-signal-offline' },
  'backup-never': { label: 'Sem backup', variant: 'neutral', dotClass: 'text-signal-unknown' },
};

export function StatusBadge({
  status,
  className,
  showDot = true,
}: {
  status: StatusBadgeStatus;
  className?: string;
  showDot?: boolean;
}) {
  const config = statusConfig[status];

  return (
    <Badge variant={config.variant} className={cn('gap-1.5', className)}>
      {showDot ? (
        <span className={cn('status-dot h-2 w-2', config.dotClass)} aria-hidden />
      ) : null}
      {config.label}
    </Badge>
  );
}
