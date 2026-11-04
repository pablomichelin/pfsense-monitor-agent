'use client';

import { useEffect, useRef, useState } from 'react';
import { requestTableEntryRemoveAction, requestTableListAction, requestTableSearchAction, type TableActionResult } from '@/lib/operational-actions-actions';
import { isBlockTable, isAutomaticBlockTable } from '@/lib/pf-block-tables';
import { interpretTableTarget, tableTargetInput, type TableTarget } from '@/lib/table-ip';
import { fetchNodeCommandDetail } from '@/lib/node-commands-actions';
import { isAgentVersionAtLeast } from '@/lib/agent-version';
import { commandStatusLabel } from '@/components/nodes/node-command-progress';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type Node = { id: string; hostname: string; display_name: string | null; agent_version: string | null };
type InputRow = { id: number; address: string; prefix: number };
type BlockGroup = { table: string; entries: string[]; total: number; truncated: boolean };
type Job = {
  id: string;
  nodeId: string;
  hostname: string;
  target?: TableTarget;
  table?: string;
  phase: 'search' | 'remove' | 'list';
  status: string;
  tables: string[];
  blocks?: BlockGroup[];
  error?: string;
  notice?: string;
};
type Match = { node: Node; target: TableTarget; table: string };
const ACTIVE_STATUSES = ['pending', 'picked_up', 'running'];
const PREFIXES = [...Array.from({ length: 32 }, (_, index) => 32 - index), 128];
const FIELD_CLASS = 'h-11 rounded-lg border border-border bg-surface-soft px-3 text-sm text-fg';

function matchKey(match: Match) {
  return JSON.stringify([match.node.id, match.target.target, match.table]);
}

function readTables(value: unknown): string[] {
  if (!value || typeof value !== 'object') throw new Error('O firewall retornou uma consulta sem resultado.');
  const tables = (value as Record<string, unknown>).tables;
  if (!Array.isArray(tables) || tables.some((table) => typeof table !== 'string')) {
    throw new Error('O firewall retornou uma consulta incompleta. Consulte novamente.');
  }
  return [...new Set(tables.filter(isBlockTable))];
}

function readBlocks(value: unknown): BlockGroup[] {
  const blocks = value && typeof value === 'object' ? (value as Record<string, unknown>).blocks : null;
  if (!Array.isArray(blocks)) throw new Error('O firewall retornou uma listagem incompleta.');
  return blocks.flatMap((value) => {
    if (!value || typeof value !== 'object') throw new Error('Tabela inválida na resposta do firewall.');
    const row = value as Record<string, unknown>;
    if (typeof row.table !== 'string' || !Array.isArray(row.entries) || row.entries.some((entry) => typeof entry !== 'string')) {
      throw new Error('Tabela incompleta na resposta do firewall.');
    }
    if (!isBlockTable(row.table)) return [];
    return [{ table: row.table, entries: row.entries as string[], total: typeof row.total === 'number' ? row.total : row.entries.length, truncated: row.truncated === true }];
  });
}

export function FleetPfTablesPanel({ selectedNodes }: { selectedNodes: Node[] }) {
  return <FleetPfTablesQuery key={selectedNodes.map((node) => node.id).sort().join(',')} selectedNodes={selectedNodes} />;
}

function FleetPfTablesQuery({ selectedNodes }: { selectedNodes: Node[] }) {
  const [rows, setRows] = useState<InputRow[]>([{ id: 1, address: '', prefix: 32 }]);
  const nextRow = useRef(2);
  const generation = useRef(0);
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [review, setReview] = useState<'automatic' | 'selected' | null>(null);

  useEffect(() => () => { generation.current += 1; }, []);

  const parsed = rows.map((row) => interpretTableTarget(row.address, row.prefix));
  const targets = parsed.filter((value): value is TableTarget => 'target' in value);
  const uniqueTargets = [...new Map(targets.map((target) => [target.target, target])).values()];
  const valid = parsed.every((target) => 'target' in target);
  const unsupported = selectedNodes.filter((node) => !isAgentVersionAtLeast(node.agent_version, '0.5.23'));
  const networkUnsupported = uniqueTargets.some((target) => ![32, 128].includes(target.prefix))
    && selectedNodes.some((node) => !isAgentVersionAtLeast(node.agent_version, '0.5.24'));
  const listUnsupported = selectedNodes.some((node) => !isAgentVersionAtLeast(node.agent_version, '0.5.25'));
  const selectionInvalid = selectedNodes.length === 0 || selectedNodes.length > 20 || unsupported.length > 0;
  const matches: Match[] = jobs.flatMap((job) => {
    const node = selectedNodes.find((node) => node.id === job.nodeId);
    return job.phase === 'search' && job.status === 'succeeded' && job.target && node
      ? job.tables.map((table) => ({ node, target: job.target!, table })) : [];
  });
  const selectedMatches = matches.filter((match) => checked.has(matchKey(match)));

  function invalidate() {
    generation.current += 1;
    setJobs((current) => current.filter((job) => job.phase === 'list'));
    setChecked(new Set());
    setReview(null);
  }

  function editRow(id: number, address: string, prefix: number) {
    if (running.current) return;
    invalidate();
    const typed = tableTargetInput(address, prefix);
    setRows((current) => current.map((row) => row.id === id ? { id, ...typed } : row));
  }

  function addRow(address = '', prefix = 32) {
    if (running.current || rows.length >= 20) return;
    invalidate();
    const row = { id: nextRow.current++, ...tableTargetInput(address, prefix) };
    setRows((current) => address.trim() && current.length === 1 && !current[0].address.trim() ? [{ ...row, id: current[0].id }] : [...current, row]);
  }

  function updateJob(run: number, job: Job) {
    if (run !== generation.current) return;
    setJobs((current) => [...current.filter((entry) => entry.id !== job.id), job]);
  }

  async function execute(run: number, job: Job, request: () => Promise<TableActionResult>) {
    if (run !== generation.current) return null;
    updateJob(run, job);
    let awaitingConfirmation = false;
    try {
      const response = await request();
      if (run !== generation.current) return null;
      if (!response.ok) throw new Error(response.error);
      awaitingConfirmation = true;
      const deadline = Date.now() + 180_000;
      // Requests on the same firewall are completed sequentially to respect its command limit.
      while (run === generation.current) {
        const { command } = await fetchNodeCommandDetail(job.nodeId, response.command_id);
        if (run !== generation.current) return null;
        updateJob(run, { ...job, status: command.status });
        if (!ACTIVE_STATUSES.includes(command.status)) {
          awaitingConfirmation = false;
          if (command.status !== 'succeeded') throw new Error(command.error_message || `Comando ${commandStatusLabel(command.status)}.`);
          const data = command.result_json;
          if (!data || typeof data !== 'object' || (data as Record<string, unknown>).ok !== true) {
            throw new Error('O firewall não confirmou o resultado da operação.');
          }
          return data;
        }
        if (Date.now() >= deadline) throw new Error('Sem confirmação após três minutos. Confira o histórico de comandos antes de tentar novamente.');
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    } catch (cause) {
      updateJob(run, { ...job, status: awaitingConfirmation ? 'unconfirmed' : 'failed', error: cause instanceof Error ? cause.message : 'Falha ao executar a operação.' });
    }
    return null;
  }

  function newJob(node: Node, phase: Job['phase'], target?: TableTarget, table?: string): Job {
    return { id: JSON.stringify([node.id, phase, target?.target, table]), nodeId: node.id, hostname: node.display_name || node.hostname, phase, target, table, status: 'pending', tables: [] };
  }

  async function removeMatch(run: number, match: Match) {
    const { node, target, table } = match;
    const job = newJob(node, 'remove', target, table);
    const data = await execute(run, job, () => requestTableEntryRemoveAction(node.id, table, target.target, target.target, target.prefix));
    if (data) updateJob(run, { ...job, status: 'succeeded', notice: 'Desbloqueio confirmado pelo firewall.' });
  }

  async function searchTarget(run: number, node: Node, target: TableTarget, unlock: boolean) {
    const job = newJob(node, 'search', target);
    const data = await execute(run, job, () => requestTableSearchAction(node.id, target.target, target.prefix));
    if (!data || run !== generation.current) return;
    try {
      const tables = readTables(data);
      const automatic = tables.filter(isAutomaticBlockTable);
      updateJob(run, { ...job, status: 'succeeded', tables, notice: automatic.length ? undefined : 'Sem bloqueio nas tabelas de proteção consultadas.' });
      if (unlock) {
        for (const table of automatic) {
          if (run !== generation.current) return;
          await removeMatch(run, { node, target, table });
        }
      }
    } catch (cause) {
      updateJob(run, { ...job, status: 'failed', error: cause instanceof Error ? cause.message : 'Resposta inválida.' });
    }
  }

  async function perform(action: 'consult' | 'unlock' | 'list' | 'selected') {
    if (running.current || selectionInvalid || (action !== 'list' && (!valid || networkUnsupported))) return;
    if (action === 'list' && listUnsupported) return;
    const run = ++generation.current;
    running.current = true;
    setBusy(true);
    setReview(null);
    if (action !== 'selected') { setJobs([]); setChecked(new Set()); }
    try {
      await Promise.all(selectedNodes.map(async (node) => {
        if (action === 'selected') {
          for (const match of selectedMatches.filter((match) => match.node.id === node.id)) await removeMatch(run, match);
        } else if (action === 'list') {
          const job = newJob(node, 'list');
          const data = await execute(run, job, () => requestTableListAction(node.id));
          if (data) {
            try { updateJob(run, { ...job, status: 'succeeded', blocks: readBlocks(data) }); }
            catch (cause) { updateJob(run, { ...job, status: 'failed', error: cause instanceof Error ? cause.message : 'Resposta inválida.' }); }
          }
        } else {
          for (const target of uniqueTargets) {
            if (run !== generation.current) return;
            await searchTarget(run, node, target, action === 'unlock');
          }
        }
      }));
    } finally {
      if (run === generation.current) { running.current = false; setBusy(false); }
    }
  }

  return (
    <Card className="space-y-4 p-4">
      <div>
        <h3 className="font-display text-base text-fg">Desbloquear IPs nos firewalls selecionados</h3>
        <p className="text-sm text-fg-muted">Adicione os endereços e clique em Desbloquear IPs. A ação consulta cada firewall e remove os bloqueios encontrados nas tabelas de proteção de acesso e IDS/IPS.</p>
        <p className="mt-1 text-sm text-fg-muted">{selectedNodes.length} firewall(s) selecionado(s) · Até 20 IPs por operação.</p>
      </div>
      {selectionInvalid ? <Alert variant="warning">Selecione de 1 a 20 firewalls com agente 0.5.23 ou superior.</Alert> : null}
      {networkUnsupported ? <Alert variant="warning">Para desbloquear redes IPv4, os firewalls precisam do agente 0.5.24 ou superior.</Alert> : null}
      <div className="space-y-2">
        {rows.map((row, index) => <div key={row.id} className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1 text-sm text-fg">IP {index + 1}
            <input autoComplete="off" autoCapitalize="none" spellCheck={false} name={`unblock-address-${row.id}`} className={`${FIELD_CLASS} mt-1 w-full`} disabled={busy} value={row.address} onChange={(event) => editRow(row.id, event.target.value, row.prefix)} placeholder="ex.: 203.0.113.10" />
          </label>
          <label className="text-sm text-fg">Máscara
            <select className={`${FIELD_CLASS} mt-1 block`} aria-label={`Máscara do IP ${index + 1}`} disabled={busy} value={row.prefix} onChange={(event) => editRow(row.id, row.address, Number(event.target.value))}>
              {PREFIXES.map((prefix) => <option key={prefix} value={prefix}>/{prefix}</option>)}
            </select>
          </label>
          {rows.length > 1 ? <Button type="button" variant="secondary" disabled={busy} aria-label={`Remover IP ${index + 1}`} onClick={() => { if (running.current) return; invalidate(); setRows((current) => current.filter((entry) => entry.id !== row.id)); }}>Remover</Button> : null}
          {'target' in parsed[index] && ![32, 128].includes(row.prefix) ? <p className="w-full text-sm text-fg-muted">Rede que será utilizada: {(parsed[index] as TableTarget).target}</p> : null}
          {row.address.trim() && 'error' in parsed[index] ? <p className="w-full text-sm text-rose-300">{(parsed[index] as { error: string }).error}</p> : null}
        </div>)}
        <Button type="button" variant="secondary" className="min-h-12 px-5 text-base" disabled={busy || rows.length >= 20} onClick={() => addRow()} aria-label="Adicionar outro IP">+ Adicionar IP</Button>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <Button type="button" variant="danger" disabled={busy || selectionInvalid || !valid || !!networkUnsupported} onClick={() => setReview('automatic')}>Desbloquear IPs ({uniqueTargets.length})</Button>
        <span role="status" className="text-sm text-fg-muted">{busy ? 'Aguardando confirmação dos firewalls… Mantenha esta tela aberta.' : 'Os resultados aparecem abaixo por IP e firewall.'}</span>
      </div>
      {review ? <div role="alertdialog" aria-modal="false" aria-label="Confirmar desbloqueio" className="space-y-3 rounded-lg border border-border p-4">
        <p className="font-medium text-fg">Confirme os endereços e firewalls para desbloquear</p>
        <p className="break-words text-sm">{review === 'automatic' ? uniqueTargets.map((target) => target.target).join(', ') : selectedMatches.map((match) => `${match.target.target} · ${match.table}`).join(', ')}</p>
        <p className="text-sm text-fg-muted">{selectedNodes.map((node) => node.display_name || node.hostname).join(', ')}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="danger" disabled={busy || (review === 'selected' && selectedMatches.length === 0)} onClick={() => { void perform(review === 'automatic' ? 'unlock' : 'selected'); }}>Confirmar desbloqueio</Button>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => setReview(null)}>Cancelar</Button>
        </div>
      </div> : null}
      <details className="rounded-lg border border-border p-3">
        <summary className="cursor-pointer text-sm font-medium">Consultar tabelas e listar bloqueios</summary>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="secondary" disabled={busy || selectionInvalid || !valid || !!networkUnsupported} onClick={() => { void perform('consult'); }}>Consultar IPs nos selecionados</Button>
          <Button type="button" variant="secondary" disabled={busy || selectionInvalid || listUnsupported} onClick={() => { void perform('list'); }}>Listar bloqueios</Button>
        </div>
        <p className="mt-2 text-sm text-fg-muted">A consulta mostra tabelas associadas aos endereços. Para incluir sshguard em Listar bloqueios, use o agente 0.5.34 ou superior. Clique em uma entrada da lista para adicionar o endereço.</p>
      </details>
      {jobs.length > 0 ? <div className="space-y-2 text-sm" aria-live="polite">
        {jobs.map((job) => <div key={job.id} className="rounded-lg border border-border p-3">
          <strong>{job.hostname} {job.target ? `· ${job.target.target}` : ''}</strong>
          <p>{job.phase === 'remove' ? `Desbloqueio · ${job.table}` : job.phase === 'list' ? 'Listagem de bloqueios' : 'Consulta de bloqueios'} · {job.status === 'unconfirmed' ? 'Sem confirmação. Confira o histórico de comandos antes de tentar novamente.' : commandStatusLabel(job.status)}</p>
          {job.notice ? <p>{job.notice}</p> : null}
          {job.error ? <p className="text-rose-300">{job.error}</p> : null}
          {job.phase === 'search' && job.status === 'succeeded' ? job.tables.map((table) => {
            const match = matches.find((match) => match.node.id === job.nodeId && match.target.target === job.target?.target && match.table === table);
            return match ? <label key={table} className="mt-2 flex items-center gap-2"><input type="checkbox" disabled={busy} checked={checked.has(matchKey(match))} onChange={() => { setReview(null); setChecked((current) => { const next = new Set(current); const key = matchKey(match); if (next.has(key)) next.delete(key); else next.add(key); return next; }); }} />{table}{isAutomaticBlockTable(table) ? '' : ' · tabela adicional, exige seleção manual'}</label> : null;
          }) : null}
          {job.phase === 'list' && job.status === 'succeeded' && !job.blocks?.length ? <p>Sem entradas nas tabelas de proteção listadas.</p> : null}
          {job.blocks?.map((block) => <div key={block.table} className="mt-2"><p>{block.table} · {block.total} entrada(s){block.truncated ? ' · mostrando 80' : ''}</p><ul className="mt-1 flex flex-wrap gap-2">{block.entries.map((entry) => <li key={entry}><button type="button" className="text-primary hover:underline" disabled={busy || rows.length >= 20} onClick={() => addRow(entry)}>{entry}</button></li>)}</ul></div>)}
        </div>)}
      </div> : null}
      {selectedMatches.length > 0 ? <Button type="button" variant="danger" disabled={busy} onClick={() => setReview('selected')}>Desbloquear entradas selecionadas ({selectedMatches.length})</Button> : null}
    </Card>
  );
}
