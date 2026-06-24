'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ClientDeleteButton } from '@/components/client-delete-button';
import { Button } from '@/components/ui';
import { updateClientAction } from '@/lib/admin';
import { formInputClassName, formSelectClassName } from '@/lib/form-field-styles';
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
    <div className="space-y-4">
      {visibleClients.map((client) => {
        const formId = `client-form-${client.id}`;

        return (
          <div
            key={client.id}
            className="rounded-xl border border-slate-700/80 bg-panel-soft/50 p-4"
          >
            <form id={formId} action={updateClientAction}>
              <input type="hidden" name="returnTo" value={returnTo} />
              <input type="hidden" name="client_id" value={client.id} />
              <div className="grid gap-3 md:grid-cols-3">
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-300">Nome</span>
                  <input
                    type="text"
                    name="name"
                    defaultValue={client.name}
                    className={`${formInputClassName} w-full`}
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-300">Código</span>
                  <input
                    type="text"
                    name="code"
                    defaultValue={client.code}
                    className={`${formInputClassName} w-full`}
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-300">Status</span>
                  <select
                    name="status"
                    defaultValue={client.status}
                    className={`${formSelectClassName} w-full`}
                  >
                    <option value="active">{statusLabel('active')}</option>
                    <option value="inactive">{statusLabel('inactive')}</option>
                  </select>
                </label>
              </div>
            </form>
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
                <Button
                  type="submit"
                  form={formId}
                  variant="secondary"
                  className="border-cyan-500/30 bg-cyan-500/10 text-cyan-200"
                >
                  Salvar cliente
                </Button>
                {client.node_count === 0 ? (
                  <ClientDeleteButton
                    clientId={client.id}
                    clientName={client.name}
                    returnTo={returnTo}
                  />
                ) : (
                  <span className="text-xs text-slate-500">
                    Remova os firewalls antes de excluir o cliente.
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {hasMore ? (
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}>
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
