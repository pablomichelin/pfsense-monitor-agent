'use client';

import { cn } from '@/lib/cn';

export type CommandProgressPhase =
  | 'queued'
  | 'pending'
  | 'picked_up'
  | 'running'
  | 'terminal';

export type CommandProgressProps = {
  status: string;
  phase?: CommandProgressPhase;
  isActive?: boolean;
  className?: string;
  compact?: boolean;
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  picked_up: 'Aceito pelo agente',
  running: 'Em execução',
  succeeded: 'Concluído',
  failed: 'Falhou',
  expired: 'Expirado',
  cancelled: 'Cancelado',
  queued: 'Na fila',
};

const ACTIVE_STATUSES = new Set(['pending', 'picked_up', 'running', 'queued']);

export function commandStatusLabel(status: string, phase?: CommandProgressPhase): string {
  if (phase === 'queued') {
    return STATUS_LABELS.queued;
  }

  return STATUS_LABELS[status] ?? status;
}

export function NodeCommandProgress({
  status,
  phase,
  isActive,
  className,
  compact = false,
}: CommandProgressProps) {
  const resolvedPhase =
    phase ??
    (status === 'pending'
      ? 'pending'
      : status === 'picked_up'
        ? 'picked_up'
        : status === 'running'
          ? 'running'
          : 'terminal');
  const active =
    isActive ?? (ACTIVE_STATUSES.has(status) || resolvedPhase === 'queued');
  const label = commandStatusLabel(status, resolvedPhase);

  const tone =
    status === 'succeeded'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
      : status === 'failed' || status === 'expired'
        ? 'border-rose-500/30 bg-rose-500/10 text-rose-200'
        : status === 'cancelled'
          ? 'border-slate-600 bg-slate-800/60 text-slate-300'
          : active
            ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200'
            : 'border-slate-700 bg-slate-900/40 text-slate-400';

  return (
    <div className={cn('inline-flex items-center gap-2', className)}>
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
          tone,
          compact && 'px-2 py-0.5',
        )}
      >
        {active ? (
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-400" />
          </span>
        ) : null}
        {label}
      </span>
    </div>
  );
}

export function commandTypeLabel(type: string): string {
  switch (type) {
    case 'config_backup_now':
      return 'Backup config.xml';
    case 'pfsense_upgrade':
      return 'Upgrade pfSense OS';
    case 'package_upgrade':
      return 'Upgrade package';
    case 'service_restart':
      return 'Reinício de serviço';
    case 'node_reboot':
      return 'Reboot do firewall';
    default:
      return type;
  }
}
