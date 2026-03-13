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
    <div className="glass-panel rounded-3xl p-5">
      <p className="font-mono text-xs uppercase tracking-[0.28em] text-slate-500">
        {label}
      </p>
      <div className="mt-3 flex items-end justify-between">
        <span className="font-display text-4xl font-semibold text-white">
          {value}
        </span>
        <span className={`status-dot ${tone}`} />
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
    <div className="space-y-6">
      <PageHero
        eyebrow="Visao operacional"
        title="Estado consolidado do controlador"
        description="Abertura rapida para operacao: quantidade de firewalls, pressao de alertas e desvios de versao homologada em um unico bloco."
        stats={[
          { label: 'Nodes', value: String(summary.totals.nodes) },
          { label: 'Alertas abertos', value: String(summary.totals.open_alerts), tone: summary.totals.open_alerts > 0 ? 'danger' : 'default' },
          { label: 'Fora da matriz', value: String(summary.totals.versions_out_of_matrix), tone: summary.totals.versions_out_of_matrix > 0 ? 'warning' : 'success' },
        ]}
        aside={<RealtimeRefresh renderedAt={summary.generated_at} />}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-7">
        <SummaryCard label="Nodes" value={summary.totals.nodes} tone="bg-cyan-400" />
        <SummaryCard label="Online" value={summary.totals.online} tone="bg-signal-online" />
        <SummaryCard label="Degraded" value={summary.totals.degraded} tone="bg-signal-degraded" />
        <SummaryCard label="Offline" value={summary.totals.offline} tone="bg-signal-offline" />
        <SummaryCard label="Maintenance" value={summary.totals.maintenance} tone="bg-signal-maintenance" />
        <SummaryCard label="Open Alerts" value={summary.totals.open_alerts} tone="bg-rose-400" />
        <SummaryCard
          label="Fora da matriz"
          value={summary.totals.versions_out_of_matrix}
          tone="bg-amber-400"
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
        <div className="glass-panel rounded-[2rem] p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-300">
                Zona quente
              </p>
              <h2 className="font-display text-2xl text-white">
                Firewalls que exigem atencao agora
              </h2>
            </div>
            <Link
              href="/nodes?status=offline"
              className="rounded-full border border-slate-700 bg-panel-soft px-4 py-2 text-sm text-slate-200 transition hover:border-cyan-400/60"
            >
              Ver inventario
            </Link>
          </div>

          <div className="space-y-3">
            {attentionNodes.length === 0 ? (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-6 text-sm text-emerald-200">
                Nenhum firewall offline ou degradado no momento.
              </div>
            ) : (
              attentionNodes.map((node) => (
                <Link
                  key={node.id}
                  href={`/nodes/${node.id}`}
                  className="block rounded-2xl border border-slate-800 bg-panel-soft/70 px-4 py-4 transition hover:border-cyan-400/40 hover:bg-panel-soft"
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

        <div className="glass-panel rounded-[2rem] p-5">
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-300">
            Matriz de versao
          </p>
          <h2 className="mt-2 font-display text-2xl text-white">
            Distribuicao do pfSense
          </h2>
          <div className="mt-5 space-y-3">
            {Object.entries(versionCounts).map(([version, count]) => (
              <div
                key={version}
                className="rounded-2xl border border-slate-800 bg-panel-soft/60 px-4 py-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm text-cyan-200">{version}</span>
                    {summary.version_matrix.homologated_pfsense_versions.includes(version) ? (
                      <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200">
                        homologada
                      </span>
                    ) : (
                      <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-200">
                        fora da matriz
                      </span>
                    )}
                  </div>
                  <span className="font-display text-2xl text-white">{count}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-4 text-sm text-slate-400">
            Atualizado em {formatRelativeAge(summary.generated_at)}. Versao do backend: {summary.version}. Matriz homologada: {summary.version_matrix.homologated_pfsense_versions.join(', ')}.
          </div>
        </div>
      </section>
    </div>
  );
}
