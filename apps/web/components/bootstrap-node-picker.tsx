'use client';

import { useId, useState } from 'react';

type Option = { id: string; display_name: string | null; hostname: string; node_uid: string; client: { name: string }; site: { name: string } };
const label = (node: Option) => `${node.display_name || node.hostname} — ${node.client.name} / ${node.site.name} — ${node.node_uid}`;
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function BootstrapNodePicker({ nodes, selectedId = '' }: { nodes: Option[]; selectedId?: string }) {
  const id = useId();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(selectedId);
  const matching = nodes.filter((node) => normalize(`${label(node)} ${node.hostname}`).includes(normalize(search.trim())));
  const options = nodes.filter((node) => matching.includes(node) || node.id === selected);
  return <div className="space-y-2">
    <label htmlFor={`${id}-search`} className="block text-sm text-fg">Buscar firewall nesta página</label>
    <input id={`${id}-search`} type="search" value={search} onChange={(event) => setSearch(event.target.value)} autoComplete="off" placeholder="Nome, cliente, local ou identificador" className="h-11 w-full rounded-lg border border-border bg-surface-soft px-3 text-sm text-fg" />
    <label htmlFor={`${id}-node`} className="block text-sm text-fg">Firewall para instalar</label>
    <select id={`${id}-node`} name="node_id" value={selected} onChange={(event) => setSelected(event.target.value)} required className="h-11 w-full rounded-lg border border-border bg-surface-soft px-3 text-sm text-fg">
      <option value="">Selecione um firewall</option>
      {options.map((node) => <option key={node.id} value={node.id}>{label(node)}</option>)}
    </select>
    <p className="text-xs text-fg-muted" role="status">{matching.length} correspondência(s) nesta página. A busca não troca a seleção. Use os filtros do inventário acima para procurar em toda a frota.</p>
  </div>;
}
