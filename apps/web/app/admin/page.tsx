import { redirect } from 'next/navigation';
import { PageHero } from '@/components/page-hero';
import { RealtimeRefresh } from '@/components/realtime-refresh';
import {
  createAgentTokenAction,
  createClientAction,
  createNodeAction,
  createSiteAction,
  createUserAction,
  revokeAgentTokenAction,
  revokeUserSessionAdminAction,
  updateClientAction,
  updateSiteAction,
  updateUserAction,
} from '@/lib/admin';
import {
  AgentTokensResponse,
  AdminUserSessionsResponse,
  ApiError,
  getAgentTokens,
  getAdminUserSessions,
  getNodesFilters,
  getNodesList,
  getSession,
  getUsersList,
} from '@/lib/api';
import { ADMIN_ROLES, SUPERADMIN_ROLES, hasRole } from '@/lib/authz';
import { formatRelativeAge } from '@/lib/format';

export const dynamic = 'force-dynamic';

function SectionMessage({
  section,
  activeSection,
  status,
  message,
}: {
  section: string;
  activeSection?: string;
  status?: string;
  message?: string;
}) {
  if (!message || activeSection !== section) {
    return null;
  }

  const tone =
    status === 'ok'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
      : 'border-rose-500/30 bg-rose-500/10 text-rose-200';

  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm ${tone}`}>
      {message}
    </div>
  );
}

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="glass-panel rounded-[2rem] p-5">
      <p className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-300">
        Admin
      </p>
      <h2 className="mt-2 font-display text-2xl text-white">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm text-slate-400">{description}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default async function AdminPage({
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
  let nodes;
  let users = { items: [] as Awaited<ReturnType<typeof getUsersList>>['items'] };
  let userSessionsByUserId = new Map<string, AdminUserSessionsResponse['items']>();
  let agentTokensByNodeId = new Map<string, AgentTokensResponse['items']>();

  try {
    session = await getSession();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect('/login');
    }

    throw error;
  }

  if (!hasRole(session.user.role, ADMIN_ROLES)) {
    redirect('/dashboard');
  }

  const canManageUsers = hasRole(session.user.role, SUPERADMIN_ROLES);

  try {
    [filterOptions, nodes, users] = await Promise.all([
      getNodesFilters(),
      getNodesList(),
      canManageUsers ? getUsersList() : Promise.resolve(users),
    ]);

    if (canManageUsers) {
      const sessionsEntries = await Promise.all(
        users.items.map(async (user) => [user.id, (await getAdminUserSessions(user.id)).items] as const),
      );

      userSessionsByUserId = new Map(sessionsEntries);
    }

    const tokenEntries = await Promise.all(
      nodes.items
        .slice(0, 5)
        .map(async (node) => [node.id, (await getAgentTokens(node.id)).items] as const),
    );

    agentTokensByNodeId = new Map(tokenEntries);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect('/login');
    }

    throw error;
  }

  const recentNodes = nodes.items.slice(0, 5);

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Operacao interna"
        title="Administracao do controlador"
        description="Cadastro operacional de clientes, sites, firewalls e acesso humano para manter o servidor completo antes da etapa de homologacao no pfSense real."
        stats={[
          { label: 'Clientes', value: String(filterOptions.clients.length) },
          { label: 'Nodes', value: String(nodes.items.length) },
          { label: 'Usuarios', value: canManageUsers ? String(users.items.length) : 'RBAC', tone: canManageUsers ? 'default' : 'warning' },
        ]}
        aside={<RealtimeRefresh renderedAt={filterOptions.generated_at} />}
      />

      <section className="grid gap-4 lg:grid-cols-4">
        <div className="glass-panel rounded-3xl p-5">
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-slate-500">
            Clientes
          </p>
          <div className="mt-3 flex items-end justify-between">
            <span className="font-display text-4xl font-semibold text-white">
              {filterOptions.clients.length}
            </span>
            <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 font-mono text-xs text-cyan-200">
              catalogados
            </span>
          </div>
        </div>

        <div className="glass-panel rounded-3xl p-5">
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-slate-500">
            Sites
          </p>
          <div className="mt-3 flex items-end justify-between">
            <span className="font-display text-4xl font-semibold text-white">
              {filterOptions.sites.length}
            </span>
            <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 font-mono text-xs text-cyan-200">
              ativos no inventario
            </span>
          </div>
        </div>

        <div className="glass-panel rounded-3xl p-5">
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-slate-500">
            Nodes
          </p>
          <div className="mt-3 flex items-end justify-between">
            <span className="font-display text-4xl font-semibold text-white">
              {nodes.items.length}
            </span>
            <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 font-mono text-xs text-cyan-200">
              provisionados
            </span>
          </div>
        </div>

        <div className="glass-panel rounded-3xl p-5">
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-slate-500">
            Usuarios
          </p>
          <div className="mt-3 flex items-end justify-between">
            <span className="font-display text-4xl font-semibold text-white">
              {canManageUsers ? users.items.length : 'RBAC'}
            </span>
            <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 font-mono text-xs text-cyan-200">
              {canManageUsers ? 'acesso humano' : 'superadmin only'}
            </span>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-4">
        <Card
          title="Novo cliente"
          description="Cria a organizacao raiz para agrupar sites e firewalls."
        >
          <SectionMessage
            section="client"
            activeSection={activeSection}
            status={status}
            message={message}
          />
          <form action={createClientAction} className="mt-4 space-y-3">
            <input
              type="text"
              name="name"
              placeholder="Amazon-Xxe"
              required
              className="w-full rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
            />
            <input type="hidden" name="status" value="active" />
            <div className="rounded-2xl border border-slate-800 bg-panel-soft/50 px-4 py-3 text-xs text-slate-400">
              O codigo tecnico do cliente sera gerado automaticamente.
            </div>
            <button
              type="submit"
              className="w-full rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-300"
            >
              Criar cliente
            </button>
          </form>
        </Card>

        <Card
          title="Novo site"
          description="Relaciona unidade operacional a um cliente ja existente."
        >
          <SectionMessage
            section="site"
            activeSection={activeSection}
            status={status}
            message={message}
          />
          <form action={createSiteAction} className="mt-4 space-y-3">
            <select
              name="client_id"
              required
              className="w-full rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-200 outline-none"
              defaultValue=""
            >
              <option value="" disabled>
                Selecione o cliente
              </option>
              {filterOptions.clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              name="name"
              placeholder="Matriz"
              required
              className="w-full rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
            />
            <input
              type="text"
              name="city"
              placeholder="Cidade"
              className="w-full rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
            />
            <input
              type="text"
              name="state"
              placeholder="Estado"
              className="w-full rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
            />
            <input
              type="text"
              name="timezone"
              defaultValue="America/Sao_Paulo"
              placeholder="America/Sao_Paulo"
              className="w-full rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
            />
            <input type="hidden" name="status" value="active" />
            <div className="rounded-2xl border border-slate-800 bg-panel-soft/50 px-4 py-3 text-xs text-slate-400">
              O codigo tecnico do site sera gerado automaticamente.
            </div>
            <button
              type="submit"
              className="w-full rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-300"
            >
              Criar site
            </button>
          </form>
        </Card>

        <Card
          title="Novo firewall"
          description="Provisiona o node no servidor e libera o bootstrap do agente."
        >
          <SectionMessage
            section="node"
            activeSection={activeSection}
            status={status}
            message={message}
          />
          <form action={createNodeAction} className="mt-4 space-y-3">
            <select
              name="site_id"
              required
              className="w-full rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-200 outline-none"
              defaultValue=""
            >
              <option value="" disabled>
                Selecione o site
              </option>
              {filterOptions.sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.client_name} / {site.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              name="hostname"
              placeholder="fw-amazon-xxe-matriz-01"
              required
              className="w-full rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
            />
            <input
              type="text"
              name="display_name"
              placeholder="Nome exibido no painel (opcional)"
              className="w-full rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
            />
            <input
              type="text"
              name="management_ip"
              placeholder="10.0.0.1"
              className="w-full rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
            />
            <input
              type="text"
              name="wan_ip"
              placeholder="198.51.100.10"
              className="w-full rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
            />
            <input
              type="text"
              name="pfsense_version"
              placeholder="2.8.1"
              className="w-full rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
            />
            <div className="rounded-2xl border border-slate-800 bg-panel-soft/50 px-4 py-3 text-xs text-slate-400">
              O `node_uid` sera gerado automaticamente a partir do hostname.
            </div>
            <label className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-panel-soft/50 px-4 py-3 text-sm text-slate-300">
              <input type="checkbox" name="maintenance_mode" className="h-4 w-4" />
              Criar node em maintenance mode
            </label>
            <button
              type="submit"
              className="w-full rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-300"
            >
              Criar firewall
            </button>
          </form>
        </Card>

        {canManageUsers ? (
          <Card
            title="Novo usuario"
            description="Cria acesso humano com papel, status e senha local persistida no banco."
          >
            <SectionMessage
              section="user"
              activeSection={activeSection}
              status={status}
              message={message}
            />
            <form action={createUserAction} className="mt-4 space-y-3">
              <input
                type="email"
                name="email"
                placeholder="operador@systemup.inf.br"
                required
                className="w-full rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
              />
              <input
                type="text"
                name="display_name"
                placeholder="Nome exibido"
                className="w-full rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
              />
              <input
                type="password"
                name="password"
                placeholder="Senha com 10+ caracteres"
                required
                minLength={10}
                className="w-full rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
              />
              <select
                name="role"
                defaultValue="readonly"
                className="w-full rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-200 outline-none"
              >
                <option value="readonly">readonly</option>
                <option value="operator">operator</option>
                <option value="admin">admin</option>
                <option value="superadmin">superadmin</option>
              </select>
              <select
                name="status"
                defaultValue="active"
                className="w-full rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-200 outline-none"
              >
                <option value="active">active</option>
                <option value="inactive">inactive</option>
              </select>
              <button
                type="submit"
                className="w-full rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-300"
              >
                Criar usuario
              </button>
            </form>
          </Card>
        ) : (
          <Card
            title="Governanca de usuarios"
            description="Gestao de usuarios humanos fica reservada ao papel superadmin para evitar escalada administrativa lateral."
          >
            <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm text-amber-100">
              Sua sessao pode operar inventario e bootstrap, mas nao pode criar, promover, desativar ou rotacionar senha de usuarios.
            </div>
          </Card>
        )}

        <Card
          title="Token do agente"
          description="Emite token auxiliar por firewall para fluxos operacionais que exijam credencial rotacionavel sem expor o segredo principal do bootstrap."
        >
          <SectionMessage
            section="agent-token"
            activeSection={activeSection}
            status={status}
            message={message}
          />
          <form action={createAgentTokenAction} className="mt-4 space-y-3">
            <select
              name="node_id"
              required
              defaultValue=""
              className="w-full rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-200 outline-none"
            >
              <option value="" disabled>
                Selecione o firewall
              </option>
              {nodes.items.slice(0, 20).map((node) => (
                <option key={node.id} value={node.id}>
                  {node.client.code} / {node.site.code} / {node.node_uid}
                </option>
              ))}
            </select>
            <input
              type="datetime-local"
              name="expires_at"
              className="w-full rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-100 outline-none"
            />
            <button
              type="submit"
              className="w-full rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-300"
            >
              Emitir token
            </button>
          </form>
        </Card>
      </div>

      <section className="glass-panel rounded-[2rem] p-5">
        <p className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-300">
          Ultimos nodes no inventario
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-800 text-slate-500">
              <tr>
                <th className="px-4 py-3">Node UID</th>
                <th className="px-4 py-3">Hostname</th>
                <th className="px-4 py-3">Cliente / Site</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Bootstrap</th>
              </tr>
            </thead>
            <tbody>
              {recentNodes.map((node) => (
                <tr key={node.id} className="border-b border-slate-900/80 text-slate-200">
                  <td className="px-4 py-3 font-mono text-xs">{node.node_uid}</td>
                  <td className="px-4 py-3">{node.display_name ?? node.hostname}</td>
                  <td className="px-4 py-3">
                    {node.client.name}
                    <div className="text-slate-500">{node.site.name}</div>
                  </td>
                  <td className="px-4 py-3">{node.effective_status}</td>
                  <td className="px-4 py-3">
                    <a href={`/nodes/${node.id}`} className="text-cyan-300 hover:text-cyan-200">
                      Abrir detalhe
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="glass-panel rounded-[2rem] p-5">
        <p className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-300">
          Tokens do agente por node recente
        </p>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          Revogue credenciais auxiliares por firewall sem precisar rotacionar o segredo principal do bootstrap.
        </p>
        <SectionMessage
          section="agent-token-list"
          activeSection={activeSection}
          status={status}
          message={message}
        />
        <div className="mt-4 space-y-4">
          {recentNodes.map((node) => {
            const tokens = agentTokensByNodeId.get(node.id) ?? [];

            return (
              <div key={node.id} className="rounded-2xl border border-slate-800 bg-panel-soft/40 p-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-white">{node.display_name ?? node.hostname}</p>
                    <p className="font-mono text-xs text-slate-500">{node.node_uid}</p>
                  </div>
                  <a href={`/nodes/${node.id}`} className="text-sm text-cyan-300 hover:text-cyan-200">
                    Abrir detalhe
                  </a>
                </div>
                <div className="mt-3 space-y-3">
                  {tokens.length === 0 ? (
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/30 px-4 py-3 text-sm text-slate-500">
                      Nenhum token auxiliar emitido para este node.
                    </div>
                  ) : (
                    tokens.map((token) => (
                      <div
                        key={token.id}
                        className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-950/30 p-3 lg:flex-row lg:items-center lg:justify-between"
                      >
                        <div className="space-y-1 text-sm text-slate-400">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs text-slate-300">{token.token_hint}</span>
                            <span className="rounded-full border border-slate-700 bg-slate-900/60 px-2 py-1 text-xs text-slate-300">
                              {token.status}
                            </span>
                          </div>
                          <p>Criado em {new Date(token.created_at).toLocaleString('pt-BR')}</p>
                          <p>Expira em {token.expires_at ? new Date(token.expires_at).toLocaleString('pt-BR') : 'nao definido'}</p>
                          <p>Ultimo uso: {token.last_used_at ? formatRelativeAge(token.last_used_at) : 'ainda nao usado'}</p>
                        </div>
                        {token.revoked_at ? (
                          <div className="text-sm text-slate-500">
                            Revogado em {new Date(token.revoked_at).toLocaleString('pt-BR')}
                          </div>
                        ) : (
                          <form action={revokeAgentTokenAction}>
                            <input type="hidden" name="node_id" value={node.id} />
                            <input type="hidden" name="token_id" value={token.id} />
                            <button
                              type="submit"
                              className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-200 transition hover:bg-rose-500/20"
                            >
                              Revogar
                            </button>
                          </form>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {canManageUsers ? (
        <section className="glass-panel rounded-[2rem] p-5">
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-300">
            Usuarios e papeis
          </p>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Gestao inicial de acesso humano para transformar o RBAC em operacao real.
          </p>
          <div className="mt-4 space-y-4">
            <SectionMessage
              section="user-edit"
              activeSection={activeSection}
              status={status}
              message={message}
            />
            {users.items.map((user) => (
              <div
                key={user.id}
                className="rounded-2xl border border-slate-800 bg-panel-soft/50 p-4"
              >
                <form
                  action={updateUserAction}
                  className="grid gap-3 lg:grid-cols-[1.2fr_1fr_0.9fr_0.9fr_1.2fr_auto]"
                >
                  <input type="hidden" name="user_id" value={user.id} />
                  <input
                    type="email"
                    name="email"
                    defaultValue={user.email}
                    className="rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-100 outline-none"
                  />
                  <input
                    type="text"
                    name="display_name"
                    defaultValue={user.display_name ?? ''}
                    placeholder="Nome exibido"
                    className="rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                  />
                  <select
                    name="role"
                    defaultValue={user.role}
                    className="rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-200 outline-none"
                  >
                    <option value="readonly">readonly</option>
                    <option value="operator">operator</option>
                    <option value="admin">admin</option>
                    <option value="superadmin">superadmin</option>
                  </select>
                  <select
                    name="status"
                    defaultValue={user.status}
                    className="rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-200 outline-none"
                  >
                    <option value="active">active</option>
                    <option value="inactive">inactive</option>
                  </select>
                  <input
                    type="password"
                    name="password"
                    placeholder="Nova senha opcional"
                    minLength={10}
                    className="rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                  />
                  <button
                    type="submit"
                    className="rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-300"
                  >
                    Salvar
                  </button>
                </form>

                <div className="mt-4 rounded-2xl border border-slate-900/80 bg-slate-950/40 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">
                        Sessoes humanas
                      </p>
                      <p className="mt-1 text-sm text-slate-400">
                        Revogue sessoes antigas ou comprometidas de {user.email}.
                      </p>
                    </div>
                    <div className="text-sm text-slate-500">
                      {(userSessionsByUserId.get(user.id) ?? []).length} sessoes
                    </div>
                  </div>

                  <SectionMessage
                    section="user-sessions"
                    activeSection={activeSection}
                    status={status}
                    message={message}
                  />

                  <div className="mt-4 space-y-3">
                    {(userSessionsByUserId.get(user.id) ?? []).map((sessionItem) => (
                      <div
                        key={sessionItem.id}
                        className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-panel-soft/40 p-3 lg:flex-row lg:items-start lg:justify-between"
                      >
                        <div className="space-y-1 text-sm text-slate-400">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs text-slate-500">{sessionItem.id}</span>
                            {sessionItem.current ? (
                              <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-xs text-cyan-200">
                                Sessao atual
                              </span>
                            ) : null}
                            {sessionItem.revoked_at ? (
                              <span className="rounded-full border border-slate-700 bg-slate-900/60 px-2 py-1 text-xs text-slate-300">
                                Revogada
                              </span>
                            ) : (
                              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200">
                                Ativa
                              </span>
                            )}
                          </div>
                          <p>Ultima atividade: {formatRelativeAge(sessionItem.last_seen_at ?? sessionItem.created_at)}</p>
                          <p>Criada em {new Date(sessionItem.created_at).toLocaleString('pt-BR')}</p>
                          <p>IP: <span className="text-slate-200">{sessionItem.ip_address ?? 'nao informado'}</span></p>
                          <p className="break-all">
                            Agent: <span className="text-slate-200">{sessionItem.user_agent ?? 'nao informado'}</span>
                          </p>
                        </div>

                        {sessionItem.current || sessionItem.revoked_at ? (
                          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm text-slate-400">
                            {sessionItem.current ? 'Use logout para encerrar a sessao atual.' : 'Sessao encerrada.'}
                          </div>
                        ) : (
                          <form action={revokeUserSessionAdminAction}>
                            <input type="hidden" name="user_id" value={user.id} />
                            <input type="hidden" name="session_id" value={sessionItem.id} />
                            <button
                              type="submit"
                              className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 transition hover:border-rose-400/50 hover:text-rose-100"
                            >
                              Revogar sessao
                            </button>
                          </form>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card
          title="Editar clientes"
          description="Ajustes rapidos de nome, codigo e status sem sair do painel."
        >
          <SectionMessage
            section="client-edit"
            activeSection={activeSection}
            status={status}
            message={message}
          />
          <div className="mt-4 space-y-4">
            {filterOptions.clients.map((client) => (
              <form
                key={client.id}
                action={updateClientAction}
                className="rounded-2xl border border-slate-800 bg-panel-soft/50 p-4"
              >
                <input type="hidden" name="client_id" value={client.id} />
                <div className="grid gap-3 md:grid-cols-3">
                  <input
                    type="text"
                    name="name"
                    defaultValue={client.name}
                    className="rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-100 outline-none"
                  />
                  <input
                    type="text"
                    name="code"
                    defaultValue={client.code}
                    className="rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-100 outline-none"
                  />
                  <select
                    name="status"
                    defaultValue={client.status}
                    className="rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-200 outline-none"
                  >
                    <option value="active">active</option>
                    <option value="inactive">inactive</option>
                  </select>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <p className="text-xs text-slate-500">
                    {client.site_count} sites / {client.node_count} nodes
                  </p>
                  <button
                    type="submit"
                    className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-200 transition hover:border-cyan-400/50"
                  >
                    Salvar cliente
                  </button>
                </div>
              </form>
            ))}
          </div>
        </Card>

        <Card
          title="Editar sites"
          description="Ajustes operacionais de identificacao e localidade dos sites."
        >
          <SectionMessage
            section="site-edit"
            activeSection={activeSection}
            status={status}
            message={message}
          />
          <div className="mt-4 space-y-4">
            {filterOptions.sites.map((site) => (
              <form
                key={site.id}
                action={updateSiteAction}
                className="rounded-2xl border border-slate-800 bg-panel-soft/50 p-4"
              >
                <input type="hidden" name="site_id" value={site.id} />
                <p className="mb-3 text-xs text-slate-500">{site.client_name}</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <input
                    type="text"
                    name="name"
                    defaultValue={site.name}
                    className="rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-100 outline-none"
                  />
                  <input
                    type="text"
                    name="code"
                    defaultValue={site.code}
                    className="rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-100 outline-none"
                  />
                  <input
                    type="text"
                    name="city"
                    defaultValue={site.city ?? ''}
                    className="rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-100 outline-none"
                  />
                  <input
                    type="text"
                    name="state"
                    defaultValue={site.state ?? ''}
                    className="rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-100 outline-none"
                  />
                  <input
                    type="text"
                    name="timezone"
                    defaultValue={site.timezone ?? ''}
                    className="rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-100 outline-none"
                  />
                  <select
                    name="status"
                    defaultValue={site.status}
                    className="rounded-2xl border border-slate-700 bg-panel-soft px-4 py-3 text-sm text-slate-200 outline-none"
                  >
                    <option value="active">active</option>
                    <option value="inactive">inactive</option>
                  </select>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <p className="text-xs text-slate-500">{site.node_count} nodes</p>
                  <button
                    type="submit"
                    className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-200 transition hover:border-cyan-400/50"
                  >
                    Salvar site
                  </button>
                </div>
              </form>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
