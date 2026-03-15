import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageHero } from '@/components/page-hero';
import { ApiError, getDashboardSummary, getNodesList } from '@/lib/api';
import { RealtimeRefresh } from '@/components/realtime-refresh';
import { formatRelativeAge } from '@/lib/format';

export const dynamic = 'force-dynamic';

const statusTone: Record<string, string> = {
  online: 'bg-signal-online',
  degraded: 'bg-signal-degraded',
  offline: 'bg-signal-offline',
  maintenance: 'bg-signal-maintenance',
  unknown: 'bg-signal-unknown',
};

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="glass-panel min-h-28 rounded-xl p-6">
      <p className="font-mono text-xs uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <span className="font-display text-3xl font-semibold text-white">
          {value}
        </span>
        <span className={`status-dot shrink-0 ${tone}`} />
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  let summary;
  let nodes;

  try {
    [summary, nodes] = await Promise.all([
      getDashboardSummary(),
      getNodesList(),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect('/login');
    }

    throw error;
  }

  const attentionNodes = nodes.items
    .filter((node) => node.effective_status === 'offline' || node.effective_status === 'degraded')
    .slice(0, 6);

  const versionCounts = nodes.items.reduce<Record<string, number>>((acc, node) => {
    const version = node.pfsense_version ?? 'nao informado';
    acc[version] = (acc[version] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-8">
      <PageHero
        eyebrow="Visao operacional"
        title="Resumo dos firewalls"
        description="Veja rapidamente quantos firewalls estao online, precisam de atencao ou ainda aguardam instalacao."
        stats={[
          { label: 'Nodes', value: String(summary.totals.nodes) },
          { label: 'Alertas abertos', value: String(summary.totals.open_alerts), tone: summary.totals.open_alerts > 0 ? 'danger' : 'default' },
          { label: 'Fora da matriz', value: String(summary.totals.versions_out_of_matrix), tone: summary.totals.versions_out_of_matrix > 0 ? 'warning' : 'success' },
        ]}
        aside={<RealtimeRefresh renderedAt={summary.generated_at} />}
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 xl:gap-5">
        <SummaryCard label="Online" value={summary.totals.online} tone="bg-signal-online" />
        <SummaryCard label="Degraded" value={summary.totals.degraded} tone="bg-signal-degraded" />
        <SummaryCard label="Offline" value={summary.totals.offline} tone="bg-signal-offline" />
        <SummaryCard label="Alertas abertos" value={summary.totals.open_alerts} tone="bg-rose-400" />
        <SummaryCard
          label="Fora da matriz"
          value={summary.totals.versions_out_of_matrix}
          tone="bg-amber-400"
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
        <div className="glass-panel rounded-xl p-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-mono text-xs uppercase tracking-wider text-cyan-400/90">
                Zona quente
              </p>
              <h2 className="mt-1 font-display text-xl font-semibold text-white">
                Firewalls que exigem atencao agora
              </h2>
            </div>
            <Link
              href="/nodes?status=offline"
              className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-slate-600/80 bg-panel-soft px-4 text-sm text-slate-200 transition hover:border-cyan-400/50"
            >
              Ver inventario
            </Link>
          </div>

          <div className="space-y-3">
            {attentionNodes.length === 0 ? (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-5 py-5 text-sm text-emerald-200">
                Nenhum firewall offline ou degradado no momento.
              </div>
            ) : (
              attentionNodes.map((node) => (
                <Link
                  key={node.id}
                  href={`/nodes/${node.id}`}
                  className="block rounded-xl border border-slate-700/80 bg-panel-soft/70 px-5 py-4 transition hover:border-cyan-400/40 hover:bg-panel-soft"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex items-center gap-3">
                        <span className={`status-dot ${statusTone[node.effective_status]}`} />
                        <h3 className="font-display text-lg text-white">
                          {node.display_name ?? node.hostname}
                        </h3>
                      </div>
                      <p className="mt-1 text-sm text-slate-400">
                        {node.client.name} / {node.site.name}
                      </p>
                    </div>
                    <div className="text-sm text-slate-300">
                      <p>Ultimo heartbeat: {formatRelativeAge(node.last_seen_at)}</p>
                      <p>Alertas abertos: {node.open_alerts}</p>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="glass-panel rounded-xl p-6">
          <p className="font-mono text-xs uppercase tracking-wider text-cyan-400/90">
            Matriz de versao
          </p>
          <h2 className="mt-1 font-display text-xl font-semibold text-white">Versoes do pfSense</h2>
          <div className="mt-4 space-y-3">
            {Object.entries(versionCounts).map(([version, count]) => (
              <div
                key={version}
                className="rounded-xl border border-slate-700/80 bg-panel-soft/60 px-4 py-3.5"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="font-mono text-sm text-cyan-200">{version}</span>
                    {summary.version_matrix.homologated_pfsense_versions.includes(version) ? (
                      <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-200">
                        homologada
                      </span>
                    ) : (
                      <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-200">
                        fora da matriz
                      </span>
                    )}
                  </div>
                  <span className="font-display text-xl font-semibold text-white">{count}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-slate-700/80 bg-slate-950/40 px-4 py-3.5 text-sm text-slate-400">
            Atualizado {formatRelativeAge(summary.generated_at)}. Versoes homologadas: {summary.version_matrix.homologated_pfsense_versions.join(', ')}.
          </div>
        </div>
      </section>
    </div>
  );
}
