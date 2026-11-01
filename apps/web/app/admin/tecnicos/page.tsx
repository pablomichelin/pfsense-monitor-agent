import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageHero } from '@/components/page-hero';
import { AdminTechnicianTargets } from '@/components/admin-technician-targets';
import { Alert, Badge, Card, PageSection } from '@/components/ui';
import {
  ApiError,
  getNodesList,
  getSession,
  getTechnician,
  getTechnicians,
  type TechnicianDetailResponse,
  type NodesListResponse,
} from '@/lib/api';
import { hasPermission } from '@/lib/authz';
import { adminNavLinkClassName } from '@/lib/admin-nav-styles';
import { formatDateTime } from '@/lib/format';
import {
  technicianAccountStatusBadgeVariant,
  technicianAccountStatusLabel,
  technicianRegistryStatusLabel,
} from '@/lib/technician-status';

export const dynamic = 'force-dynamic';

const NODE_LIST_LIMIT = 50;

function countByStatus(nodeAccounts: TechnicianDetailResponse['technician']['node_accounts']) {
  return nodeAccounts.reduce(
    (acc, account) => {
      acc[account.status] = (acc[account.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
}

export default async function AdminTecnicosPage() {
  let session;
  try {
    session = await getSession();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect('/login');
    }
    throw error;
  }

  const permissions = session.permissions ?? [];
  if (!hasPermission(permissions, 'technicians.view')) {
    redirect('/admin');
  }

  const canManageTechnicians = hasPermission(permissions, 'technicians.manage');
  const canManageRegistry = session.has_global_client_scope === true && canManageTechnicians;
  const canResetTechnicianPassword = hasPermission(permissions, 'technicians.password_reset.run');

  let technicianDetails: TechnicianDetailResponse['technician'][] = [];
  let nodePage: NodesListResponse;
  let batchMaxSize = 0;

  try {
    const [techniciansList, nodesList] = await Promise.all([
      getTechnicians('active'),
      getNodesList({ limit: NODE_LIST_LIMIT }),
    ]);

    nodePage = nodesList;
    batchMaxSize = techniciansList.batch_max_size;

    const details = await Promise.all(
      techniciansList.items.map((item) =>
        getTechnician(item.id).then((response) => response.technician),
      ),
    );
    technicianDetails = details;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect('/login');
    }
    throw error;
  }

  const totalActiveAccounts = technicianDetails.reduce(
    (sum, technician) =>
      sum + technician.node_accounts.filter((account) => account.status === 'active').length,
    0,
  );

  return (
    <div className="space-y-section">
      <PageHero
        eyebrow="Administração"
        title="Técnicos"
        description="Técnicos e contas locais visíveis no seu escopo, com provisionamento por firewall."
        stats={[
          { label: 'Técnicos no escopo', value: String(technicianDetails.length) },
          { label: 'Contas ativas no escopo', value: String(totalActiveAccounts) },
          { label: 'Firewalls no inventário', value: String(nodePage.total) },
        ]}
      />

      {!canManageRegistry ? <Alert variant="info">O cadastro global de técnicos é reservado a administradores com escopo global. Para o primeiro vínculo de um técnico, procure um administrador global.</Alert> : null}

      <PageSection title="Navegação">
        <div className="flex flex-wrap gap-3">
          <Link href="/admin" className={adminNavLinkClassName}>
            ← Cadastro
          </Link>
          <Link href="/nodes" className={adminNavLinkClassName}>
            Firewalls (inventário)
          </Link>
        </div>
      </PageSection>

      <PageSection
        title="Matriz técnico × firewall"
        description="Um técnico por linha. Expanda para ver em quais firewalls ele tem conta e o status de cada uma."
      >
        {technicianDetails.length === 0 ? (
          <Card className="p-6">
            <Alert variant="info">Nenhum técnico visível neste escopo.</Alert>
          </Card>
        ) : (
          <div className="space-y-3">
            {technicianDetails.map((technician) => {
              const counts = countByStatus(technician.node_accounts);
              return (
                <details
                  key={technician.id}
                  className="group rounded-lg border border-slate-800 bg-panel-soft/40 open:bg-panel-soft/60"
                >
                  <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="font-medium text-slate-200">
                        {technician.full_name}{' '}
                        <span className="font-mono text-xs text-slate-500">
                          ({technician.login_username})
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {technician.node_accounts.length === 0
                          ? 'Sem contas visíveis neste escopo'
                          : `${counts.active ?? 0} ativa(s), ${counts.pending_create ?? 0} provisionando, ${
                              counts.disabled ?? 0
                            } desativada(s), ${counts.removed ?? 0} removida(s)`}
                      </p>
                    </div>
                    <Badge variant={technician.status === 'revoked' ? 'warning' : 'success'}>
                      {technicianRegistryStatusLabel(technician.status)}
                    </Badge>
                  </summary>
                  <div className="border-t border-slate-800 px-4 py-3">
                    {technician.node_accounts.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        Este técnico não tem conta provisionada visível neste escopo.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-left text-sm">
                          <thead>
                            <tr className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-500">
                              <th className="px-3 py-2 font-medium">Firewall</th>
                              <th className="px-3 py-2 font-medium">Login</th>
                              <th className="px-3 py-2 font-medium">Status</th>
                              <th className="px-3 py-2 font-medium">Última sincronização</th>
                              <th className="px-3 py-2 font-medium">Detalhe</th>
                            </tr>
                          </thead>
                          <tbody>
                            {technician.node_accounts.map((account) => (
                              <tr
                                key={account.id}
                                className="border-b border-slate-900/80 text-slate-300 last:border-0"
                              >
                                <td className="px-3 py-2">
                                  <Link
                                    href={`/nodes/${account.node_id}`}
                                    className="text-cyan-400 hover:text-cyan-300"
                                  >
                                    {account.display_name ?? account.hostname}
                                  </Link>
                                </td>
                                <td className="px-3 py-2 font-mono text-xs">
                                  {account.pfsense_username}
                                </td>
                                <td className="px-3 py-2">
                                  <Badge variant={technicianAccountStatusBadgeVariant(account.status)}>
                                    {technicianAccountStatusLabel(account.status)}
                                  </Badge>
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap text-slate-400">
                                  {formatDateTime(account.last_synced_at)}
                                </td>
                                <td className="px-3 py-2 text-xs text-slate-500">
                                  {account.last_error ?? '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </PageSection>

      {canManageTechnicians || canResetTechnicianPassword ? (
        <PageSection
          title="Cadastro e ações em lote"
          description="Selecione explicitamente os firewalls do lote abaixo, dentro do limite informado pelo controlador."
        >
          <AdminTechnicianTargets
            nodes={nodePage.items}
            initialPage={nodePage}
            batchMaxSize={batchMaxSize}
            canManageTechnicians={canManageTechnicians}
            canManageRegistry={canManageRegistry}
            canResetTechnicianPassword={canResetTechnicianPassword}
          />
        </PageSection>
      ) : null}
    </div>
  );
}
