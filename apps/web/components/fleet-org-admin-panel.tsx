'use client';

import Link from 'next/link';
import { GroupMemberPicker } from './group-member-picker';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Alert, Button, Card } from '@/components/ui';
import {
  createGroupAction,
  createTagAction,
  deleteGroupAction,
  deleteTagAction,
} from '@/lib/fleet-org-actions';
import type { FleetGroupItem, FleetTagItem } from '@/lib/api';

type ClientOption = {
  id: string;
  name: string;
};

type Props = {
  tags: FleetTagItem[];
  groups: FleetGroupItem[];
  clients: ClientOption[];
  selectedGroupId?: string;
  groupMemberIds: string[] | null;
  groupMembershipRevision?: string;
  canManageTags: boolean;
  canManageGroups: boolean;
  canEditGroupMembers: boolean;
};

function DeleteFleetItemButton({ item, kind, disabled, onDeleted }: {
  item: { id: string; name: string };
  kind: 'tag' | 'group';
  disabled: boolean;
  onDeleted: (alreadyRemoved: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isTag = kind === 'tag';

  async function confirm() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const remove = isTag ? deleteTagAction : deleteGroupAction;
      const result = await remove(item.id);
      if (!result.ok && result.status !== 404) {
        setError(result.error);
        return;
      }
      setOpen(false);
      onDeleted(!result.ok);
    } catch {
      setError('Não foi possível concluir a exclusão. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => {
        setError(null);
        setOpen(true);
      }}>
        Excluir
      </Button>
      <ConfirmDialog
        open={open}
        title={isTag ? 'Excluir tag' : 'Excluir grupo'}
        confirmLabel="Excluir"
        loading={loading}
        onCancel={() => { if (!loading) setOpen(false); }}
        onConfirm={confirm}
        description={(
          <>
            {isTag ? `Remover a tag "${item.name}"? Associações nos firewalls serão removidas.` : `Remover o grupo "${item.name}"?`}
            {error ? <Alert variant="error" className="mt-3">{error}</Alert> : null}
          </>
        )}
      />
    </>
  );
}

export function FleetOrgAdminPanel({
  tags,
  groups,
  clients,
  selectedGroupId,
  groupMemberIds,
  groupMembershipRevision,
  canManageTags,
  canManageGroups,
  canEditGroupMembers,
}: Props) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const selectedGroup = groups.find((group) => group.id === selectedGroupId) ?? null;

  function refreshAfterDelete(alreadyRemoved: boolean, groupId?: string) {
    const current = new URL(window.location.href);
    if (current.pathname !== '/admin/grupos') return;
    setError(null);
    setMessage(alreadyRemoved ? 'O item já foi removido.' : null);
    if (groupId && current.searchParams.get('group') === groupId) {
      current.searchParams.delete('group');
      router.replace(current.pathname + current.search + current.hash, { scroll: false });
      return;
    }
    router.refresh();
  }

  async function handleCreate(
    event: FormEvent<HTMLFormElement>,
    run: typeof createTagAction,
    success: string,
  ) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const result = await run(data);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      form.reset();
      setMessage(success);
      router.refresh();
    } catch {
      setError('Não foi possível concluir o cadastro. Tente novamente.');
    } finally {
      setPending(false);
    }
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

          {canManageTags && clients.length > 0 ? (
            <form onSubmit={(event) => handleCreate(event, createTagAction, 'Tag criada.')} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <select
                name="client_id"
                aria-label="Cliente da tag"
                required
                disabled={pending}
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
                aria-label="Nome da tag"
                required
                disabled={pending}
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
                        <DeleteFleetItemButton
                          item={tag}
                          kind="tag"
                          disabled={pending}
                          onDeleted={refreshAfterDelete}
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

          {canManageGroups && clients.length > 0 ? (
            <form onSubmit={(event) => handleCreate(event, createGroupAction, 'Grupo criado.')} className="grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <select
                  name="client_id"
                  aria-label="Cliente do grupo"
                  required
                  disabled={pending}
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
                  aria-label="Nome do grupo"
                  required
                  disabled={pending}
                  placeholder="Nome do grupo"
                  className="h-11 rounded-lg border border-slate-600/80 bg-panel-soft px-3 text-sm text-slate-100"
                />
              </div>
              <input
                name="description"
                aria-label="Descrição opcional do grupo"
                disabled={pending}
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
                      {canEditGroupMembers ? (
                        <Link
                          href={`/admin/grupos?group=${encodeURIComponent(group.id)}`}
                          prefetch={false}
                          aria-current={group.id === selectedGroupId ? 'page' : undefined}
                          className="text-left hover:text-cyan-200"
                        >
                          {group.name}
                        </Link>
                      ) : group.name}
                    </td>
                    <td className="px-3 py-2">{group.client_name}</td>
                    <td className="px-3 py-2">{group.member_count}</td>
                    {canManageGroups ? (
                      <td className="px-3 py-2">
                        <DeleteFleetItemButton
                          item={group}
                          kind="group"
                          disabled={pending}
                          onDeleted={(alreadyRemoved) => refreshAfterDelete(alreadyRemoved, group.id)}
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

      {canEditGroupMembers && selectedGroup ? (
        <Card className="space-y-4 p-6">
          <div>
            <h3 className="font-display text-lg text-fg">
              Membros — {selectedGroup.name}
            </h3>
            <p className="mt-1 text-sm text-slate-400">
              Cliente {selectedGroup.client_name}. Apenas firewalls deste cliente podem integrar o grupo.
            </p>
          </div>

          {groupMemberIds === null ? (
            <div className="space-y-2">
              <Alert variant="warning">Não foi possível consultar os membros deste grupo.</Alert>
              <Button type="button" variant="secondary" size="sm" onClick={() => router.refresh()}>
                Tentar novamente
              </Button>
            </div>
          ) : (
            <GroupMemberPicker
              key={`${selectedGroup.id}:${groupMembershipRevision ?? JSON.stringify(groupMemberIds)}`}
              groupId={selectedGroup.id}
              clientId={selectedGroup.client_id}
              memberIds={groupMemberIds}
              membershipRevision={groupMembershipRevision}
            />
          )}
        </Card>
      ) : null}
    </div>
  );
}
