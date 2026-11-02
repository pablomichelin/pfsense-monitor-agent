import { redirect } from 'next/navigation';
import Link from 'next/link';
import { PageHero } from '@/components/page-hero';
import { AdminClientsList } from '@/components/admin-clients-list';
import { AdminSectionMessage } from '@/components/admin-section-message';
import { Alert, Card, PageSection } from '@/components/ui';
import { getAdminClientsList, getSession } from '@/lib/api';
import { adminNavLinkClassName } from '@/lib/admin-nav-styles';
import { hasPermission } from '@/lib/authz';
import { handlePageApiError } from '@/lib/handle-page-api-error';

export const dynamic = 'force-dynamic';


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
  let result;
  const clientStatus = params.clientStatus === 'inactive' ? 'inactive' : 'active';
  const search = typeof params.search === 'string' ? params.search.trim().slice(0, 200) : '';
  const requestedPage = Number(params.page);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 1000000) : 1;
  const href = (nextPage = page, nextStatus = clientStatus) => {
    const query = new URLSearchParams({ clientStatus: nextStatus, page: String(nextPage) });
    if (search) query.set('search', search);
    return `/admin/clientes?${query}`;
  };
  const returnTo = href();

  try {
    session = await getSession();
  } catch (error) {
    handlePageApiError(error);
  }

  if (!hasPermission(session.permissions ?? [], 'clients.view')) {
    redirect('/conta?access=denied');
  }

  const canViewInactive = session.user.role === 'superadmin' || session.has_global_client_scope === true;
  if (clientStatus === 'inactive' && !canViewInactive) redirect(href(1, 'active'));
  try {
    result = await getAdminClientsList({ status: clientStatus, search, page, limit: 50 });
  } catch (error) {
    handlePageApiError(error);
  }
  if (page > result.total_pages) redirect(href(result.total_pages));

  return (
    <div className="space-y-section">
      <PageHero
        eyebrow="Administração"
        title="Clientes"
        description="Consulte clientes, ajuste seus dados e acompanhe os vínculos existentes."
        stats={[
          { label: clientStatus === 'active' ? 'Clientes ativos' : 'Clientes inativos', value: String(result.total) },
        ]}
      />

      <PageSection title="Navegação">
        <Link href="/admin" className={adminNavLinkClassName}>
          ← Cadastro
        </Link>
      </PageSection>

      <PageSection
        title={clientStatus === 'active' ? 'Clientes ativos' : 'Clientes inativos'}
        description={canViewInactive ? "Ajuste nome, código e status. A reativação preserva os vínculos existentes." : "Clientes ativos do seu escopo. A consulta de inativos requer escopo global."}
      >
        <Card className="p-6">
          <div className="space-y-4">
            <nav aria-label="Status dos clientes" className="flex gap-4 text-sm">
              <Link href={href(1, 'active')} aria-current={clientStatus === 'active' ? 'page' : undefined} className="text-primary hover:underline">Ativos</Link>
              {canViewInactive ? <Link href={href(1, 'inactive')} aria-current={clientStatus === 'inactive' ? 'page' : undefined} className="text-primary hover:underline">Inativos</Link> : null}
            </nav>
            <form action="/admin/clientes" className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="clientStatus" value={clientStatus} />
              <label className="text-sm text-fg-muted">Buscar cliente
                <input key={search} name="search" type="search" defaultValue={search} maxLength={200} placeholder="Nome ou código" className="ml-2 rounded border border-border bg-surface p-2 text-fg" />
              </label>
              <button type="submit" className="rounded border border-border px-3 py-2 text-sm">Buscar</button>
            </form>
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
            {result.items.length === 0 ? (
              <Alert variant="info">Nenhum cliente encontrado neste filtro.</Alert>
            ) : (
              <AdminClientsList key={returnTo} clients={result.items} returnTo={returnTo}
                canViewFirewalls={hasPermission(session.permissions ?? [], 'firewalls.view')}
                canUpdate={hasPermission(session.permissions ?? [], 'clients.update')}
                canDelete={hasPermission(session.permissions ?? [], 'clients.delete')} />
            )}
          </div>
          <nav aria-label="Paginação de clientes" className="mt-4 flex items-center gap-4 text-sm">
            {page > 1 ? <Link href={href(page - 1)} className="text-primary">Anterior</Link> : null}
            <span>Página {page} de {result.total_pages} · {result.total} clientes</span>
            {page < result.total_pages ? <Link href={href(page + 1)} className="text-primary">Próxima</Link> : null}
          </nav>
        </Card>
      </PageSection>
    </div>
  );
}
