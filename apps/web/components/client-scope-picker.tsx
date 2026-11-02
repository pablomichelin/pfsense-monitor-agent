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
  onSelectionChange?: () => void;
};

export function ClientScopePicker({
  clients,
  selectedIds,
  fieldName = 'client_ids',
  title = 'Clientes permitidos',
  onSelectionChange,
}: ClientScopePickerProps) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(selectedIds));

  const sortedClients = useMemo(
    () =>
      [...clients].sort((a, b) =>
        a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }),
      ),
    [clients],
  );
  const activeIds = useMemo(() => new Set(clients.map((client) => client.id)), [clients]);
  const unavailableIds = Array.from(selected).filter((id) => !activeIds.has(id));

  const toggleClient = (clientId: string, checked: boolean) => {
    onSelectionChange?.();
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
    onSelectionChange?.();
    // Preservar vínculos históricos até que sua remoção seja explícita.
    setSelected((current) => new Set([
      ...Array.from(current).filter((id) => !activeIds.has(id)),
      ...sortedClients.map((client) => client.id),
    ]));
  };

  const clearSelection = () => {
    onSelectionChange?.();
    setSelected(new Set());
  };

  return (
    <div className="w-full flex-[1_1_100%] rounded-lg border border-slate-700/80 bg-slate-950/30 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-400">
          {title}{' '}
          <span className="text-slate-500">
            ({selected.size} selecionados)
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
            Remover seleção
          </button>
        </div>
      </div>

      {clients.length === 0 ? <p className="text-sm text-fg-muted">Nenhum cliente ativo disponível para novo vínculo.</p> : null}
      {unavailableIds.length > 0 ? (
        <div role="status" className="mb-3 space-y-2 rounded-lg border border-warning-border bg-warning-muted p-3 text-xs text-warning-fg">
          <p>{unavailableIds.length} vínculo(s) histórico(s) indisponível(is). Serão preservados ao editar identidade. Selecionar todos mantém esses vínculos; remova somente se quiser alterar o acesso.</p>
          {unavailableIds.map((id) => (
            <label key={id} className="flex items-center gap-2">
              <input type="checkbox" checked={selected.has(id)} onChange={() => toggleClient(id, false)} />
              Vínculo histórico preservado ({id}) — desmarque para remover
            </label>
          ))}
        </div>
      ) : null}
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
