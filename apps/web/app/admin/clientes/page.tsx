import { redirect } from 'next/navigation';
import Link from 'next/link';
import { PageHero } from '@/components/page-hero';
import { AdminClientsList } from '@/components/admin-clients-list';
import { AdminSectionMessage } from '@/components/admin-section-message';
import { Alert, Card, PageSection } from '@/components/ui';
import { getNodesFilters, getNodesList, getSession } from '@/lib/api';
import { adminNavLinkClassName } from '@/lib/admin-nav-styles';
import { hasPermission } from '@/lib/authz';
import { handlePageApiError } from '@/lib/handle-page-api-error';

export const dynamic = 'force-dynamic';

const returnTo = '/admin/clientes';

export default async function AdminClientesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const activeSection = typeof params.section === 'string' ? params.section : undefined;
  const status = typeof params.status === 'string' ? params.status : undefined;
  const message = typeof params.message === 'string' ? params.message : undefined;

  let session;
  let filterOptions;
  let nodesCount = 0;

  try {
    session = await getSession();
  } catch (error) {
    handlePageApiError(error);
  }

  if (!hasPermission(session.permissions ?? [], 'clients.view')) {
    redirect('/conta?access=denied');
  }

  try {
    const [filters, nodes] = await Promise.all([
      getNodesFilters(),
      getNodesList({ limit: 200 }),
    ]);
    filterOptions = filters;
    nodesCount = nodes.items.length;
  } catch (error) {
    handlePageApiError(error);
  }

  const activeClients = filterOptions.clients;
  const inactiveCount = filterOptions.inactive_client_count ?? 0;

  return (
    <div className="space-y-8">
      <PageHero
        eyebrow="Administração"
        title="Clientes"
        description="Editar clientes e ver firewalls associados. Apenas entidades ativas em uso."
        stats={[
          { label: 'Clientes ativos', value: String(activeClients.length) },
          { label: 'Firewalls', value: String(nodesCount) },
        ]}
      />

      <PageSection title="Navegação">
        <Link href="/admin" className={adminNavLinkClassName}>
          ← Cadastro
        </Link>
      </PageSection>

      <PageSection
        title="Clientes ativos"
        description="Ajustes rápidos de nome, código e status. Firewalls por cliente no inventário."
      >
        <Card className="p-6">
          <div className="space-y-4">
            <AdminSectionMessage
              section="client-edit"
              activeSection={activeSection}
              status={status}
              message={message}
            />
            <AdminSectionMessage
              section="client-delete"
              activeSection={activeSection}
              status={status}
              message={message}
            />
            {activeClients.length === 0 ? (
              <Alert variant="info">Nenhum cliente ativo. Crie um em Cadastro.</Alert>
            ) : (
              <AdminClientsList clients={activeClients} returnTo={returnTo} />
            )}
          </div>
          {inactiveCount > 0 && (
            <div className="mt-6 border-t border-slate-700/80 pt-4">
              <p className="font-mono text-xs uppercase tracking-wider text-slate-500">
                Inativos ({inactiveCount})
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Clientes inativos não aparecem na operação diária. Edite o status acima para reativar.
              </p>
            </div>
          )}
        </Card>
      </PageSection>
    </div>
  );
}
