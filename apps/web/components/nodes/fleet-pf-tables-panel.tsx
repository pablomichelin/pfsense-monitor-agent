'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { requestTableEntryRemoveAction, requestTableSearchAction } from '@/lib/operational-actions-actions';
import { fetchNodeCommandDetail } from '@/lib/node-commands-actions';
import { isAgentVersionAtLeast } from '@/lib/agent-version';
import { commandStatusLabel } from '@/components/nodes/node-command-progress';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type Node = { id: string; hostname: string; display_name: string | null; agent_version: string | null };
type Job = {
  nodeId: string;
  hostname: string;
  commandId?: string;
  status: string;
  tables: string[];
  error?: string;
};

function tableResult(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const tables = (value as Record<string, unknown>).tables;
  return Array.isArray(tables) ? tables.filter((item): item is string => typeof item === 'string') : [];
}

function key(nodeId: string, table: string) {
  return `${nodeId}\u0000${table}`;
}

export function FleetPfTablesPanel({ selectedNodes }: { selectedNodes: Node[] }) {
  const [ip, setIp] = useState('');
  const [queriedIp, setQueriedIp] = useState('');
  const [querySelection, setQuerySelection] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [searches, setSearches] = useState<Job[]>([]);
  const [removals, setRemovals] = useState<Job[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const selectedIds = useMemo(() => new Set(selectedNodes.map((node) => node.id)), [selectedNodes]);
  const selectedSignature = [...selectedIds].sort().join(',');
  const unsupported = selectedNodes.filter((node) => !isAgentVersionAtLeast(node.agent_version, '0.5.23'));
  const matches = (querySelection === selectedSignature ? searches : []).flatMap((job) =>
    job.status === 'succeeded' && selectedIds.has(job.nodeId)
      ? job.tables.map((table) => ({ nodeId: job.nodeId, hostname: job.hostname, table }))
      : [],
  );
  const selectedMatches = matches.filter((match) => checked.has(key(match.nodeId, match.table)));
  const active = [...searches, ...removals].some((job) => job.commandId && ['pending', 'picked_up', 'running'].includes(job.status));

  const refresh = useCallback(async () => {
    const update = async (jobs: Job[]) => Promise.all(jobs.map(async (job) => {
      if (!job.commandId || !['pending', 'picked_up', 'running'].includes(job.status)) return job;
      try {
        const { command } = await fetchNodeCommandDetail(job.nodeId, job.commandId);
        return {
          ...job,
          status: command.status,
          tables: job.tables.length ? job.tables : tableResult(command.result_json),
          error: command.error_message ?? undefined,
        };
      } catch {
        return job;
      }
    }));
    const [nextSearches, nextRemovals] = await Promise.all([update(searches), update(removals)]);
    setSearches(nextSearches);
    setRemovals(nextRemovals);
  }, [searches, removals]);

  useEffect(() => {
    if (!active || busy) return;
    const timer = setInterval(() => { void refresh(); }, 5000);
    return () => clearInterval(timer);
  }, [active, busy, refresh]);

  async function consult() {
    const targetIp = ip.trim();
    if (!targetIp || selectedNodes.length === 0 || selectedNodes.length > 20 || unsupported.length > 0) return;
    setBusy(true);
    setSearches([]);
    setRemovals([]);
    setChecked(new Set());
    setQueriedIp(targetIp);
    setQuerySelection(selectedSignature);
    const jobs: Job[] = [];
    for (const node of selectedNodes) {
      try {
        const result = await requestTableSearchAction(node.id, targetIp);
        jobs.push({ nodeId: node.id, hostname: node.display_name || node.hostname, commandId: result.command_id, status: result.status, tables: [] });
      } catch (cause) {
        jobs.push({ nodeId: node.id, hostname: node.display_name || node.hostname, status: 'failed', tables: [], error: cause instanceof Error ? cause.message : 'Falha ao solicitar consulta' });
      }
      setSearches([...jobs]);
    }
    setBusy(false);
  }

  async function remove() {
    if (confirmation.trim() !== queriedIp || selectedMatches.length === 0 || busy) return;
    setBusy(true);
    setRemovals([]);
    const jobs: Job[] = [];
    for (const match of selectedMatches) {
      try {
        const result = await requestTableEntryRemoveAction(match.nodeId, match.table, queriedIp, confirmation.trim());
        jobs.push({ nodeId: match.nodeId, hostname: `${match.hostname} · ${match.table}`, commandId: result.command_id, status: result.status, tables: [] });
      } catch (cause) {
        jobs.push({ nodeId: match.nodeId, hostname: `${match.hostname} · ${match.table}`, status: 'failed', tables: [], error: cause instanceof Error ? cause.message : 'Falha ao solicitar remoção' });
      }
      setRemovals([...jobs]);
    }
    setConfirmation('');
    setBusy(false);
  }

  return (
    <Card className="space-y-3 p-4">
      <div>
        <h3 className="font-display text-base text-fg">Desbloquear IP nos firewalls selecionados</h3>
        <p className="text-sm text-fg-muted">Consulte o IP, confira as tabelas encontradas e marque as entradas a remover. O agente 0.5.23 ou superior é necessário.</p>
      </div>
      {selectedNodes.length > 20 ? <Alert variant="warning">Selecione no máximo 20 firewalls por consulta.</Alert> : null}
      {unsupported.length > 0 ? <Alert variant="warning">Agente 0.5.23 ou superior necessário em: {unsupported.map((node) => node.display_name || node.hostname).join(', ')}.</Alert> : null}
      {searches.length > 0 && querySelection !== selectedSignature ? <Alert variant="warning">A seleção de firewalls mudou. Consulte novamente antes de desbloquear.</Alert> : null}
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm text-fg">IP a desbloquear
          <input className="mt-1 block rounded-md border border-slate-700 bg-slate-900 px-3 py-2" value={ip} onChange={(event) => { setIp(event.target.value); setSearches([]); setRemovals([]); setChecked(new Set()); setQueriedIp(''); }} placeholder="ex.: 203.0.113.10" />
        </label>
        <Button type="button" variant="secondary" disabled={busy || !ip.trim() || selectedNodes.length > 20 || unsupported.length > 0} onClick={() => { void consult(); }}>Consultar nos selecionados</Button>
      </div>
      {searches.length > 0 ? (
        <div className="space-y-2 text-sm">
          {searches.map((job) => <div key={job.nodeId} className="rounded-md border border-slate-700 p-2">
            <strong>{job.hostname}</strong>: {job.status === 'succeeded' ? (job.tables.length ? `${job.tables.length} tabela(s)` : 'IP não encontrado') : commandStatusLabel(job.status)}
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
          <p className="text-sm text-fg-muted">Entradas de aliases ou arquivos podem reaparecer após recarga do filtro. Confira a origem antes de marcar.</p>
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
