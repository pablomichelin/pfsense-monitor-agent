'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import type { OperationalActionsStatusResponse } from '@/lib/api';
import {
  fetchOperationalActionsStatus,
  requestNodeRebootAction,
  requestServiceRestartAction,
} from '@/lib/operational-actions-actions';
import { formatDateTime } from '@/lib/format';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageSection } from '@/components/ui/page-section';
import { NodeCommandProgress } from '@/components/nodes/node-command-progress';

type Props = {
  nodeId: string;
  hostname: string;
  canRestartService: boolean;
  canReboot: boolean;
  initialStatus: OperationalActionsStatusResponse;
};

function confirmationMatches(hostname: string, value: string): boolean {
  const trimmed = value.trim();
  return trimmed === hostname || trimmed.toUpperCase() === 'CONFIRMAR';
}

export function NodeOperationalActionsSection({
  nodeId,
  hostname,
  canRestartService,
  canReboot,
  initialStatus,
}: Props) {
  const [status, setStatus] = useState(initialStatus);
  const [error, setError] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState(
    initialStatus.allowed_services[0] ?? 'unbound',
  );
  const [rebootConfirm, setRebootConfirm] = useState('');
  const [rebootDelay, setRebootDelay] = useState(
    String(initialStatus.reboot_default_delay_seconds ?? 60),
  );
  const [enableMaintenance, setEnableMaintenance] = useState(true);
  const [acknowledgeHaRisk, setAcknowledgeHaRisk] = useState(false);
  const [showRebootDialog, setShowRebootDialog] = useState(false);
  const [pending, startTransition] = useTransition();

  const haNode =
    Boolean(status.ha_role?.trim()) || status.ha_detected_from_agent === true;

  const refresh = useCallback(async () => {
    try {
      const next = await fetchOperationalActionsStatus(nodeId);
      setStatus(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar status');
    }
  }, [nodeId]);

  useEffect(() => {
    const hasActive =
      status.active_service_restart != null || status.active_reboot != null;
    if (!hasActive) {
      return;
    }

    const timer = setInterval(() => {
      void refresh();
    }, 12_000);

    return () => clearInterval(timer);
  }, [status.active_reboot, status.active_service_restart, refresh]);

  const rebootReady = useMemo(() => {
    if (!confirmationMatches(hostname, rebootConfirm)) {
      return false;
    }
    if (haNode && !acknowledgeHaRisk) {
      return false;
    }
    if (!status.maintenance_mode && !enableMaintenance) {
      return false;
    }
    return true;
  }, [
    acknowledgeHaRisk,
    enableMaintenance,
    haNode,
    hostname,
    rebootConfirm,
    status.maintenance_mode,
  ]);

  if (!status.enabled) {
    return null;
  }

  return (
    <PageSection
      title="Ações operacionais"
      description="Reinício de serviços allowlistados e reboot controlado — sem shell remoto."
    >
      {error ? <Alert variant="error">{error}</Alert> : null}

      {!status.agent_version_supported ? (
        <Alert variant="warning">
          Agente {status.min_agent_version}+ necessário para ações operacionais (atual:{' '}
          {status.agent_version ?? 'desconhecido'}).
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {status.service_restart_enabled && canRestartService ? (
          <Card className="space-y-4 p-4">
            <div>
              <h3 className="font-display text-base text-fg">Reiniciar serviço</h3>
              <p className="mt-1 text-sm text-slate-400">
                Apenas serviços da allowlist do package. Impacto imediato no serviço
                selecionado.
              </p>
            </div>

            <label className="block text-sm text-slate-300">
              Serviço
              <select
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2"
                value={selectedService}
                onChange={(event) => setSelectedService(event.target.value)}
                disabled={pending || !status.agent_version_supported}
              >
                {status.allowed_services.map((service) => (
                  <option key={service} value={service}>
                    {service}
                  </option>
                ))}
              </select>
            </label>

            {status.active_service_restart ? (
              <div className="rounded-md border border-slate-700 bg-slate-900/50 p-3 text-sm">
                <p className="text-slate-400">Comando ativo</p>
                <NodeCommandProgress
                  status={status.active_service_restart.status}
                  isActive
                  compact
                />
              </div>
            ) : null}

            <Button
              type="button"
              variant="secondary"
              disabled={
                pending ||
                !status.agent_version_supported ||
                status.active_service_restart != null
              }
              onClick={() => {
                startTransition(async () => {
                  try {
                    await requestServiceRestartAction(nodeId, selectedService);
                    await refresh();
                  } catch (err) {
                    setError(
                      err instanceof Error ? err.message : 'Falha ao solicitar reinício',
                    );
                  }
                });
              }}
            >
              Reiniciar {selectedService}
            </Button>
          </Card>
        ) : null}

        {status.node_reboot_enabled && canReboot ? (
          <Card className="space-y-4 p-4">
            <div>
              <h3 className="font-display text-base text-rose-200">Reiniciar firewall</h3>
              <p className="mt-1 text-sm text-slate-400">
                Reboot agendado com atraso configurável. Exige confirmação forte e janela de
                manutenção.
              </p>
            </div>

            {haNode ? (
              <Alert variant="warning">
                Ambiente HA detectado
                {status.ha_role ? ` (${status.ha_role})` : ''}. Confirme que entende o risco
                de failover antes de continuar.
              </Alert>
            ) : null}

            {status.active_reboot ? (
              <div className="rounded-md border border-rose-900/50 bg-rose-950/20 p-3 text-sm">
                <p className="text-slate-400">Reboot em andamento</p>
                <NodeCommandProgress status={status.active_reboot.status} isActive compact />
              </div>
            ) : null}

            {!showRebootDialog ? (
              <Button
                type="button"
                variant="danger"
                disabled={
                  pending ||
                  !status.agent_version_supported ||
                  status.active_reboot != null
                }
                onClick={() => setShowRebootDialog(true)}
              >
                Solicitar reboot…
              </Button>
            ) : (
              <div className="space-y-3 rounded-md border border-rose-900/40 bg-slate-950/40 p-3">
                <label className="block text-sm text-slate-300">
                  Digite <span className="font-mono text-fg">{hostname}</span> ou CONFIRMAR
                  <input
                    className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 font-mono"
                    value={rebootConfirm}
                    onChange={(event) => setRebootConfirm(event.target.value)}
                    autoComplete="off"
                  />
                </label>

                <label className="block text-sm text-slate-300">
                  Atraso (segundos, 30–600)
                  <input
                    type="number"
                    min={30}
                    max={600}
                    className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2"
                    value={rebootDelay}
                    onChange={(event) => setRebootDelay(event.target.value)}
                  />
                </label>

                {!status.maintenance_mode ? (
                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={enableMaintenance}
                      onChange={(event) => setEnableMaintenance(event.target.checked)}
                    />
                    Ativar maintenance mode antes do reboot
                  </label>
                ) : (
                  <p className="text-sm text-emerald-300/90">
                    Firewall já está em maintenance mode.
                  </p>
                )}

                {haNode ? (
                  <label className="flex items-center gap-2 text-sm text-amber-200">
                    <input
                      type="checkbox"
                      checked={acknowledgeHaRisk}
                      onChange={(event) => setAcknowledgeHaRisk(event.target.checked)}
                    />
                    Reconheço o risco em ambiente HA/CARP
                  </label>
                ) : null}

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    type="button"
                    variant="danger"
                    disabled={pending || !rebootReady}
                    onClick={() => {
                      startTransition(async () => {
                        try {
                          await requestNodeRebootAction(nodeId, {
                            confirm_hostname: rebootConfirm,
                            delay_seconds: Number(rebootDelay),
                            enable_maintenance_mode: enableMaintenance,
                            acknowledge_ha_risk: acknowledgeHaRisk,
                          });
                          setShowRebootDialog(false);
                          setRebootConfirm('');
                          await refresh();
                        } catch (err) {
                          setError(
                            err instanceof Error ? err.message : 'Falha ao solicitar reboot',
                          );
                        }
                      });
                    }}
                  >
                    Confirmar reboot
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => {
                      setShowRebootDialog(false);
                      setRebootConfirm('');
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            )}

            {status.last_seen_at ? (
              <p className="text-xs text-slate-500">
                Último contato: {formatDateTime(status.last_seen_at)}
              </p>
            ) : null}
          </Card>
        ) : null}
      </div>
    </PageSection>
  );
}
