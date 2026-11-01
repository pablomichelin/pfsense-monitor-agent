'use client';

import { useState } from 'react';
import { FleetTechnicianManagementPanel } from '@/components/nodes/fleet-technician-management-panel';
import { technicianBatchLimit } from '@/lib/technician-batch-limit';
import { Alert, Button } from '@/components/ui';

type NodeOption = { id: string; hostname: string; display_name: string | null; client: { name: string } };

export function AdminTechnicianTargets({ nodes, batchMaxSize, canManageTechnicians, canManageRegistry, canResetTechnicianPassword }: {
  nodes: NodeOption[];
  batchMaxSize: number;
  canManageTechnicians: boolean;
  canManageRegistry: boolean;
  canResetTechnicianPassword: boolean;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const limit = technicianBatchLimit(batchMaxSize);
  const visibleNodes = nodes.filter((node) => `${node.display_name ?? ''} ${node.hostname} ${node.client.name}`.toLowerCase().includes(search.trim().toLowerCase()));
  const selected = nodes.filter((node) => selectedIds.has(node.id));

  return <div className="space-y-4">
    <Alert variant={limit === null ? 'error' : 'info'}>
      {limit === null ? 'Limite do lote indisponível. Recarregue a página antes de selecionar alvos.' : `Selecione até ${limit} firewalls por ação. Nenhum comando é enviado ao selecionar. Alterar os alvos exige nova confirmação; resultados anteriores permanecem no painel.`}
    </Alert>
    <label className="block text-sm text-fg">Buscar firewall ou cliente
      <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-border bg-panel-soft px-3" />
    </label>
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm text-fg-muted">{selected.length}/{limit ?? '—'} selecionados</span>
      <Button type="button" variant="secondary" disabled={limit === null || visibleNodes.length === 0} onClick={() => {
        if (limit !== null) setSelectedIds(new Set(visibleNodes.slice(0, limit).map((node) => node.id)));
      }}>Selecionar primeiros {limit ?? '—'} exibidos</Button>
      <Button type="button" variant="ghost" onClick={() => setSelectedIds(new Set())}>Limpar seleção de alvos</Button>
    </div>
    <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border p-3" aria-label="Firewalls alvo do lote">
      {visibleNodes.map((node) => <label key={node.id} className="flex items-center gap-2 text-sm text-fg">
        <input type="checkbox" checked={selectedIds.has(node.id)} disabled={limit === null || (!selectedIds.has(node.id) && selected.length >= limit)} onChange={() => setSelectedIds((current) => {
          const next = new Set(current);
          if (next.has(node.id)) next.delete(node.id);
          else if (limit !== null && next.size < limit) next.add(node.id);
          return next;
        })} />
        {node.client.name} — {node.display_name || node.hostname}
      </label>)}
      {visibleNodes.length === 0 ? <p className="text-sm text-fg-muted">Nenhum firewall corresponde à busca.</p> : null}
    </div>
    <FleetTechnicianManagementPanel nodeIds={selected.map((node) => node.id)} mode="selection" allowFleetRevoke={false} totalVisibleCount={nodes.length} batchMaxSize={batchMaxSize} canManageTechnicians={canManageTechnicians} canManageRegistry={canManageRegistry} canResetTechnicianPassword={canResetTechnicianPassword} />
  </div>;
}
