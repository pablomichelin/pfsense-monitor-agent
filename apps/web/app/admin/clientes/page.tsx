import { redirect } from 'next/navigation';
import Link from 'next/link';
import { PageHero } from '@/components/page-hero';
import { AdminSectionMessage } from '@/components/admin-section-message';
import { ClientDeleteButton } from '@/components/client-delete-button';
import { Alert, Button, Card, PageSection } from '@/components/ui';
import { deleteClientAction, updateClientAction } from '@/lib/admin';
import { ApiError, getNodesFilters, getNodesList, getSession } from '@/lib/api';
import { hasPermission } from '@/lib/authz';
import { formInputClassName, formSelectClassName } from '@/lib/form-field-styles';

export const dynamic = 'force-dynamic';

const returnTo = '/admin/clientes';

const navLinkClassName =
  'inline-flex h-10 min-h-10 items-center justify-center rounded-lg border border-slate-600/80 bg-panel-soft px-4 text-sm font-medium text-slate-200 transition hover:border-cyan-400/50 hover:text-white';

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
    if (error instanceof ApiError && error.status === 401) {
      redirect('/login');
    }
    throw error;
  }

  if (!hasPermission(session.permissions ?? [], 'clients.view')) {
    redirect('/dashboard');
  }

  try {
    const [filters, nodes] = await Promise.all([
      getNodesFilters(),
      getNodesList({ limit: 200 }),
    ]);
    filterOptions = filters;
    nodesCount = nodes.items.length;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect('/login');
    }
    throw error;
  }

  const activeClients = filterOptions.clients;
  const inactiveCount = filterOptions.inactive_client_count ?? 0;

  return (
    <div className="space-y-6">
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
        <Link href="/admin" className={navLinkClassName}>
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
              activeClients.map((client) => (
                <div
                  key={client.id}
                  className="rounded-xl border border-slate-700/80 bg-panel-soft/50 p-4"
                >
                  <form action={updateClientAction}>
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <input type="hidden" name="client_id" value={client.id} />
                    <div className="grid gap-3 md:grid-cols-3">
                      <input
                        type="text"
                        name="name"
                        defaultValue={client.name}
                        className={`${formInputClassName} w-full`}
                      />
                      <input
                        type="text"
                        name="code"
                        defaultValue={client.code}
                        className={`${formInputClassName} w-full`}
                      />
                      <select
                        name="status"
                        defaultValue={client.status}
                        className={`${formSelectClassName} w-full`}
                      >
                        <option value="active">active</option>
                        <option value="inactive">inactive</option>
                      </select>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-slate-500">
                        {client.node_count} firewall{client.node_count !== 1 ? 's' : ''}
                        <Link
                          href={`/nodes?client_id=${client.id}`}
                          className="ml-2 text-cyan-400 hover:text-cyan-300"
                        >
                          Ver no inventário
                        </Link>
                      </p>
                      <div className="flex items-center gap-2">
                        <Button type="submit" variant="secondary" className="border-cyan-500/30 bg-cyan-500/10 text-cyan-200">
                          Salvar cliente
                        </Button>
                        {client.node_count === 0 ? (
                          <ClientDeleteButton
                            clientId={client.id}
                            clientName={client.name}
                            returnTo={returnTo}
                            deleteClientAction={deleteClientAction}
                          />
                        ) : (
                          <span className="text-xs text-slate-500">
                            Remova os firewalls antes de excluir o cliente.
                          </span>
                        )}
                      </div>
                    </div>
                  </form>
                </div>
              ))
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
