'use client';

import { NodeBrowserControls } from '@/components/node-browser-controls';
import { usePagedNodes } from '@/lib/use-paged-nodes';
import type { NodesListResponse } from '@/lib/api';
import { useState } from 'react';
import { FleetTechnicianManagementPanel } from '@/components/nodes/fleet-technician-management-panel';
import { technicianBatchLimit } from '@/lib/technician-batch-limit';
import { Alert, Button } from '@/components/ui';

type NodeOption = { id: string; hostname: string; display_name: string | null; client: { name: string } };

export function AdminTechnicianTargets({ nodes, initialPage, batchMaxSize, canManageTechnicians, canManageRegistry, canResetTechnicianPassword }: {
  nodes: NodeOption[];
  initialPage?: NodesListResponse;
  batchMaxSize: number;
  canManageTechnicians: boolean;
  canManageRegistry: boolean;
  canResetTechnicianPassword: boolean;
}) {
  // Keep only explicitly selected targets (at most batchMaxSize), across pages.
  const [selectedNodes, setSelectedNodes] = useState<Map<string, NodeOption>>(new Map());
  const browser = usePagedNodes(initialPage);
  const limit = technicianBatchLimit(batchMaxSize);
  const visibleNodes = browser.result?.items ?? (browser.loading ? nodes : []);
  const selected = [...selectedNodes.values()];

  return <div className="space-y-4">
    <Alert variant={limit === null ? 'error' : 'info'}>
      {limit === null ? 'Limite do lote indisponível. Recarregue a página antes de selecionar alvos.' : `Selecione até ${limit} firewalls por ação. Nenhum comando é enviado ao selecionar. Alterar os alvos exige nova confirmação; resultados anteriores permanecem no painel.`}
    </Alert>
    <NodeBrowserControls browser={browser} />
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm text-fg-muted">{selected.length}/{limit ?? '—'} selecionados</span>
      <Button type="button" variant="secondary" disabled={browser.loading || limit === null || visibleNodes.length === 0} onClick={() => {
        if (limit !== null) setSelectedNodes(new Map(visibleNodes.slice(0, limit).map((node) => [node.id, node])));
      }}>Selecionar primeiros {limit ?? '—'} exibidos</Button>
      <Button type="button" variant="ghost" onClick={() => setSelectedNodes(new Map())}>Limpar seleção de alvos</Button>
    </div>
    <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border p-3" aria-label="Firewalls alvo do lote">
      {visibleNodes.map((node) => <label key={node.id} className="flex items-center gap-2 text-sm text-fg">
        <input type="checkbox" checked={selectedNodes.has(node.id)} disabled={browser.loading || limit === null || (!selectedNodes.has(node.id) && selected.length >= limit)} onChange={() => setSelectedNodes((current) => {
          const next = new Map(current);
          if (next.has(node.id)) next.delete(node.id);
          else if (limit !== null && next.size < limit) next.set(node.id, node);
          return next;
        })} />
        {node.client.name} — {node.display_name || node.hostname}
      </label>)}
      {visibleNodes.length === 0 ? <p className="text-sm text-fg-muted">Nenhum firewall corresponde à busca.</p> : null}
    </div>
    {selected.length > 0 ? <div className="text-sm text-fg-muted" aria-label="Alvos selecionados">{selected.map((node) => <button key={node.id} type="button" className="m-1 rounded border border-border px-2 py-1" onClick={() => setSelectedNodes((current) => { const next = new Map(current); next.delete(node.id); return next; })}>{node.client.name} — {node.display_name || node.hostname} ×</button>)}</div> : null}
    <FleetTechnicianManagementPanel nodeIds={selected.map((node) => node.id)} mode="selection" allowFleetRevoke={false} totalVisibleCount={browser.result?.total ?? nodes.length} batchMaxSize={batchMaxSize} canManageTechnicians={canManageTechnicians} canManageRegistry={canManageRegistry} canResetTechnicianPassword={canResetTechnicianPassword} />
  </div>;
}
