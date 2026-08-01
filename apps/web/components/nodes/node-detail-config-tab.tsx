import Link from 'next/link';
import { AdvancedSection } from '@/components/advanced-section';
import { CopyButton } from '@/components/copy-button';
import { RotateSecretButton } from '@/components/rotate-secret-button';
import { NodeFleetMetadataForm } from '@/components/nodes/node-fleet-metadata-form';
import { CriticalityBadge, TagChipList } from '@/components/nodes/fleet-org-badges';
import { updateNodeAction } from '@/lib/admin';
import type { FleetTagItem, NodeBootstrapCommandResponse, NodeDetailsResponse } from '@/lib/api';
import {
  buildAuditHref,
  buildNodeDetailsHref,
  buildPfSensePrecheckBlock,
  type ConfigBackupInstallMode,
  type HeartbeatMode,
} from '@/lib/node-detail-helpers';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageSection } from '@/components/ui/page-section';
import { BootstrapField, CommandBlock } from '@/components/nodes/node-detail-ui';

type Node = NodeDetailsResponse['node'];

export function NodeDetailConfigTab({
  node,
  canManageNode,
  bootstrap,
  heartbeatMode,
  configBackupInstallMode,
  releaseBaseUrl,
  controllerUrl,
  availableTags = [],
  canManageFleetMetadata = false,
}: {
  node: Node;
  canManageNode: boolean;
  bootstrap: NodeBootstrapCommandResponse | null;
  heartbeatMode: HeartbeatMode;
  configBackupInstallMode: ConfigBackupInstallMode;
  releaseBaseUrl?: string;
  controllerUrl?: string;
  availableTags?: FleetTagItem[];
  canManageFleetMetadata?: boolean;
}) {
  const testConnectionAuditHref = buildAuditHref({
    action: 'ingest.test_connection',
    targetType: 'node',
    targetId: node.id,
  });
  const pfSensePrecheckBlock = bootstrap
    ? buildPfSensePrecheckBlock({
        controllerUrl: bootstrap.release.controller_url,
        installerUrl: bootstrap.release.installer_url,
        artifactUrl: bootstrap.release.artifact_url,
        checksumUrl: bootstrap.release.checksum_url,
      })
    : '';

  return (
    <div className="space-y-8">
      <PageSection
        title="Organização da frota"
        description="Criticidade/SLA e tags operacionais. Tags não substituem escopo RBAC por cliente."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="space-y-3 p-4">
            <p className="text-xs uppercase tracking-wider text-slate-500">Resumo atual</p>
            <div className="flex flex-wrap items-center gap-2">
              <CriticalityBadge criticality={node.criticality} />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-500">Tags</p>
              <div className="mt-2">
                <TagChipList tags={node.tags} max={12} />
              </div>
            </div>
          </Card>

          {canManageFleetMetadata ? (
            <NodeFleetMetadataForm
              nodeId={node.id}
              clientId={node.client.id}
              criticality={node.criticality}
              selectedTagIds={node.tags.map((tag) => tag.id)}
              availableTags={availableTags}
            />
          ) : null}
        </div>
      </PageSection>

      {canManageNode ? (
        <PageSection title="Editar cadastro" description="Metadados exibidos no inventário e no detalhe.">
          <Card>
            <form action={updateNodeAction} className="space-y-3">
              <input type="hidden" name="node_id" value={node.id} />
              <input type="hidden" name="hostname" value={node.hostname} />
              <input
                type="text"
                name="display_name"
                defaultValue={node.display_name ?? ''}
                placeholder="Nome exibido"
                className="w-full rounded-lg h-11 border border-slate-600/80 bg-panel-soft px-4 text-sm text-slate-100 outline-none placeholder:text-slate-500"
              />
              <div className="rounded-lg border border-slate-600/80 bg-slate-900/50 px-4 py-3">
                <p className="text-xs uppercase tracking-wider text-slate-500">Hostname</p>
                <p className="mt-0.5 font-mono text-sm text-slate-300">{node.hostname || '—'}</p>
              </div>
              <div className="rounded-lg border border-slate-600/80 bg-slate-900/50 px-4 py-3">
                <p className="text-xs uppercase tracking-wider text-slate-500">
                  IP de gerenciamento (resumo)
                </p>
                <p className="mt-0.5 font-mono text-sm text-slate-300">{node.management_ip || '—'}</p>
              </div>
              <div className="rounded-lg border border-slate-600/80 bg-slate-900/50 px-4 py-3">
                <p className="text-xs uppercase tracking-wider text-slate-500">IP WAN (resumo)</p>
                <p className="mt-0.5 font-mono text-sm text-slate-300">{node.wan_ip || '—'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-500">
                  IP de acesso direto web
                </p>
                <input
                  type="text"
                  name="remote_access_url"
                  defaultValue={node.remote_access_url ?? ''}
                  placeholder="https://177.38.158.46:9999"
                  className="mt-1.5 w-full rounded-lg h-11 border border-slate-600/80 bg-panel-soft px-4 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                />
              </div>
              <div className="rounded-lg border border-slate-600/80 bg-slate-900/50 px-4 py-3">
                <p className="text-xs uppercase tracking-wider text-slate-500">Versão pfSense</p>
                <p className="mt-0.5 font-mono text-sm text-slate-300">
                  {node.pfsense_version ? node.pfsense_version.replace(/-RELEASE$/i, '') : '—'}
                </p>
              </div>
              <div className="rounded-lg border border-slate-600/80 bg-slate-900/50 px-4 py-3">
                <p className="text-xs uppercase tracking-wider text-slate-500">Pacote</p>
                <p className="mt-0.5 font-mono text-sm text-slate-300">{node.agent_version ?? '—'}</p>
              </div>
              <AdvancedSection
                title="Campos avançados"
                description="ha_role e outros campos para ambientes HA/CARP."
              >
                <input
                  type="text"
                  name="ha_role"
                  defaultValue={node.ha_role ?? ''}
                  placeholder="Papel HA"
                  className="w-full rounded-lg h-11 border border-slate-600/80 bg-panel-soft px-4 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                />
              </AdvancedSection>
              <Button type="submit" className="w-full">Salvar metadados</Button>
            </form>
          </Card>
        </PageSection>
      ) : null}

      {canManageNode && bootstrap ? (
        <PageSection
          title="Instalar agente"
          description="Bootstrap, credenciais e comandos para instalação no pfSense."
        >
          <div className="space-y-4">
            <Card className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm text-slate-200">Credencial do agente</p>
                <p className="mt-1 text-sm text-slate-500">
                  Use a instalação abaixo para conectar este firewall ao painel.
                </p>
              </div>
              <RotateSecretButton nodeId={node.id} nodeUid={node.node_uid} />
            </Card>

            <div className="grid gap-3 lg:grid-cols-2">
              <BootstrapField label="UID" value={bootstrap.node.node_uid} />
              <BootstrapField
                label={canManageNode ? 'Secret' : 'Secret hint'}
                value={
                  canManageNode ? bootstrap.bootstrap.node_secret : bootstrap.bootstrap.secret_hint
                }
              />
            </div>

            {(bootstrap.package_command ?? bootstrap.command) ? (
              <div className="space-y-3">
                <Card>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="font-mono text-xs uppercase tracking-[0.24em] text-cyan-300">
                      Modo do heartbeat no install
                    </p>
                    <span className="text-xs text-slate-500">
                      Atual: <strong className="text-slate-300">{bootstrap.heartbeat_mode}</strong>
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      href={buildNodeDetailsHref({
                        id: node.id,
                        tab: 'config',
                        heartbeatMode: 'normal',
                        releaseBaseUrl,
                        controllerUrl,
                      })}
                      className={`rounded-lg px-3 py-2 text-sm transition ${
                        bootstrap.heartbeat_mode === 'normal'
                          ? 'border border-cyan-400/40 bg-cyan-500/10 text-cyan-200'
                          : 'border border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      Normal
                    </Link>
                    <Link
                      href={buildNodeDetailsHref({
                        id: node.id,
                        tab: 'config',
                        heartbeatMode: 'light',
                        releaseBaseUrl,
                        controllerUrl,
                      })}
                      className={`rounded-lg px-3 py-2 text-sm transition ${
                        bootstrap.heartbeat_mode === 'light'
                          ? 'border border-cyan-400/40 bg-cyan-500/10 text-cyan-200'
                          : 'border border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      Light
                    </Link>
                  </div>
                  <p className="mt-3 text-sm text-slate-500">
                    <strong className="text-slate-300">Normal</strong> envia serviços e gateways em todo
                    heartbeat. <strong className="text-slate-300">Light</strong> envia só métricas e
                    reaproveita o último estado conhecido.
                  </p>
                </Card>

                <Card>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="font-mono text-xs uppercase tracking-[0.24em] text-cyan-300">
                      Backup no install
                    </p>
                    <span className="text-xs text-slate-500">
                      Atual:{' '}
                      <strong className="text-slate-300">
                        {configBackupInstallMode === 'yes'
                          ? 'habilitado'
                          : configBackupInstallMode === 'no'
                            ? 'desabilitado'
                            : 'padrão (habilitado)'}
                      </strong>
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      href={buildNodeDetailsHref({
                        id: node.id,
                        tab: 'config',
                        heartbeatMode,
                        configBackupInstallMode: 'default',
                        releaseBaseUrl,
                        controllerUrl,
                      })}
                      className={`rounded-lg px-3 py-2 text-sm transition ${
                        configBackupInstallMode === 'default'
                          ? 'border border-cyan-400/40 bg-cyan-500/10 text-cyan-200'
                          : 'border border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      Padrão
                    </Link>
                    <Link
                      href={buildNodeDetailsHref({
                        id: node.id,
                        tab: 'config',
                        heartbeatMode,
                        configBackupInstallMode: 'yes',
                        releaseBaseUrl,
                        controllerUrl,
                      })}
                      className={`rounded-lg px-3 py-2 text-sm transition ${
                        configBackupInstallMode === 'yes'
                          ? 'border border-cyan-400/40 bg-cyan-500/10 text-cyan-200'
                          : 'border border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      Ligado
                    </Link>
                    <Link
                      href={buildNodeDetailsHref({
                        id: node.id,
                        tab: 'config',
                        heartbeatMode,
                        configBackupInstallMode: 'no',
                        releaseBaseUrl,
                        controllerUrl,
                      })}
                      className={`rounded-lg px-3 py-2 text-sm transition ${
                        configBackupInstallMode === 'no'
                          ? 'border border-cyan-400/40 bg-cyan-500/10 text-cyan-200'
                          : 'border border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      Desligado
                    </Link>
                  </div>
                  <p className="mt-3 text-sm text-slate-500">
                    Use <strong className="text-slate-300">Homolog (sim)</strong> em pfSense de teste; em
                    produção mantenha o padrão até validar o módulo.
                  </p>
                </Card>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="font-mono text-xs uppercase tracking-[0.24em] text-cyan-300">
                    Comando principal
                  </p>
                  <CopyButton value={bootstrap.package_command ?? bootstrap.command ?? ''} />
                </div>
                <p className="text-sm text-slate-400">
                  Cole no pfSense em <strong>Diagnostics &gt; Command Prompt</strong>. Retorna na hora;
                  instalação segue em segundo plano.
                </p>
                <CommandBlock value={bootstrap.package_command ?? bootstrap.command ?? ''} />
                <Alert variant="info">
                  <strong>Uso:</strong> (1) Abra Command Prompt no pfSense. (2) Cole o comando e execute.
                  (3) Em 1–2 min o firewall deve aparecer online. Acompanhe:{' '}
                  <code className="text-cyan-200">tail -f /tmp/monitor-install.log</code>
                </Alert>

                {bootstrap.uninstall_command ? (
                  <Card className="space-y-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-400">
                        Remover pacote (uninstall)
                      </p>
                      <CopyButton value={bootstrap.uninstall_command} />
                    </div>
                    <p className="text-sm text-slate-500">
                      Cole no pfSense em <strong>Diagnostics &gt; Command Prompt</strong> para remover por
                      completo o pacote SystemUp Monitor deste firewall.
                    </p>
                    <CommandBlock value={bootstrap.uninstall_command} />
                  </Card>
                ) : null}
              </div>
            ) : (
              <div className="space-y-3">
                <Alert variant="warning">
                  O comando automático ainda não está pronto para este firewall.
                </Alert>
                <Alert variant="info">
                  Publique a release do agente ou configure a base de download para o sistema montar o
                  comando automaticamente.
                </Alert>
              </div>
            )}

            <Card className="space-y-4">
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-cyan-300">
                Comandos de teste no pfSense
              </p>
              <p className="text-sm text-slate-400">
                Execute no <strong>Diagnostics &gt; Command Prompt</strong> para validar antes e depois da
                instalação.
              </p>
              <div className="space-y-3">
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-300">
                    Pré-instalação — versão, DNS e conectividade
                  </p>
                  <p className="mb-2 text-xs text-slate-500">
                    Valide versão do pfSense, resolução DNS e acesso HTTP/HTTPS aos URLs do controlador e do
                    release.
                  </p>
                  <CommandBlock value={pfSensePrecheckBlock} />
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-300">
                    Pós-instalação — serviço e agente
                  </p>
                  <p className="mb-2 text-xs text-slate-500">
                    Após instalar: status do serviço, config, test-connection, heartbeat e log. Esperado:
                    serviço rodando e respostas de sucesso.
                  </p>
                  <CommandBlock value={bootstrap.verification.command_block} />
                </div>
              </div>
            </Card>

            <AdvancedSection
              title="Mais opções e diagnóstico"
              description="URLs, overrides e roteiro técnico para homologação."
            >
              <div className="space-y-4">
                <div className="grid gap-3 lg:grid-cols-2">
                  <BootstrapField label="Artefato" value={bootstrap.release.artifact_name} />
                  <BootstrapField label="Controller URL" value={bootstrap.release.controller_url} />
                  <BootstrapField
                    label="Release base URL"
                    value={bootstrap.release.release_base_url ?? 'não configurada'}
                  />
                  {bootstrap.release.artifact_url ? (
                    <BootstrapField
                      label="Artifact URL"
                      value={bootstrap.release.artifact_url}
                      href={bootstrap.release.artifact_url}
                    />
                  ) : null}
                  {bootstrap.release.checksum_url ? (
                    <BootstrapField
                      label="Checksum URL"
                      value={bootstrap.release.checksum_url}
                      href={bootstrap.release.checksum_url}
                    />
                  ) : null}
                  {bootstrap.release.installer_url ? (
                    <BootstrapField
                      label="Installer URL"
                      value={bootstrap.release.installer_url}
                      href={bootstrap.release.installer_url}
                    />
                  ) : null}
                </div>

                <Card>
                  <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">
                    Override operacional
                  </p>
                  <form className="mt-4 flex flex-col gap-3">
                    <input
                      type="text"
                      name="release_base_url"
                      defaultValue={releaseBaseUrl ?? ''}
                      placeholder="https://downloads.systemup.inf.br/monitor-pfsense"
                      className="w-full rounded-lg h-11 border border-slate-600/80 bg-panel-soft px-4 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                    />
                    <input
                      type="text"
                      name="controller_url"
                      defaultValue={controllerUrl ?? ''}
                      placeholder="https://pfs-monitor.systemup.inf.br"
                      className="w-full rounded-lg h-11 border border-slate-600/80 bg-panel-soft px-4 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                    />
                    <div className="flex flex-col gap-3 lg:flex-row">
                      <Button type="submit">Aplicar override</Button>
                      <Link href={`/nodes/${node.id}?tab=config`}>
                        <Button type="button" variant="secondary">Limpar</Button>
                      </Link>
                    </div>
                  </form>
                </Card>

                <Card>
                  <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">
                    Pre-check no pfSense
                  </p>
                  <CommandBlock value={pfSensePrecheckBlock} />
                </Card>

                <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap">
                  <Link href={testConnectionAuditHref}>
                    <Button type="button" variant="secondary">Ver eventos deste firewall</Button>
                  </Link>
                  <Link href="/dashboard">
                    <Button type="button" variant="secondary">Dashboard</Button>
                  </Link>
                </div>
              </div>
            </AdvancedSection>
          </div>
        </PageSection>
      ) : null}

      {!canManageNode && !bootstrap ? (
        <Alert variant="info">
          Configuração e instalação do agente disponíveis apenas para operadores com permissão adequada.
        </Alert>
      ) : null}
    </div>
  );
}
