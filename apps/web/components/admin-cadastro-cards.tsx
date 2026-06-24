'use client';

import { useEffect, useState } from 'react';
import {
  createAgentTokenAction,
  createClientAction,
  createUserAction,
} from '@/lib/admin';
import { CreateNodeForm } from '@/components/create-node-form';
import { AdminCollapsibleCard } from '@/components/admin-collapsible-card';
import { AdminSectionMessage } from '@/components/admin-section-message';
import { RoleScopeFields } from '@/components/role-scope-fields';

type Client = { id: string; name: string; code: string };
type RoleOption = { code: string; label: string };
type Site = { id: string; name: string; code: string; client_id: string; client_name: string };
type NodeItem = {
  id: string;
  node_uid: string;
  client: { code: string };
  site: { code: string };
};

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
  nodes: { items: NodeItem[] };
  roles: RoleOption[];
  canManageUsers: boolean;
  activeSection?: string;
  status?: string;
  message?: string;
}) {
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  useEffect(() => {
    if (activeSection) {
      setExpandedSection(activeSection);
    }
  }, [activeSection]);

  const toggle = (section: string) => {
    setExpandedSection((prev) => (prev === section ? null : section));
  };

  const inputClass =
    'w-full rounded-lg border border-slate-600/80 bg-panel-soft h-11 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500';
  const selectClass =
    'w-full rounded-lg border border-slate-600/80 bg-panel-soft h-11 px-4 py-3 text-sm text-slate-200 outline-none';
  const submitClass =
    'w-full rounded-lg bg-cyan-500 h-11 px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-300';
  const noteClass =
    'rounded-xl border border-slate-700/80 bg-panel-soft/50 px-4 py-3 text-xs text-slate-400';

  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 items-stretch">
      <AdminCollapsibleCard
        title="Novo cliente"
        description="Cria a organização raiz para agrupar firewalls."
        section="client"
        isExpanded={expandedSection === 'client'}
        onToggle={() => toggle('client')}
        actionLabel="Criar cliente"
      >
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
      </AdminCollapsibleCard>

      <AdminCollapsibleCard
        title="Novo firewall"
        description="Selecione o cliente; o sistema associa o firewall ao cliente."
        section="node"
        isExpanded={expandedSection === 'node'}
        onToggle={() => toggle('node')}
        actionLabel="Criar firewall"
      >
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
      </AdminCollapsibleCard>

      {canManageUsers ? (
            <AdminCollapsibleCard
              title="Novo usuário"
              description="Cria acesso humano com papel e senha local (superadmin)."
              section="user"
              isExpanded={expandedSection === 'user'}
              onToggle={() => toggle('user')}
              actionLabel="Criar usuário"
            >
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
            </AdminCollapsibleCard>
      ) : (
        <AdminCollapsibleCard
          title="Governança de usuários"
          description="Gestão de usuários reservada ao superadmin."
          section="user"
          isExpanded={false}
          onToggle={() => {}}
          actionLabel=""
          collapsible={false}
        >
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            Sua sessão pode operar inventário e bootstrap; criar/editar usuários é em /admin/usuarios (superadmin).
          </div>
        </AdminCollapsibleCard>
      )}

      <AdminCollapsibleCard
        title="Token do agente"
        description="Emite token auxiliar por firewall (credencial rotacionavel)."
        section="agent-token"
        isExpanded={expandedSection === 'agent-token'}
        onToggle={() => toggle('agent-token')}
        actionLabel="Emitir token"
      >
        <AdminSectionMessage
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
            className={selectClass}
          >
            <option value="" disabled>
              Selecione o firewall
            </option>
            {nodes.items.slice(0, 20).map((node) => (
              <option key={node.id} value={node.id}>
                {node.client.code} — {node.node_uid}
              </option>
            ))}
          </select>
          <input
            type="datetime-local"
            name="expires_at"
            className={inputClass}
          />
          <button type="submit" className={submitClass}>
            Emitir token
          </button>
        </form>
      </AdminCollapsibleCard>
    </div>
  );
}
