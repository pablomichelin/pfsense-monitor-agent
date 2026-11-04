'use client';

import type { NodesListResponse } from '@/lib/api';

import { ActionTabs } from '@/components/ui/action-tabs';
import {
  createClientAction,
  createUserAction,
} from '@/lib/admin';
import { AgentTokenForm } from '@/components/agent-token-form';
import { CreateNodeForm } from '@/components/create-node-form';
import { Card } from '@/components/ui/card';
import { AdminSectionMessage } from '@/components/admin-section-message';
import { RoleScopeFields } from '@/components/role-scope-fields';

type Client = { id: string; name: string; code: string };
type RoleOption = { code: string; label: string };
type Site = { id: string; name: string; code: string; client_id: string; client_name: string };
export function AdminCadastroCards({
  filterOptions,
  nodes,
  roles,
  canManageUsers,
  activeSection,
  status,
  message,
}: {
  filterOptions: { clients: Client[]; sites: Site[] };
  nodes: NodesListResponse;
  roles: RoleOption[];
  canManageUsers: boolean;
  activeSection?: string;
  status?: string;
  message?: string;
}) {
  const inputClass =
    'w-full rounded-lg border border-slate-600/80 bg-panel-soft h-11 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500';
  const selectClass =
    'w-full rounded-lg border border-slate-600/80 bg-panel-soft h-11 px-4 py-3 text-sm text-slate-200 outline-none';
  const submitClass =
    'w-full rounded-lg bg-cyan-500 h-11 px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-300';
  const noteClass =
    'rounded-xl border border-slate-700/80 bg-panel-soft/50 px-4 py-3 text-xs text-slate-400';

  return <ActionTabs id="admin-cadastro" label="Escolha o cadastro" initialTabId={activeSection} tabs={[
    { id: 'client', label: 'Cliente', description: 'Criar uma organização', content: (
      <Card className="p-5">
        <h2 className="font-display text-xl text-fg">Novo cliente</h2>
        <p className="mt-1 text-sm text-fg-muted">Cria a organização raiz para agrupar firewalls.</p>
        <AdminSectionMessage
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
            className={inputClass}
          />
          <input type="hidden" name="status" value="active" />
          <div className={noteClass}>O código técnico do cliente será gerado automaticamente.</div>
          <button type="submit" className={submitClass}>
            Criar cliente
          </button>
        </form>
      </Card>
    ) },
    { id: 'node', label: 'Firewall', description: 'Vincular um equipamento', content: (
      <Card className="p-5">
        <h2 className="font-display text-xl text-fg">Novo firewall</h2>
        <p className="mt-1 text-sm text-fg-muted">Selecione o cliente; o sistema associa o firewall ao cliente.</p>
        <CreateNodeForm
          clients={filterOptions.clients}
          sites={[]}
          sectionMessage={
            <AdminSectionMessage
              section="node"
              activeSection={activeSection}
              status={status}
              message={message}
            />
          }
        />
      </Card>
    ) },
    { id: 'user', label: 'Usuário', description: 'Acesso ao painel', content: (
      canManageUsers ? (
            <Card className="p-5">
        <h2 className="font-display text-xl text-fg">Novo usuário</h2>
        <p className="mt-1 text-sm text-fg-muted">Cria acesso humano com papel e senha local (superadmin).</p>
              <AdminSectionMessage
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
                  className={inputClass}
                />
                <input
                  type="text"
                  name="display_name"
                  placeholder="Nome exibido"
                  className={inputClass}
                />
                <input
                  type="password"
                  name="password"
                  placeholder="Senha 10+ caracteres"
                  required
                  minLength={10}
                  className={inputClass}
                />
                <RoleScopeFields
                  clients={filterOptions.clients}
                  roles={roles}
                  defaultRole="readonly"
                  defaultStatus="active"
                  inputClass={inputClass}
                  selectClass={selectClass}
                />
                <button type="submit" className={submitClass}>
                  Criar usuário
                </button>
              </form>
            </Card>
      ) : (
        <Card className="p-5">
        <h2 className="font-display text-xl text-fg">Governança de usuários</h2>
        <p className="mt-1 text-sm text-fg-muted">Gestão de usuários reservada ao superadmin.</p>
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            Sua sessão pode operar inventário e bootstrap; criar/editar usuários é em /admin/usuarios (superadmin).
          </div>
        </Card>
      )
    ) },
    { id: 'agent-token', unmountOnHide: true, label: 'Token do agente', description: 'Credencial por firewall', content: (
      <Card className="p-5">
        <h2 className="font-display text-xl text-fg">Token do agente</h2>
        <p className="mt-1 text-sm text-fg-muted">Emite token auxiliar por firewall (credencial rotacionavel).</p>
        <AdminSectionMessage
          section="agent-token"
          activeSection={activeSection}
          status={status}
          message={message}
        />
        <AgentTokenForm nodes={nodes.items} initialPage={nodes} />
      </Card>
    ) },
  ]} />;
}
