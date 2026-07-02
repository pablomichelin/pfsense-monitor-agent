import { KpiCard } from '@/components/dashboard/kpi-card';
import type { FleetResponse } from '@/lib/api';

type DashboardKpiGridProps = {
  fleet: FleetResponse;
  isClientProfile: boolean;
};

function formatPercent(value: number | null): string {
  if (value == null) {
    return '—';
  }

  return String(value);
}

export function DashboardKpiGrid({ fleet, isClientProfile }: DashboardKpiGridProps) {
  const { totals, compliance } = fleet;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 xl:gap-5">
      <KpiCard
        label="Total"
        value={totals.nodes}
        indicator={{ kind: 'status', dotClass: 'bg-cyan-400/80' }}
      />
      <KpiCard
        label="Online"
        value={totals.online}
        indicator={{ kind: 'status', dotClass: 'bg-signal-online' }}
      />
      <KpiCard
        label="Degradado"
        value={totals.degraded}
        indicator={{ kind: 'status', dotClass: 'bg-signal-degraded' }}
      />
      <KpiCard
        label="Offline"
        value={totals.offline}
        indicator={{ kind: 'status', dotClass: 'bg-signal-offline' }}
      />
      <KpiCard
        label="Manutenção"
        value={totals.maintenance}
        indicator={{ kind: 'status', dotClass: 'bg-slate-400' }}
      />
      {!isClientProfile ? (
        <KpiCard
          label="Alertas críticos"
          value={totals.critical_alerts}
          indicator={{
            kind: 'status',
            dotClass:
              totals.critical_alerts > 0 ? 'bg-signal-offline' : 'bg-signal-online',
          }}
        />
      ) : null}
      <KpiCard
        label="Backup em dia"
        value={formatPercent(compliance.backup_ok_percent)}
        suffix={compliance.backup_ok_percent == null ? undefined : '%'}
        indicator={{
          kind: 'status',
          dotClass:
            compliance.backup_ok_percent != null && compliance.backup_ok_percent >= 80
              ? 'bg-signal-online'
              : 'bg-signal-degraded',
        }}
      />
      <KpiCard
        label="Pacote desatualizado"
        value={formatPercent(compliance.package_outdated_percent)}
        suffix={compliance.package_outdated_percent == null ? undefined : '%'}
        indicator={{
          kind: 'status',
          dotClass:
            compliance.package_outdated_percent != null &&
            compliance.package_outdated_percent > 0
              ? 'bg-signal-degraded'
              : 'bg-signal-online',
        }}
      />
    </div>
  );
}
