'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ClientDeleteButton } from '@/components/client-delete-button';
import { Button } from '@/components/ui';
import { updateClientAction } from '@/lib/admin';
import {
  formInputCompactClassName,
  formSelectCompactClassName,
} from '@/lib/form-field-styles';
import { statusLabel } from '@/lib/rbac-labels';

const PAGE_SIZE = 10;

type ClientItem = {
  id: string;
  name: string;
  code: string;
  status: string;
  node_count: number;
};

export function AdminClientsList({
  clients,
  returnTo,
}: {
  clients: ClientItem[];
  returnTo: string;
}) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const visibleClients = clients.slice(0, visibleCount);
  const hasMore = visibleCount < clients.length;

  return (
    <div className="space-y-2">
      {visibleClients.map((client) => (
        <div
          key={client.id}
          className="rounded-lg border border-slate-700/80 bg-panel-soft/50 px-3 py-2"
        >
          <form
            action={updateClientAction}
            className="flex flex-wrap items-center gap-x-3 gap-y-2"
          >
            <input type="hidden" name="returnTo" value={returnTo} />
            <input type="hidden" name="client_id" value={client.id} />

            <label className="flex min-w-[10rem] flex-1 items-center gap-2 sm:max-w-[14rem]">
              <span className="w-10 shrink-0 text-xs font-medium text-slate-400">Nome</span>
              <input
                type="text"
                name="name"
                defaultValue={client.name}
                className={`${formInputCompactClassName} min-w-0 flex-1`}
              />
            </label>

            <label className="flex min-w-[8rem] items-center gap-2 sm:max-w-[11rem]">
              <span className="w-12 shrink-0 text-xs font-medium text-slate-400">Código</span>
              <input
                type="text"
                name="code"
                defaultValue={client.code}
                className={`${formInputCompactClassName} min-w-0 flex-1 font-mono uppercase`}
              />
            </label>

            <label className="flex items-center gap-2">
              <span className="shrink-0 text-xs font-medium text-slate-400">Status</span>
              <select
                name="status"
                defaultValue={client.status}
                className={`${formSelectCompactClassName} w-[7.5rem]`}
              >
                <option value="active">{statusLabel('active')}</option>
                <option value="inactive">{statusLabel('inactive')}</option>
              </select>
            </label>

            <p className="shrink-0 text-xs text-slate-500">
              {client.node_count} fw
              <Link
                href={`/nodes?client_id=${client.id}`}
                className="ml-1.5 text-cyan-400 hover:text-cyan-300"
              >
                Inventário
              </Link>
            </p>

            <div className="ml-auto flex shrink-0 items-center gap-2">
              <Button
                type="submit"
                variant="secondary"
                size="sm"
                className="border-cyan-500/30 bg-cyan-500/10 text-cyan-200"
              >
                Salvar
              </Button>
              {client.node_count === 0 ? (
                <ClientDeleteButton
                  clientId={client.id}
                  clientName={client.name}
                  returnTo={returnTo}
                  compact
                />
              ) : (
                <span
                  className="hidden text-xs text-slate-500 xl:inline"
                  title="Remova os firewalls antes de excluir o cliente."
                >
                  Sem exclusão (tem firewalls)
                </span>
              )}
            </div>
          </form>
        </div>
      ))}

      {hasMore ? (
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}>
            Mostrar mais ({clients.length - visibleCount} restantes)
          </Button>
          <p className="text-xs text-slate-500">
            Exibindo {visibleClients.length} de {clients.length} clientes.
          </p>
        </div>
      ) : null}
    </div>
  );
}
