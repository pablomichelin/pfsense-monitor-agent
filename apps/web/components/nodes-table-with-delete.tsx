'use client';

import Link from 'next/link';
import { useState } from 'react';
import { InstallationBadge } from '@/components/nodes/installation-badge';
import { PackageVersionCell } from '@/components/nodes/package-version-cell';
import {
  Button,
  DataTable,
  StatusBadge,
  dataTableHeadClassName,
  dataTableRowClassName,
} from '@/components/ui';
import type { StatusBadgeStatus } from '@/components/ui/status-badge';
import { deleteNodeAction, deleteNodesBatchAction } from '@/lib/admin';
import { formatRelativeAge } from '@/lib/format';

type Node = {
  id: string;
  node_uid: string;
  hostname: string;
  display_name: string | null;
  client: { id: string; name: string; code: string };
  site: { id: string; name: string; code: string };
  effective_status: string;
  observed_status: string;
  node_uid_status: string;
  maintenance_mode: boolean;
  last_seen_at: string | null;
  pfsense_version: string | null;
  agent_version: string | null;
  management_ip: string | null;
  wan_ip: string | null;
  open_alerts: number;
};

type Props = {
  nodes: Node[];
  canDelete: boolean;
};

export function NodesTableWithDelete({ nodes, canDelete }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchModal, setBatchModal] = useState(false);
  const [singleModal, setSingleModal] = useState<Node | null>(null);
  const [loading, setLoading] = useState(false);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === nodes.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(nodes.map((n) => n.id)));
    }
  };

  const handleBatchConfirm = async () => {
    if (selected.size === 0) return;
    setLoading(true);
    try {
      await deleteNodesBatchAction(Array.from(selected));
    } finally {
      setLoading(false);
    }
  };

  const handleSingleConfirm = async () => {
    if (!singleModal) return;
    setLoading(true);
    try {
      await deleteNodeAction(singleModal.id);
    } finally {
      setLoading(false);
    }
  };

  const selectedNodes = nodes.filter((n) => selected.has(n.id));

  return (
    <>
      <DataTable
        toolbar={
          canDelete && nodes.length > 0 ? (
            <>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-400">
                <input
                  type="checkbox"
                  checked={selected.size === nodes.length && nodes.length > 0}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-slate-600"
                />
                Selecionar todos
              </label>
              {selected.size > 0 ? (
                <Button type="button" variant="danger-outline" size="sm" onClick={() => setBatchModal(true)}>
                  Excluir selecionados ({selected.size})
                </Button>
              ) : null}
            </>
          ) : undefined
        }
        empty={nodes.length === 0}
        emptyMessage="Nenhum firewall encontrado com os filtros atuais."
      >
        <thead className={dataTableHeadClassName}>
          <tr>
            {canDelete ? (
              <th className="w-12 px-4 py-4">
                <span className="sr-only">Selecionar</span>
              </th>
            ) : null}
            <th className="w-28 min-w-[7rem] px-4 py-4">Status</th>
            <th className="min-w-[10rem] px-4 py-4">Firewall</th>
            <th className="min-w-[8rem] px-4 py-4">Local</th>
            <th className="min-w-[7rem] px-4 py-4">Versão pfSense</th>
            <th className="min-w-[7rem] px-4 py-4">Pacote</th>
            <th className="min-w-[6rem] px-4 py-4">Último contato</th>
            <th className="w-28 min-w-[7rem] px-4 py-4">Instalação</th>
            {canDelete ? (
              <th className="w-24 px-4 py-4">
                <span className="sr-only">Ações</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {nodes.map((node) => (
            <tr key={node.id} className={dataTableRowClassName}>
              {canDelete ? (
                <td className="w-12 px-4 py-4">
                  <input
                    type="checkbox"
                    checked={selected.has(node.id)}
                    onChange={() => toggle(node.id)}
                    className="h-4 w-4 rounded border-slate-600"
                  />
                </td>
              ) : null}
              <td className="w-28 min-w-[7rem] px-4 py-4">
                <StatusBadge status={node.effective_status as StatusBadgeStatus} />
              </td>
              <td className="min-w-[10rem] px-4 py-4">
                <Link
                  href={`/nodes/${node.id}`}
                  className="font-display text-lg text-fg hover:text-cyan-200"
                >
                  <span className="block truncate">{node.display_name ?? node.hostname}</span>
                </Link>
                <p className="mt-1 truncate text-xs text-slate-500">{node.hostname}</p>
              </td>
              <td className="min-w-[8rem] px-4 py-4">
                <p className="truncate">{node.client.name}</p>
                <p className="truncate text-slate-500">{node.site.name}</p>
              </td>
              <td className="min-w-[7rem] px-4 py-4">
                <p className="font-mono text-cyan-200">
                  {node.pfsense_version?.replace(/-RELEASE$/i, '').trim() || '—'}
                </p>
              </td>
              <td className="min-w-[7rem] px-4 py-4">
                <PackageVersionCell agentVersion={node.agent_version} />
              </td>
              <td className="min-w-[6rem] px-4 py-4 text-slate-400">
                <p>{formatRelativeAge(node.last_seen_at)}</p>
              </td>
              <td className="w-28 min-w-[7rem] px-4 py-4">
                <div className="flex flex-col gap-2">
                  <InstallationBadge
                    nodeUidStatus={node.node_uid_status}
                    agentVersion={node.agent_version}
                  />
                  <Link
                    href={`/nodes/${node.id}`}
                    className="text-xs text-cyan-300 transition hover:text-cyan-200"
                  >
                    Abrir
                  </Link>
                </div>
              </td>
              {canDelete ? (
                <td className="w-24 px-4 py-4">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSingleModal(node)}
                    className="text-rose-400 hover:text-rose-300"
                  >
                    Excluir
                  </Button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </DataTable>

      {singleModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center theme-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-single-title"
        >
          <div className="mx-4 w-full max-w-md rounded-xl border border-rose-500/30 bg-slate-900 p-6 shadow-xl">
            <h2 id="delete-single-title" className="font-display text-lg text-rose-200">
              Confirmar exclusão
            </h2>
            <p className="mt-3 text-sm text-slate-300">
              Esta ação é <strong className="text-rose-300">irreversível</strong>. O host será
              removido permanentemente.
            </p>
            <div className="mt-4 rounded-lg border border-slate-700 bg-slate-950/60 px-4 py-3 font-mono text-sm text-slate-200">
              <p>
                <span className="text-slate-500">Host:</span>{' '}
                {singleModal.display_name ?? singleModal.hostname}
              </p>
              <p className="mt-1">
                <span className="text-slate-500">node_uid:</span> {singleModal.node_uid}
              </p>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setSingleModal(null)}
                disabled={loading}
              >
                Cancelar
              </Button>
              <Button type="button" variant="danger" onClick={handleSingleConfirm} loading={loading}>
                {loading ? 'Excluindo...' : 'Excluir'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {batchModal && selectedNodes.length > 0 ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center theme-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-batch-title"
        >
          <div className="mx-4 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-rose-500/30 bg-slate-900 p-6 shadow-xl">
            <h2 id="delete-batch-title" className="font-display text-lg text-rose-200">
              Confirmar exclusão em lote
            </h2>
            <p className="mt-3 text-sm text-slate-300">
              Esta ação é <strong className="text-rose-300">irreversível</strong>.{' '}
              {selectedNodes.length} host(s) serão removidos permanentemente.
            </p>
            <ul className="mt-4 max-h-48 overflow-y-auto rounded-lg border border-slate-700 bg-slate-950/60 px-4 py-3 font-mono text-sm text-slate-200">
              {selectedNodes.map((n) => (
                <li key={n.id} className="truncate py-0.5">
                  {n.display_name ?? n.hostname} ({n.node_uid})
                </li>
              ))}
            </ul>
            <div className="mt-6 flex justify-end gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setBatchModal(false)}
                disabled={loading}
              >
                Cancelar
              </Button>
              <Button type="button" variant="danger" onClick={handleBatchConfirm} loading={loading}>
                {loading ? 'Excluindo...' : `Excluir ${selectedNodes.length} host(s)`}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
