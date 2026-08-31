'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Alert, Button, Card } from '@/components/ui';
import {
  createGroupAction,
  createTagAction,
  deleteGroupAction,
  deleteTagAction,
  updateGroupMembersAction,
} from '@/lib/fleet-org-actions';
import type { FleetGroupItem, FleetTagItem } from '@/lib/api';

type ClientOption = {
  id: string;
  name: string;
};

type NodeOption = {
  id: string;
  label: string;
  client_id: string;
};

type Props = {
  tags: FleetTagItem[];
  groups: FleetGroupItem[];
  clients: ClientOption[];
  nodes: NodeOption[];
  groupMemberIds: Record<string, string[]>;
  canManageTags: boolean;
  canManageGroups: boolean;
};

function DeleteTagButton({
  tag,
  disabled,
  onDeleted,
}: {
  tag: FleetTagItem;
  disabled: boolean;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  return (
    <>
      <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => setOpen(true)}>
        Excluir
      </Button>
      <ConfirmDialog
        open={open}
        title="Excluir tag"
        confirmLabel="Excluir"
        loading={loading}
        onCancel={() => {
          if (!loading) {
            setOpen(false);
          }
        }}
        onConfirm={async () => {
          setLoading(true);
          const result = await deleteTagAction(tag.id);
          setLoading(false);
          if (result.ok) {
            setOpen(false);
            onDeleted();
          }
        }}
        description={`Remover a tag "${tag.name}"? Associações nos firewalls serão removidas.`}
      />
    </>
  );
}

function DeleteGroupButton({
  group,
  disabled,
  onDeleted,
}: {
  group: FleetGroupItem;
  disabled: boolean;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  return (
    <>
      <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => setOpen(true)}>
        Excluir
      </Button>
      <ConfirmDialog
        open={open}
        title="Excluir grupo"
        confirmLabel="Excluir"
        loading={loading}
        onCancel={() => {
          if (!loading) {
            setOpen(false);
          }
        }}
        onConfirm={async () => {
          setLoading(true);
          const result = await deleteGroupAction(group.id);
          setLoading(false);
          if (result.ok) {
            setOpen(false);
            onDeleted();
          }
        }}
        description={`Remover o grupo "${group.name}"?`}
      />
    </>
  );
}

export function FleetOrgAdminPanel({
  tags,
  groups,
  clients,
  nodes,
  groupMemberIds,
  canManageTags,
  canManageGroups,
}: Props) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string>(groups[0]?.id ?? '');
  const [pending, setPending] = useState(false);

  const selectedGroup = groups.find((group) => group.id === selectedGroupId) ?? null;
  const groupNodes = useMemo(
    () =>
      selectedGroup
        ? nodes.filter((node) => node.client_id === selectedGroup.client_id)
        : [],
    [nodes, selectedGroup],
  );
  const selectedMemberIds = selectedGroupId ? groupMemberIds[selectedGroupId] ?? [] : [];

  async function handleCreateTag(formData: FormData) {
    setPending(true);
    setError(null);
    setMessage(null);
    const result = await createTagAction(formData);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessage('Tag criada.');
    router.refresh();
  }

  async function handleCreateGroup(formData: FormData) {
    setPending(true);
    setError(null);
    setMessage(null);
    const result = await createGroupAction(formData);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessage('Grupo criado.');
    router.refresh();
  }

  async function handleSaveMembers(formData: FormData) {
    if (!selectedGroupId) {
      return;
    }

    setPending(true);
    setError(null);
    const nodeIds = formData.getAll('member_node_ids').map((value) => String(value));
    const result = await updateGroupMembersAction(selectedGroupId, nodeIds);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessage('Membros do grupo atualizados.');
    router.refresh();
  }

  return (
    <div className="space-y-section">
      {message ? <Alert variant="success">{message}</Alert> : null}
      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="space-y-4 p-6">
          <div>
            <h3 className="font-display text-lg text-fg">Tags por cliente</h3>
            <p className="mt-1 text-sm text-slate-400">
              Etiquetas livres para filtros no inventário. Não substituem RBAC.
            </p>
          </div>

          {canManageTags ? (
            <form action={handleCreateTag} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <select
                name="client_id"
                required
                defaultValue={clients[0]?.id ?? ''}
                className="h-11 rounded-lg border border-slate-600/80 bg-panel-soft px-3 text-sm text-slate-200"
              >
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
              <input
                name="name"
                required
                placeholder="Nome da tag"
                className="h-11 rounded-lg border border-slate-600/80 bg-panel-soft px-3 text-sm text-slate-100"
              />
              <Button type="submit" disabled={pending}>
                Criar tag
              </Button>
            </form>
          ) : null}

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-800 text-slate-400">
                <tr>
                  <th className="px-3 py-2">Tag</th>
                  <th className="px-3 py-2">Cliente</th>
                  <th className="px-3 py-2">Firewalls</th>
                  {canManageTags ? <th className="px-3 py-2">Ações</th> : null}
                </tr>
              </thead>
              <tbody>
                {tags.map((tag) => (
                  <tr key={tag.id} className="border-b border-slate-900/80 text-slate-200">
                    <td className="px-3 py-2">{tag.name}</td>
                    <td className="px-3 py-2">{tag.client_name}</td>
                    <td className="px-3 py-2">{tag.node_count}</td>
                    {canManageTags ? (
                      <td className="px-3 py-2">
                        <DeleteTagButton
                          tag={tag}
                          disabled={pending}
                          onDeleted={() => router.refresh()}
                        />
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
            {tags.length === 0 ? (
              <p className="px-3 py-4 text-sm text-slate-500">Nenhuma tag cadastrada.</p>
            ) : null}
          </div>
        </Card>

        <Card className="space-y-4 p-6">
          <div>
            <h3 className="font-display text-lg text-fg">Grupos ad-hoc</h3>
            <p className="mt-1 text-sm text-slate-400">
              Conjuntos nomeados de firewalls para filtros e operações futuras em lote.
            </p>
          </div>

          {canManageGroups ? (
            <form action={handleCreateGroup} className="grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <select
                  name="client_id"
                  required
                  defaultValue={clients[0]?.id ?? ''}
                  className="h-11 rounded-lg border border-slate-600/80 bg-panel-soft px-3 text-sm text-slate-200"
                >
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
                <input
                  name="name"
                  required
                  placeholder="Nome do grupo"
                  className="h-11 rounded-lg border border-slate-600/80 bg-panel-soft px-3 text-sm text-slate-100"
                />
              </div>
              <input
                name="description"
                placeholder="Descrição opcional"
                className="h-11 rounded-lg border border-slate-600/80 bg-panel-soft px-3 text-sm text-slate-100"
              />
              <Button type="submit" disabled={pending}>
                Criar grupo
              </Button>
            </form>
          ) : null}

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-800 text-slate-400">
                <tr>
                  <th className="px-3 py-2">Grupo</th>
                  <th className="px-3 py-2">Cliente</th>
                  <th className="px-3 py-2">Membros</th>
                  {canManageGroups ? <th className="px-3 py-2">Ações</th> : null}
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <tr key={group.id} className="border-b border-slate-900/80 text-slate-200">
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="text-left hover:text-cyan-200"
                        onClick={() => setSelectedGroupId(group.id)}
                      >
                        {group.name}
                      </button>
                    </td>
                    <td className="px-3 py-2">{group.client_name}</td>
                    <td className="px-3 py-2">{group.member_count}</td>
                    {canManageGroups ? (
                      <td className="px-3 py-2">
                        <DeleteGroupButton
                          group={group}
                          disabled={pending}
                          onDeleted={() => router.refresh()}
                        />
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
            {groups.length === 0 ? (
              <p className="px-3 py-4 text-sm text-slate-500">Nenhum grupo cadastrado.</p>
            ) : null}
          </div>
        </Card>
      </div>

      {canManageGroups && selectedGroup ? (
        <Card className="space-y-4 p-6">
          <div>
            <h3 className="font-display text-lg text-fg">
              Membros — {selectedGroup.name}
            </h3>
            <p className="mt-1 text-sm text-slate-400">
              Cliente {selectedGroup.client_name}. Apenas firewalls deste cliente podem integrar o grupo.
            </p>
          </div>

          <form action={handleSaveMembers} className="space-y-4">
            <div className="grid max-h-72 gap-2 overflow-y-auto rounded-lg border border-slate-700/80 bg-slate-950/20 p-3 md:grid-cols-2">
              {groupNodes.map((node) => (
                <label key={node.id} className="flex items-center gap-2 text-sm text-slate-200">
                  <input
                    type="checkbox"
                    name="member_node_ids"
                    value={node.id}
                    defaultChecked={selectedMemberIds.includes(node.id)}
                    className="rounded border-slate-600 bg-panel-soft"
                  />
                  <span className="truncate">{node.label}</span>
                </label>
              ))}
            </div>
            {groupNodes.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum firewall disponível para este cliente.</p>
            ) : null}
            <Button type="submit" disabled={pending || groupNodes.length === 0}>
              Salvar membros
            </Button>
          </form>
        </Card>
      ) : null}
    </div>
  );
}
