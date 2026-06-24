import { KpiCard } from '@/components/dashboard/kpi-card';

type DashboardKpiGridProps = {
  online: number;
  degraded: number;
  offline: number;
  openAlerts: number;
  distinctVersions: number;
  isClientProfile: boolean;
};

export function DashboardKpiGrid({
  online,
  degraded,
  offline,
  openAlerts,
  distinctVersions,
  isClientProfile,
}: DashboardKpiGridProps) {
  return (
    <div
      className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${
        isClientProfile ? 'xl:grid-cols-4' : 'xl:grid-cols-5'
      } xl:gap-5`}
    >
      <KpiCard
        label="Online"
        value={online}
        indicator={{ kind: 'status', dotClass: 'bg-signal-online' }}
      />
      <KpiCard
        label="Degradado"
        value={degraded}
        indicator={{ kind: 'status', dotClass: 'bg-signal-degraded' }}
      />
      <KpiCard
        label="Offline"
        value={offline}
        indicator={{ kind: 'status', dotClass: 'bg-signal-offline' }}
      />
      {!isClientProfile ? (
        <KpiCard
          label="Alertas abertos"
          value={openAlerts}
          indicator={{
            kind: 'status',
            dotClass: openAlerts > 0 ? 'bg-signal-offline' : 'bg-signal-online',
          }}
        />
      ) : null}
      <KpiCard
        label="Versões pfSense"
        value={distinctVersions}
        indicator={{ kind: 'status', dotClass: 'bg-cyan-400/80' }}
      />
    </div>
  );
}
