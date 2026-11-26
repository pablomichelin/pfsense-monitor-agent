'use client';

import { useMemo, useState, useTransition } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Alert, Button, Card } from '@/components/ui';
import {
  createNotificationChannelAction,
  createNotificationRuleAction,
  deleteNotificationChannelAction,
  deleteNotificationRuleAction,
  testNotificationChannelAction,
  updateNotificationChannelAction,
  updateNotificationRuleAction,
} from '@/lib/notifications-actions';
import type {
  NotificationChannelItem,
  NotificationChannelType,
  NotificationDeliveryItem,
  NotificationRuleItem,
  NotificationsStatusResponse,
} from '@/lib/notifications';

const inputClass =
  'w-full rounded-lg border border-slate-600/80 bg-panel-soft h-10 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-500';
const selectClass =
  'w-full rounded-lg border border-slate-600/80 bg-panel-soft h-10 px-3 text-sm text-slate-200 outline-none';
const labelClass = 'mb-1 block text-xs text-slate-500';

const CHANNEL_TYPE_LABELS: Record<NotificationChannelType, string> = {
  email: 'E-mail (SMTP)',
  webhook: 'Webhook HTTP',
  telegram: 'Telegram',
};

const ALERT_TYPE_OPTIONS = [
  { value: '', label: 'Qualquer tipo' },
  { value: 'heartbeat_missing', label: 'Heartbeat ausente' },
  { value: 'service_down', label: 'Serviço parado' },
  { value: 'gateway_down', label: 'Gateway down' },
  { value: 'version_change', label: 'Mudança de versão' },
  { value: 'agent_error', label: 'Erro do agente' },
  { value: 'node_uid_conflict', label: 'Conflito node_uid' },
  { value: 'clock_skew', label: 'Clock skew' },
  { value: 'auth_failure_repeated', label: 'Falhas de auth repetidas' },
  { value: 'certificate_expiring', label: 'Certificado expirando' },
];

const SEVERITY_OPTIONS = [
  { value: '', label: 'Qualquer severidade' },
  { value: 'critical', label: 'Crítica' },
  { value: 'warning', label: 'Aviso' },
  { value: 'info', label: 'Info' },
];

const DELIVERY_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  sending: 'Enviando',
  delivered: 'Entregue',
  failed: 'Falhou',
};

type ClientOption = { id: string; name: string; code: string };

function ChannelTypeFields({
  type,
  channel,
  isEdit,
}: {
  type: NotificationChannelType;
  channel?: NotificationChannelItem;
  isEdit?: boolean;
}) {
  const config = channel?.config_public ?? {};

  if (type === 'webhook') {
    return (
      <>
        <label className="block">
          <span className={labelClass}>URL</span>
          <input
            name="url"
            type="url"
            required={!isEdit}
            defaultValue={String(config.url ?? '')}
            className={inputClass}
            placeholder="https://hooks.exemplo/alertas"
          />
        </label>
        <label className="block">
          <span className={labelClass}>Método HTTP</span>
          <select name="method" defaultValue={String(config.method ?? 'POST')} className={selectClass}>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
          </select>
        </label>
        <label className="block">
          <span className={labelClass}>
            Authorization header {isEdit ? '(vazio = manter atual)' : ''}
          </span>
          <input
            name="auth_header"
            type="password"
            autoComplete="off"
            className={inputClass}
            placeholder={isEdit && channel?.has_secrets ? '••••••••' : 'Bearer …'}
          />
        </label>
      </>
    );
  }

  if (type === 'email') {
    return (
      <>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className={labelClass}>SMTP host</span>
            <input
              name="smtp_host"
              required={!isEdit}
              defaultValue={String(config.smtp_host ?? '')}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className={labelClass}>SMTP port</span>
            <input
              name="smtp_port"
              type="number"
              defaultValue={String(config.smtp_port ?? 587)}
              className={inputClass}
            />
          </label>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className={labelClass}>From</span>
            <input
              name="from"
              required={!isEdit}
              defaultValue={String(config.from ?? '')}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className={labelClass}>To</span>
            <input
              name="to"
              required={!isEdit}
              defaultValue={String(config.to ?? '')}
              className={inputClass}
            />
          </label>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className={labelClass}>SMTP user {isEdit ? '(vazio = manter)' : ''}</span>
            <input name="smtp_user" autoComplete="off" className={inputClass} />
          </label>
          <label className="block">
            <span className={labelClass}>SMTP password {isEdit ? '(vazio = manter)' : ''}</span>
            <input
              name="smtp_password"
              type="password"
              autoComplete="new-password"
              className={inputClass}
            />
          </label>
        </div>
      </>
    );
  }

  return (
    <>
      <label className="block">
        <span className={labelClass}>Chat ID</span>
        <input
          name="chat_id"
          required={!isEdit}
          defaultValue={String(config.chat_id ?? '')}
          className={inputClass}
        />
      </label>
      <label className="block">
        <span className={labelClass}>Bot token {isEdit ? '(vazio = manter atual)' : ''}</span>
        <input
          name="bot_token"
          type="password"
          autoComplete="off"
          className={inputClass}
          placeholder={isEdit && channel?.has_secrets ? '••••••••' : ''}
        />
      </label>
    </>
  );
}

export function NotificationsAdminPanel({
  status,
  channels,
  rules,
  deliveries,
  clients,
  canManage,
  canTest,
}: {
  status: NotificationsStatusResponse;
  channels: NotificationChannelItem[];
  rules: NotificationRuleItem[];
  deliveries: NotificationDeliveryItem[];
  clients: ClientOption[];
  canManage: boolean;
  canTest: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [expandedPanel, setExpandedPanel] = useState<'channel-new' | 'rule-new' | null>(null);
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [newChannelType, setNewChannelType] = useState<NotificationChannelType>('webhook');
  const [deleteTarget, setDeleteTarget] = useState<
    | { kind: 'channel'; id: string; name: string }
    | { kind: 'rule'; id: string; name: string }
    | null
  >(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const stats = useMemo(
    () => ({
      channels: channels.length,
      rules: rules.filter((rule) => rule.enabled).length,
      deliveries: deliveries.length,
    }),
    [channels, rules, deliveries],
  );

  const runAction = (
    action: () => Promise<{ ok: boolean; error?: string }>,
    success: string,
    onError: (error: string) => void = (error) => setMessage({ tone: 'error', text: error }),
  ) => {
    startTransition(async () => {
      setMessage(null);
      try {
        const result = await action();
        if (!result.ok) {
          onError(result.error ?? 'Operação falhou');
          return;
        }
        setMessage({ tone: 'ok', text: success });
        setExpandedPanel(null);
        setEditingChannelId(null);
        setEditingRuleId(null);
        setDeleteTarget(null);
      } catch {
        onError('Não foi possível concluir a operação. Tente novamente.');
      }
    });
  };

  return (
    <div className="space-y-section">
      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Feature flag</p>
            <p className="text-lg font-semibold">
              {status.enabled ? 'NOTIFICATIONS_ENABLED=true' : 'NOTIFICATIONS_ENABLED=false'}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Canais</p>
            <p className="text-lg font-semibold">{stats.channels}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Regras ativas</p>
            <p className="text-lg font-semibold">{stats.rules}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Entregas recentes</p>
            <p className="text-lg font-semibold">{stats.deliveries}</p>
          </div>
        </div>
        {!status.enabled ? (
          <p className="mt-3 text-sm text-muted">
            Dispatcher desligado no backend. Cadastre canais e regras; envios reais exigem
            `NOTIFICATIONS_ENABLED=true` na API.
          </p>
        ) : null}
      </Card>

      {message ? (
        <Card
          className={`p-3 text-sm ${
            message.tone === 'ok'
              ? 'border-emerald-500/40 bg-emerald-500/5'
              : 'border-amber-500/40 bg-amber-500/5'
          }`}
        >
          {message.text}
        </Card>
      ) : null}

      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold">Canais</h3>
          {canManage ? (
            <Button
              type="button"
              size="sm"
              variant={expandedPanel === 'channel-new' ? 'ghost' : 'primary'}
              disabled={pending}
              onClick={() => {
                setExpandedPanel((prev) => (prev === 'channel-new' ? null : 'channel-new'));
                setEditingChannelId(null);
              }}
            >
              {expandedPanel === 'channel-new' ? 'Cancelar' : 'Novo canal'}
            </Button>
          ) : null}
        </div>

        {canManage && expandedPanel === 'channel-new' ? (
          <form
            className="mb-4 rounded-lg border border-border/60 p-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (pending) return;
              const formData = new FormData(event.currentTarget);
              runAction(
                () => createNotificationChannelAction(formData),
                'Canal criado com sucesso.',
              );
            }}
          >
            <fieldset disabled={pending} className="min-w-0 space-y-3">
              <p className="text-sm font-medium text-slate-200">Novo canal</p>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className={labelClass}>Nome</span>
                  <input name="name" required minLength={2} className={inputClass} />
                </label>
                <label className="block">
                  <span className={labelClass}>Tipo</span>
                  <select
                    name="type"
                    value={newChannelType}
                    onChange={(event) =>
                      setNewChannelType(event.target.value as NotificationChannelType)
                    }
                    className={selectClass}
                  >
                    <option value="webhook">Webhook HTTP</option>
                    <option value="email">E-mail (SMTP)</option>
                    <option value="telegram">Telegram</option>
                  </select>
                </label>
              </div>
              <label className="block">
                <span className={labelClass}>Status</span>
                <select name="status" defaultValue="active" className={selectClass}>
                  <option value="active">Ativo</option>
                  <option value="inactive">Inativo</option>
                </select>
              </label>
              <ChannelTypeFields type={newChannelType} />
              <Button type="submit">
                {pending ? 'Salvando…' : 'Criar canal'}
              </Button>
            </fieldset>
          </form>
        ) : null}

        {channels.length === 0 ? (
          <p className="text-sm text-muted">Nenhum canal cadastrado.</p>
        ) : (
          <div className="space-y-3">
            {channels.map((channel) => (
              <div key={channel.id} className="rounded-lg border border-border/60">
                <div className="flex flex-wrap items-center gap-2 border-b border-border/40 px-3 py-2 text-sm">
                  <span className="font-medium">{channel.name}</span>
                  <span className="text-muted">·</span>
                  <span>{CHANNEL_TYPE_LABELS[channel.type]}</span>
                  <span className="text-muted">·</span>
                  <span>{channel.status === 'active' ? 'Ativo' : 'Inativo'}</span>
                  {channel.has_secrets ? (
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-400">
                      segredos OK
                    </span>
                  ) : null}
                  <div className="ml-auto flex flex-wrap gap-2">
                    {canTest ? (
                      <button
                        type="button"
                        className="rounded border border-border px-2 py-1 text-xs hover:bg-muted/20 disabled:opacity-50"
                        disabled={pending}
                        onClick={() => {
                          startTransition(async () => {
                            setMessage(null);
                            try {
                              const payload = await testNotificationChannelAction(channel.id);
                              setMessage({
                                tone: payload.ok ? 'ok' : 'error',
                                text: payload.ok
                                  ? `Teste do canal "${channel.name}" concluído.`
                                  : `Teste falhou: ${payload.error ?? 'erro desconhecido'}`,
                              });
                            } catch (error) {
                              setMessage({
                                tone: 'error',
                                text:
                                  error instanceof Error
                                    ? error.message
                                    : 'Falha ao testar canal',
                              });
                            }
                          });
                        }}
                      >
                        Testar
                      </button>
                    ) : null}
                    {canManage ? (
                      <>
                        <button
                          type="button"
                          className="rounded border border-border px-2 py-1 text-xs hover:bg-muted/20"
                          disabled={pending}
                          onClick={() => {
                            setEditingChannelId((prev) =>
                              prev === channel.id ? null : channel.id,
                            );
                            setExpandedPanel(null);
                          }}
                        >
                          {editingChannelId === channel.id ? 'Fechar' : 'Editar'}
                        </button>
                        <button
                          type="button"
                          className="rounded border border-rose-500/40 px-2 py-1 text-xs text-rose-200 hover:bg-rose-500/10"
                          disabled={pending}
                          onClick={() =>
                            setDeleteTarget({
                              kind: 'channel',
                              id: channel.id,
                              name: channel.name,
                            })
                          }
                        >
                          Excluir
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>

                {canManage && editingChannelId === channel.id ? (
                  <form
                    className="p-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (pending) return;
                      const formData = new FormData(event.currentTarget);
                      formData.set('type', channel.type);
                      runAction(
                        () => updateNotificationChannelAction(channel.id, formData),
                        'Canal atualizado.',
                      );
                    }}
                  >
                    <fieldset disabled={pending} className="min-w-0 space-y-3">
                      <input type="hidden" name="type" value={channel.type} />
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="block">
                          <span className={labelClass}>Nome</span>
                          <input
                            name="name"
                            required
                            defaultValue={channel.name}
                            className={inputClass}
                          />
                        </label>
                        <label className="block">
                          <span className={labelClass}>Status</span>
                          <select
                            name="status"
                            defaultValue={channel.status}
                            className={selectClass}
                          >
                            <option value="active">Ativo</option>
                            <option value="inactive">Inativo</option>
                          </select>
                        </label>
                      </div>
                      <ChannelTypeFields type={channel.type} channel={channel} isEdit />
                      <Button type="submit" size="sm">
                        Salvar canal
                      </Button>
                    </fieldset>
                  </form>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold">Regras</h3>
          {canManage ? (
            <Button
              type="button"
              size="sm"
              variant={expandedPanel === 'rule-new' ? 'ghost' : 'primary'}
              disabled={pending || channels.length === 0}
              onClick={() => {
                setExpandedPanel((prev) => (prev === 'rule-new' ? null : 'rule-new'));
                setEditingRuleId(null);
              }}
            >
              {expandedPanel === 'rule-new' ? 'Cancelar' : 'Nova regra'}
            </Button>
          ) : null}
        </div>

        {canManage && channels.length === 0 ? (
          <p className="mb-3 text-sm text-muted">Cadastre um canal antes de criar regras.</p>
        ) : null}

        {canManage && expandedPanel === 'rule-new' ? (
          <form
            className="mb-4 rounded-lg border border-border/60 p-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (pending) return;
              const formData = new FormData(event.currentTarget);
              runAction(
                () => createNotificationRuleAction(formData),
                'Regra criada com sucesso.',
              );
            }}
          >
            <fieldset disabled={pending} className="min-w-0 space-y-3">
              <p className="text-sm font-medium text-slate-200">Nova regra</p>
              <RuleFormFields channels={channels} clients={clients} />
              <Button type="submit">
                {pending ? 'Salvando…' : 'Criar regra'}
              </Button>
            </fieldset>
          </form>
        ) : null}

        {rules.length === 0 ? (
          <p className="text-sm text-muted">Nenhuma regra cadastrada.</p>
        ) : (
          <div className="space-y-3">
            {rules.map((rule) => (
              <div key={rule.id} className="rounded-lg border border-border/60">
                <div className="flex flex-wrap items-center gap-2 border-b border-border/40 px-3 py-2 text-sm">
                  <span className="font-medium">{rule.name}</span>
                  <span className="text-muted">→</span>
                  <span>{rule.channel_name}</span>
                  <span className="text-muted">·</span>
                  <span>{rule.severity ?? 'Qualquer sev.'}</span>
                  <span className="text-muted">·</span>
                  <span>{rule.enabled ? 'Ativa' : 'Inativa'}</span>
                  {canManage ? (
                    <div className="ml-auto flex gap-2">
                      <button
                        type="button"
                        className="rounded border border-border px-2 py-1 text-xs hover:bg-muted/20"
                        disabled={pending}
                        onClick={() => {
                          setEditingRuleId((prev) => (prev === rule.id ? null : rule.id));
                          setExpandedPanel(null);
                        }}
                      >
                        {editingRuleId === rule.id ? 'Fechar' : 'Editar'}
                      </button>
                      <button
                        type="button"
                        className="rounded border border-rose-500/40 px-2 py-1 text-xs text-rose-200 hover:bg-rose-500/10"
                        disabled={pending}
                        onClick={() =>
                          setDeleteTarget({ kind: 'rule', id: rule.id, name: rule.name })
                        }
                      >
                        Excluir
                      </button>
                    </div>
                  ) : null}
                </div>

                {canManage && editingRuleId === rule.id ? (
                  <form
                    className="p-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (pending) return;
                      const formData = new FormData(event.currentTarget);
                      runAction(
                        () => updateNotificationRuleAction(rule.id, formData),
                        'Regra atualizada.',
                      );
                    }}
                  >
                    <fieldset disabled={pending} className="min-w-0 space-y-3">
                      <RuleFormFields
                        channels={channels}
                        clients={clients}
                        rule={rule}
                      />
                      <Button type="submit" size="sm">
                        Salvar regra
                      </Button>
                    </fieldset>
                  </form>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h3 className="mb-1 text-base font-semibold">Histórico de entregas</h3>
        <p className="mb-3 text-xs text-muted">Últimas 100 entregas registradas pelo dispatcher.</p>
        {deliveries.length === 0 ? (
          <p className="text-sm text-muted">Nenhuma entrega registrada.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted">
                  <th className="px-2 py-2">Quando</th>
                  <th className="px-2 py-2">Alerta</th>
                  <th className="px-2 py-2">Canal</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Tentativas</th>
                  <th className="px-2 py-2">Erro</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((delivery) => (
                  <tr key={delivery.id} className="border-b border-border/60">
                    <td className="px-2 py-2 whitespace-nowrap text-muted">
                      {new Date(delivery.sent_at ?? delivery.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                    </td>
                    <td className="px-2 py-2">{delivery.alert_title}</td>
                    <td className="px-2 py-2">{delivery.channel_name}</td>
                    <td className="px-2 py-2">
                      {DELIVERY_STATUS_LABELS[delivery.status] ?? delivery.status}
                    </td>
                    <td className="px-2 py-2">{delivery.attempt_count}</td>
                    <td className="max-w-xs truncate px-2 py-2 text-muted">
                      {delivery.last_error ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={
          deleteTarget?.kind === 'channel' ? 'Excluir canal' : 'Excluir regra'
        }
        description={
          deleteTarget ? (
            <>
              Confirma a exclusão de <strong>{deleteTarget.name}</strong>? Esta ação não pode ser
              desfeita.
              {deleteTarget.kind === 'channel'
                ? ' Regras vinculadas a este canal também serão removidas.'
                : null}
              {deleteError ? <Alert variant="error" className="mt-3">{deleteError}</Alert> : null}
            </>
          ) : null
        }
        confirmLabel="Excluir"
        tone="danger"
        loading={pending}
        onCancel={() => {
          setDeleteTarget(null);
          setDeleteError(null);
        }}
        onConfirm={() => {
          if (!deleteTarget) {
            return;
          }

          setDeleteError(null);
          const isChannel = deleteTarget.kind === 'channel';
          const remove = isChannel ? deleteNotificationChannelAction : deleteNotificationRuleAction;
          runAction(
            () => remove(deleteTarget.id),
            isChannel ? 'Canal excluído.' : 'Regra excluída.',
            setDeleteError,
          );
        }}
      />
    </div>
  );
}

function RuleFormFields({
  channels,
  clients,
  rule,
}: {
  channels: NotificationChannelItem[];
  clients: ClientOption[];
  rule?: NotificationRuleItem;
}) {
  return (
    <>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block">
          <span className={labelClass}>Nome</span>
          <input
            name="name"
            required
            defaultValue={rule?.name ?? ''}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Canal</span>
          <select
            name="channel_id"
            required
            defaultValue={rule?.channel_id ?? channels[0]?.id ?? ''}
            className={selectClass}
          >
            {channels.map((channel) => (
              <option key={channel.id} value={channel.id}>
                {channel.name} ({CHANNEL_TYPE_LABELS[channel.type]})
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="block">
          <span className={labelClass}>Severidade</span>
          <select name="severity" defaultValue={rule?.severity ?? ''} className={selectClass}>
            {SEVERITY_OPTIONS.map((option) => (
              <option key={option.value || 'any'} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={labelClass}>Tipo de alerta</span>
          <select name="alert_type" defaultValue={rule?.alert_type ?? ''} className={selectClass}>
            {ALERT_TYPE_OPTIONS.map((option) => (
              <option key={option.value || 'any'} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={labelClass}>Cliente (opcional)</span>
          <select name="client_id" defaultValue={rule?.client_id ?? ''} className={selectClass}>
            <option value="">Todos os clientes</option>
            {rule?.client_id && !clients.some((client) => client.id === rule.client_id) ? (
              <option value={rule.client_id}>{rule.client_name ?? 'Cliente vinculado'} (indisponível na lista)</option>
            ) : null}
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name} ({client.code})
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block">
        <span className={labelClass}>Ativa</span>
        <select
          name="enabled"
          defaultValue={rule?.enabled === false ? 'false' : 'true'}
          className={selectClass}
        >
          <option value="true">Sim</option>
          <option value="false">Não</option>
        </select>
      </label>
    </>
  );
}
