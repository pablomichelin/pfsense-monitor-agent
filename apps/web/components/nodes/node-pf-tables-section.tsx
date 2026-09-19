'use client';

import { useState, useTransition } from 'react';
import type { OperationalActionsStatusResponse } from '@/lib/api';
import {
  requestTableSearchAction,
  requestTableEntryRemoveAction,
} from '@/lib/operational-actions-actions';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageSection } from '@/components/ui/page-section';
import { NodeCommandProgress } from '@/components/nodes/node-command-progress';

type Props = {
  nodeId: string;
  hostname: string;
  status: OperationalActionsStatusResponse;
};

function confirmationMatches(hostname: string, value: string): boolean {
  const trimmed = value.trim();
  return trimmed === hostname || trimmed.toUpperCase() === 'CONFIRMAR';
}

export function NodePfTablesSection({ nodeId, hostname, status }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [searchIp, setSearchIp] = useState('');
  const [searchCommand, setSearchCommand] = useState<{
    command_id: string;
    status: string;
    ip: string;
  } | null>(null);
  const [removeTable, setRemoveTable] = useState('');
  const [removeIp, setRemoveIp] = useState('');
  const [removeConfirm, setRemoveConfirm] = useState('');
  const [removeCommand, setRemoveCommand] = useState<{
    command_id: string;
    status: string;
    table: string;
    ip: string;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  const agentSupported = status.agent_version_supported;

  const removeReady =
    removeTable.trim() !== '' &&
    removeIp.trim() !== '' &&
    confirmationMatches(hostname, removeConfirm);

  return (
    <PageSection
      title="Tabelas pf"
      description="Consulta e remoção de entradas em tabelas pf — sem shell remoto."
    >
      {error ? <Alert variant="error">{error}</Alert> : null}

      {!agentSupported ? (
        <Alert variant="warning">
          Agente {status.min_agent_version}+ necessário para ações de tabela (atual:{' '}
          {status.agent_version ?? 'desconhecido'}).
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-4 p-4">
          <div>
            <h3 className="font-display text-base text-fg">Consultar IP</h3>
            <p className="mt-1 text-sm text-slate-400">
              Verifica em quais tabelas pf o endereço informado aparece.
            </p>
          </div>

          <label className="block text-sm text-slate-300">
            Endereço IP
            <input
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2"
              placeholder="ex.: 203.0.113.10"
              value={searchIp}
              onChange={(event) => setSearchIp(event.target.value)}
              disabled={pending || !agentSupported}
            />
          </label>

          {searchCommand ? (
            <div className="rounded-md border border-slate-700 bg-slate-900/50 p-3 text-sm">
              <p className="text-slate-400">
                Consulta de {searchCommand.ip} (comando {searchCommand.command_id})
              </p>
              <NodeCommandProgress
                status={searchCommand.status}
                isActive
                compact
              />
            </div>
          ) : null}

          <Button
            type="button"
            variant="secondary"
            disabled={pending || !agentSupported || searchIp.trim() === ''}
            onClick={() => {
              startTransition(async () => {
                try {
                  const result = await requestTableSearchAction(
                    nodeId,
                    searchIp.trim(),
                  );
                  setSearchCommand(result);
                  setError(null);
                } catch (err) {
                  setError(
                    err instanceof Error ? err.message : 'Falha ao consultar tabelas',
                  );
                }
              });
            }}
          >
            Consultar
          </Button>
        </Card>

        <Card className="space-y-4 p-4">
          <div>
            <h3 className="font-display text-base text-rose-200">Remover entrada</h3>
            <p className="mt-1 text-sm text-slate-400">
              Remove um endereço de uma tabela pf. Exige confirmação forte por hostname.
            </p>
          </div>

          <label className="block text-sm text-slate-300">
            Tabela
            <input
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2"
              placeholder="ex.: bogons"
              value={removeTable}
              onChange={(event) => setRemoveTable(event.target.value)}
              disabled={pending || !agentSupported}
            />
          </label>

          <label className="block text-sm text-slate-300">
            Endereço IP
            <input
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2"
              placeholder="ex.: 203.0.113.10"
              value={removeIp}
              onChange={(event) => setRemoveIp(event.target.value)}
              disabled={pending || !agentSupported}
            />
          </label>

          <label className="block text-sm text-slate-300">
            Confirmação
            <input
              className="mt-1 w-full rounded-md border border-rose-900/60 bg-slate-900 px-3 py-2"
              placeholder={`Digite ${hostname} para confirmar`}
              value={removeConfirm}
              onChange={(event) => setRemoveConfirm(event.target.value)}
              disabled={pending || !agentSupported}
            />
          </label>

          {removeCommand ? (
            <div className="rounded-md border border-rose-900/50 bg-rose-950/20 p-3 text-sm">
              <p className="text-slate-400">
                Remoção de {removeCommand.ip} de {removeCommand.table} (comando{' '}
                {removeCommand.command_id})
              </p>
              <NodeCommandProgress
                status={removeCommand.status}
                isActive
                compact
              />
            </div>
          ) : null}

          <Button
            type="button"
            variant="danger"
            disabled={pending || !agentSupported || !removeReady}
            onClick={() => {
              startTransition(async () => {
                try {
                  const result = await requestTableEntryRemoveAction(
                    nodeId,
                    removeTable.trim(),
                    removeIp.trim(),
                  );
                  setRemoveCommand(result);
                  setRemoveConfirm('');
                  setError(null);
                } catch (err) {
                  setError(
                    err instanceof Error
                      ? err.message
                      : 'Falha ao solicitar remoção',
                  );
                }
              });
            }}
          >
            Remover entrada
          </Button>
        </Card>
      </div>
    </PageSection>
  );
}
