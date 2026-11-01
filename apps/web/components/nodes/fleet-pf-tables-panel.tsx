'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { requestTableEntryRemoveAction, requestTableListAction, requestTableSearchAction } from '@/lib/operational-actions-actions';
import { isBlockTable } from '@/lib/pf-block-tables';
import { interpretTableTarget, tableTargetInput } from '@/lib/table-ip';
import { fetchNodeCommandDetail } from '@/lib/node-commands-actions';
import { isAgentVersionAtLeast } from '@/lib/agent-version';
import { commandStatusLabel } from '@/components/nodes/node-command-progress';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type Node = { id: string; hostname: string; display_name: string | null; agent_version: string | null };
type BlockGroup = { table: string; entries: string[]; total: number; truncated: boolean };
type Job = {
  nodeId: string;
  hostname: string;
  commandId?: string;
  status: string;
  tables: string[];
  blocks?: BlockGroup[];
  error?: string;
};

function tableResult(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const tables = (value as Record<string, unknown>).tables;
  return Array.isArray(tables)
    ? tables.filter((item): item is string => typeof item === 'string' && isBlockTable(item))
    : [];
}

function blockResult(value: unknown): BlockGroup[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const blocks = (value as Record<string, unknown>).blocks;
  if (!Array.isArray(blocks)) return [];
  return blocks.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    if (typeof row.table !== 'string' || !isBlockTable(row.table)) return [];
    const entries = Array.isArray(row.entries) ? row.entries.filter((entry): entry is string => typeof entry === 'string') : [];
    return [{
      table: row.table,
      entries,
      total: typeof row.total === 'number' ? row.total : entries.length,
      truncated: row.truncated === true,
    }];
  });
}

function key(nodeId: string, table: string) {
  return `${nodeId}\u0000${table}`;
}

const NETWORK_PREFIXES = Array.from({ length: 32 }, (_, index) => 32 - index);
const FIELD_CLASS = 'h-11 rounded-lg border border-border bg-surface-soft px-3 text-sm text-fg';

export function FleetPfTablesPanel({ selectedNodes }: { selectedNodes: Node[] }) {
  // Trocar a seleção descarta também trabalhos e respostas da seleção anterior.
  return <FleetPfTablesQuery key={selectedNodes.map((node) => node.id).sort().join(',')} selectedNodes={selectedNodes} />;
}

function FleetPfTablesQuery({ selectedNodes }: { selectedNodes: Node[] }) {
  const [ip, setIp] = useState('');
  const [prefix, setPrefix] = useState(32);
  const [queriedIp, setQueriedIp] = useState('');
  const [queryPrefix, setQueryPrefix] = useState(32);
  const generation = useRef(0);
  const pollInFlight = useRef(false);
  const [querySelection, setQuerySelection] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [searches, setSearches] = useState<Job[]>([]);
  const [listings, setListings] = useState<Job[]>([]);
  const [removals, setRemovals] = useState<Job[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  const selectedIds = useMemo(() => new Set(selectedNodes.map((node) => node.id)), [selectedNodes]);
  const selectedSignature = [...selectedIds].sort().join(',');
  const unsupported = selectedNodes.filter((node) => !isAgentVersionAtLeast(node.agent_version, '0.5.23'));
  const listUnsupported = selectedNodes.filter((node) => !isAgentVersionAtLeast(node.agent_version, '0.5.25'));
  const networkUnsupported = [32, 128].includes(prefix) ? [] : selectedNodes.filter((node) => !isAgentVersionAtLeast(node.agent_version, '0.5.24'));
  const preview = ip.trim() ? interpretTableTarget(ip, prefix) : null;
  const matches = (querySelection === selectedSignature ? searches : []).flatMap((job) =>
    job.status === 'succeeded' && selectedIds.has(job.nodeId)
      ? job.tables.map((table) => ({ nodeId: job.nodeId, hostname: job.hostname, table }))
      : [],
  );
  const selectedMatches = matches.filter((match) => checked.has(key(match.nodeId, match.table)));
  const active = [...searches, ...listings, ...removals].some((job) => job.commandId && ['pending', 'picked_up', 'running'].includes(job.status));

  function invalidateTarget() {
    generation.current += 1;
    setBusy(false);
    setFormError('');
    setSearches([]);
    setRemovals([]);
    setChecked(new Set());
    setQueriedIp('');
    setConfirmation('');
  }

  useEffect(() => () => {
    generation.current += 1;
  }, []);

  const refresh = useCallback(async () => {
    if (pollInFlight.current) return;
    pollInFlight.current = true;
    const run = generation.current;
    try {
      const update = async (jobs: Job[]) => Promise.all(jobs.map(async (job) => {
        if (!job.commandId || !['pending', 'picked_up', 'running'].includes(job.status)) return job;
        try {
          const { command } = await fetchNodeCommandDetail(job.nodeId, job.commandId);
          const blocks = blockResult(command.result_json);
          return {
            ...job,
            status: command.status,
            tables: job.tables.length ? job.tables : tableResult(command.result_json),
            blocks: blocks.length ? blocks : job.blocks,
            error: command.error_message ?? undefined,
          };
        } catch {
          return job;
        }
      }));
      const [nextSearches, nextListings, nextRemovals] = await Promise.all([update(searches), update(listings), update(removals)]);
      if (run !== generation.current) return;
      setSearches(nextSearches);
      setListings(nextListings);
      setRemovals(nextRemovals);
    } finally {
      pollInFlight.current = false;
    }
  }, [searches, listings, removals]);

  useEffect(() => {
    if (!active || busy) return;
    const timer = setInterval(() => { void refresh(); }, 5000);
    return () => clearInterval(timer);
  }, [active, busy, refresh]);

  async function consult() {
    const targetIp = ip.trim();
    if (!targetIp || selectedNodes.length === 0 || selectedNodes.length > 20 || unsupported.length > 0 || networkUnsupported.length > 0 || busy) return;
    const interpreted = interpretTableTarget(targetIp, prefix);
    if ('error' in interpreted) {
      setFormError(interpreted.error);
      setSearches([]);
      setRemovals([]);
      setChecked(new Set());
      setQueriedIp('');
      return;
    }
    const run = ++generation.current;
    setBusy(true);
    setFormError('');
    setSearches([]);
    setRemovals([]);
    setChecked(new Set());
    setQueriedIp(interpreted.target);
    setQuerySelection(selectedSignature);
    setQueryPrefix(interpreted.prefix);
    setConfirmation('');
    const jobs: Job[] = [];
    for (const node of selectedNodes) {
      try {
        const result = await requestTableSearchAction(node.id, interpreted.target, interpreted.prefix);
        if (run !== generation.current) return;
        if (!result.ok) {
          if (result.code === 'invalid_ip') {
            setFormError(result.error);
            break;
          }
          jobs.push({ nodeId: node.id, hostname: node.display_name || node.hostname, status: 'failed', tables: [], error: result.error });
        } else {
          jobs.push({ nodeId: node.id, hostname: node.display_name || node.hostname, commandId: result.command_id, status: result.status, tables: [] });
        }
      } catch (cause) {
        jobs.push({ nodeId: node.id, hostname: node.display_name || node.hostname, status: 'failed', tables: [], error: cause instanceof Error ? cause.message : 'Falha ao solicitar consulta' });
      }
      if (run !== generation.current) return;
      setSearches([...jobs]);
    }
    setBusy(false);
  }

  async function listBlocks() {
    if (selectedNodes.length === 0 || selectedNodes.length > 20 || unsupported.length > 0 || listUnsupported.length > 0 || busy) return;
    const run = ++generation.current;
    setBusy(true);
    setFormError('');
    setListings([]);
    const jobs: Job[] = [];
    for (const node of selectedNodes) {
      try {
        const result = await requestTableListAction(node.id);
        if (run !== generation.current) return;
        if (!result.ok) {
          jobs.push({ nodeId: node.id, hostname: node.display_name || node.hostname, status: 'failed', tables: [], error: result.error });
        } else {
          jobs.push({ nodeId: node.id, hostname: node.display_name || node.hostname, commandId: result.command_id, status: result.status, tables: [] });
        }
      } catch (cause) {
        jobs.push({ nodeId: node.id, hostname: node.display_name || node.hostname, status: 'failed', tables: [], error: cause instanceof Error ? cause.message : 'Falha ao solicitar a lista' });
      }
      if (run !== generation.current) return;
      setListings([...jobs]);
    }
    setBusy(false);
  }

  function useListedEntry(entry: string) {
    invalidateTarget();
    const typed = tableTargetInput(entry.trim(), 32);
    setIp(typed.address);
    setPrefix(typed.prefix);
  }

  async function remove() {
    if (confirmation.trim() !== queriedIp || selectedMatches.length === 0 || busy || active || removals.length > 0 || !preview || !('target' in preview) || preview.target !== queriedIp || preview.prefix !== queryPrefix) return;
    const run = ++generation.current;
    setBusy(true);
    setFormError('');
    setRemovals([]);
    const jobs: Job[] = [];
    for (const match of selectedMatches) {
      try {
        const result = await requestTableEntryRemoveAction(match.nodeId, match.table, queriedIp, confirmation.trim(), queryPrefix);
        if (run !== generation.current) return;
        if (!result.ok) {
          jobs.push({ nodeId: match.nodeId, hostname: `${match.hostname} · ${match.table}`, status: 'failed', tables: [], error: result.error });
        } else {
          jobs.push({ nodeId: match.nodeId, hostname: `${match.hostname} · ${match.table}`, commandId: result.command_id, status: result.status, tables: [] });
        }
      } catch (cause) {
        jobs.push({ nodeId: match.nodeId, hostname: `${match.hostname} · ${match.table}`, status: 'failed', tables: [], error: cause instanceof Error ? cause.message : 'Falha ao solicitar remoção' });
      }
      if (run !== generation.current) return;
      setRemovals([...jobs]);
    }
    setConfirmation('');
    setBusy(false);
  }

  return (
    <Card className="space-y-3 p-4">
      <div>
        <h3 className="font-display text-base text-fg">Desbloquear IP nos firewalls selecionados</h3>
        <p className="text-sm text-fg-muted">Listar bloqueios mostra o conteúdo de webConfiguratorlockout, sshlockout, virusprot e snort2c. ips_liberados não entra. Clique num endereço para levá-lo ao campo e desbloquear. Listar exige o agente 0.5.25.</p>
      </div>
      {selectedNodes.length > 20 ? <Alert variant="warning">Selecione no máximo 20 firewalls por consulta.</Alert> : null}
      {unsupported.length > 0 ? <Alert variant="warning">Agente 0.5.23 ou superior necessário em: {unsupported.map((node) => node.display_name || node.hostname).join(', ')}.</Alert> : null}
      {networkUnsupported.length > 0 ? <Alert variant="warning">Agente 0.5.24 ou superior necessário para rede IPv4 com máscara menor que /32 em: {networkUnsupported.map((node) => node.display_name || node.hostname).join(', ')}.</Alert> : null}
      {listUnsupported.length > 0 ? <Alert variant="warning">Agente 0.5.25 ou superior necessário para listar bloqueios em: {listUnsupported.map((node) => node.display_name || node.hostname).join(', ')}.</Alert> : null}
      {formError ? <Alert variant="warning">{formError}</Alert> : null}
      {searches.length > 0 && querySelection !== selectedSignature ? <Alert variant="warning">A seleção de firewalls mudou. Consulte novamente antes de desbloquear.</Alert> : null}
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm text-fg">IP a desbloquear
          <span className="mt-1 flex items-center gap-1">
            <input className={`${FIELD_CLASS} w-44`} value={ip} onChange={(event) => { invalidateTarget(); const typed = tableTargetInput(event.target.value, prefix); setIp(typed.address); setPrefix(typed.prefix); }} placeholder="ex.: 203.0.113.10" />
            <select className={FIELD_CLASS} aria-label="Máscara da rede" value={prefix} onChange={(event) => { invalidateTarget(); setPrefix(Number(event.target.value)); }}>
              {[...NETWORK_PREFIXES, 128].map((item) => <option key={item} value={item}>/{item}</option>)}
            </select>
          </span>
        </label>
        <Button type="button" variant="secondary" disabled={busy || !ip.trim() || selectedNodes.length > 20 || unsupported.length > 0 || networkUnsupported.length > 0} onClick={() => { void consult(); }}>Consultar nos selecionados</Button>
        <Button type="button" variant="secondary" disabled={busy || selectedNodes.length === 0 || selectedNodes.length > 20 || unsupported.length > 0 || listUnsupported.length > 0} onClick={() => { void listBlocks(); }}>Listar bloqueios</Button>
      </div>
      {preview && 'target' in preview && ![32, 128].includes(prefix) ? <p className="text-sm text-fg-muted">A consulta usa a rede {preview.target}.</p> : null}
      {listings.length > 0 ? (
        <div className="space-y-2 text-sm">
          {listings.map((job) => <div key={`list-${job.nodeId}`} className="rounded-md border border-slate-700 p-2">
            <strong>{job.hostname}</strong>: {job.status === 'succeeded' ? (job.blocks?.length ? `${job.blocks.length} tabela(s) com bloqueio` : 'Nenhum bloqueio listado') : commandStatusLabel(job.status)}
            {job.error ? <span className="text-rose-300"> — {job.error}</span> : null}
            {job.blocks?.map((block) => <div key={block.table} className="mt-2">
              <p className="text-fg">{block.table}{block.truncated ? ` (${block.total} entradas, mostrando 80)` : ''}</p>
              <ul className="mt-1 space-y-1">
                {block.entries.map((entry) => <li key={entry}>
                  <button type="button" className="text-primary hover:underline" onClick={() => useListedEntry(entry)}>{entry}</button>
                </li>)}
              </ul>
            </div>)}
          </div>)}
        </div>
      ) : null}
      {searches.length > 0 ? (
        <div className="space-y-2 text-sm">
          {searches.map((job) => <div key={job.nodeId} className="rounded-md border border-slate-700 p-2">
            <strong>{job.hostname}</strong>: {job.status === 'succeeded' ? (job.tables.length ? `${job.tables.length} tabela(s) de bloqueio` : 'Nenhum bloqueio encontrado') : commandStatusLabel(job.status)}
            {job.error ? <span className="text-rose-300"> — {job.error}</span> : null}
            {job.tables.map((table) => <label key={table} className="mt-1 flex items-center gap-2">
              <input type="checkbox" checked={checked.has(key(job.nodeId, table))} onChange={() => setChecked((current) => { const next = new Set(current); const item = key(job.nodeId, table); if (next.has(item)) next.delete(item); else next.add(item); return next; })} />
              {table}
            </label>)}
          </div>)}
        </div>
      ) : null}
      {matches.length > 0 ? (
        <div className="space-y-2 border-t border-slate-700 pt-3">
          <p className="text-sm text-fg-muted">A remoção tira o IP da tabela de bloqueio em memória. ips_liberados fica de fora.</p>
          <label className="text-sm text-fg">Confirme digitando {queriedIp}
            <input className="mt-1 block rounded-md border border-slate-700 bg-slate-900 px-3 py-2" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
          </label>
          <Button type="button" variant="danger" disabled={busy || active || removals.length > 0 || selectedMatches.length === 0 || confirmation.trim() !== queriedIp} onClick={() => { void remove(); }}>Desbloquear {selectedMatches.length} entrada(s)</Button>
        </div>
      ) : null}
      {removals.length > 0 ? <div className="text-sm">{removals.map((job) => <p key={`${job.nodeId}:${job.hostname}`}>{job.hostname}: {commandStatusLabel(job.status)}{job.error ? ` — ${job.error}` : ''}</p>)}</div> : null}
    </Card>
  );
}
