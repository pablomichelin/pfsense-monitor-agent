'use client';

import { useMemo, useState } from 'react';

export type ClientScopeOption = {
  id: string;
  name: string;
  code: string;
};

type ClientScopePickerProps = {
  clients: ClientScopeOption[];
  selectedIds: string[];
  fieldName?: string;
  title?: string;
};

export function ClientScopePicker({
  clients,
  selectedIds,
  fieldName = 'client_ids',
  title = 'Clientes permitidos',
}: ClientScopePickerProps) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(selectedIds));

  const sortedClients = useMemo(
    () =>
      [...clients].sort((a, b) =>
        a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }),
      ),
    [clients],
  );

  const toggleClient = (clientId: string, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(clientId);
      } else {
        next.delete(clientId);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(sortedClients.map((client) => client.id)));
  };

  const clearSelection = () => {
    setSelected(new Set());
  };

  if (clients.length === 0) {
    return (
      <p className="w-full text-xs text-slate-500">
        Nenhum cliente ativo disponivel para escopo.
      </p>
    );
  }

  return (
    <div className="w-full flex-[1_1_100%] rounded-lg border border-slate-700/80 bg-slate-950/30 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-400">
          {title}{' '}
          <span className="text-slate-500">
            ({selected.size}/{sortedClients.length})
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={selectAll}
            className="rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-xs text-cyan-200 hover:bg-cyan-500/20"
          >
            Selecionar todos
          </button>
          <button
            type="button"
            onClick={clearSelection}
            className="rounded border border-slate-600/80 bg-panel-soft px-2 py-1 text-xs text-slate-300 hover:border-slate-500"
          >
            Remover selecao
          </button>
        </div>
      </div>

      <div className="client-scope-scroll rounded-lg border border-slate-800/80 bg-slate-950/40 p-2">
        <div className="client-scope-grid">
          {sortedClients.map((client) => {
            const checked = selected.has(client.id);
            return (
              <label
                key={client.id}
                className={`client-scope-item ${checked ? 'client-scope-item--selected' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => toggleClient(client.id, event.target.checked)}
                  aria-label={`Selecionar ${client.name}`}
                  className="shrink-0 rounded border-slate-600"
                />
                <span className="client-scope-name" title={client.name}>
                  {client.name}
                </span>
                <span className="client-scope-code" title={client.code}>
                  - {client.code}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {Array.from(selected).map((clientId) => (
        <input key={clientId} type="hidden" name={fieldName} value={clientId} />
      ))}
    </div>
  );
}
