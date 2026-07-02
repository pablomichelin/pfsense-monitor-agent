export const AUDIT_ACTION_GROUPS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Todas as ações' },
  { value: 'auth.', label: 'Autenticação' },
  { value: 'admin.', label: 'Administração' },
  { value: 'backup.', label: 'Backup config.xml' },
  { value: 'pfsense.upgrade.', label: 'Upgrade pfSense' },
  { value: 'package.upgrade.', label: 'Upgrade package' },
  { value: 'service.restart.', label: 'Reinício de serviço' },
  { value: 'node.reboot.', label: 'Reboot firewall' },
  { value: 'alert.', label: 'Alertas' },
  { value: 'notifications.', label: 'Notificações' },
  { value: 'security.', label: 'Segurança' },
  { value: 'fleet.', label: 'Organização da frota' },
  { value: 'role.', label: 'Perfis e permissões' },
  { value: 'access.denied', label: 'Acesso negado' },
  { value: 'commands.', label: 'Comandos remotos' },
  { value: 'pfsense.', label: 'pfREST / pfSense API' },
];

export const AUDIT_TARGET_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Todos os recursos' },
  { value: 'node', label: 'Firewall' },
  { value: 'client', label: 'Cliente' },
  { value: 'user', label: 'Usuário' },
  { value: 'role', label: 'Perfil' },
  { value: 'agent_token', label: 'Token do agente' },
  { value: 'alert', label: 'Alerta' },
  { value: 'node_command', label: 'Comando do agente' },
  { value: 'http_request', label: 'Requisição HTTP' },
  { value: 'user_session', label: 'Sessão' },
  { value: 'mfa_policy', label: 'Política MFA' },
];

export const AUDIT_RESULT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Todos os resultados' },
  { value: 'success', label: 'Sucesso' },
  { value: 'denied', label: 'Negado' },
  { value: 'failure', label: 'Falha' },
];

export const AUDIT_PERIOD_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Qualquer período' },
  { value: '24h', label: 'Últimas 24 horas' },
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
  { value: 'custom', label: 'Personalizado' },
];

export const AUDIT_LIMIT_OPTIONS = [25, 50, 100] as const;

const ACTION_LABELS: Record<string, string> = {
  'auth.login': 'Login',
  'auth.logout': 'Logout',
  'auth.session.revoke': 'Revogar sessão',
  'access.denied': 'Acesso negado',
  'admin.user.create': 'Criar usuário',
  'admin.user.update': 'Atualizar usuário',
  'admin.user.delete': 'Excluir usuário',
  'admin.user_session.revoke': 'Revogar sessão (admin)',
  'admin.user_client_scopes.update': 'Atualizar escopo de clientes',
  'admin.client.create': 'Criar cliente',
  'admin.client.update': 'Atualizar cliente',
  'admin.client.delete': 'Excluir cliente',
  'admin.site.create': 'Criar site',
  'admin.site.update': 'Atualizar site',
  'admin.node.create': 'Criar firewall',
  'admin.node.update': 'Atualizar firewall',
  'admin.node.delete': 'Excluir firewall',
  'admin.node.rekey': 'Renovar chave do firewall',
  'admin.agent_token.create': 'Criar token do agente',
  'admin.agent_token.revoke': 'Revogar token do agente',
  'backup.config.request': 'Solicitar backup',
  'backup.config.request_picked_up': 'Backup aceito pelo agente',
  'backup.config.request_failed': 'Falha na solicitação de backup',
  'backup.config.request_succeeded': 'Backup concluído',
  'backup.config.request_expired': 'Solicitação de backup expirada',
  'backup.config.request_cancelled': 'Solicitação de backup cancelada',
  'backup.config.request_retry_scheduled': 'Retry de backup agendado',
  'backup.config.ingest': 'Backup recebido',
  'backup.config.duplicate': 'Backup duplicado',
  'backup.config.failure': 'Falha no backup',
  'backup.config.download': 'Download de backup',
  'backup.config.diff': 'Diff de backup',
  'backup.config.drift_detected': 'Drift de backup detectado',
  'backup.config.drift_acknowledged': 'Drift de backup reconhecido',
  'backup.config.retention_policy_update': 'Atualizar retencao de backup',
  'backup.config.export_guide': 'Guia de exportacao assistida',
  'backup.config.retention_delete': 'Exclusão por retenção',
  'pfsense.upgrade.request': 'Solicitar upgrade pfSense',
  'pfsense.upgrade.request_without_recent_backup': 'Upgrade sem backup recente',
  'pfsense.upgrade.request_picked_up': 'Upgrade aceito pelo agente',
  'pfsense.upgrade.request_failed': 'Falha no upgrade pfSense',
  'pfsense.upgrade.request_succeeded': 'Upgrade pfSense concluído',
  'pfsense.upgrade.request_expired': 'Solicitação de upgrade expirada',
  'pfsense.upgrade.request_cancelled': 'Upgrade pfSense cancelado',
  'pfsense.upgrade.request_retry_scheduled': 'Retry de upgrade pfSense agendado',
  'pfsense.upgrade.maintenance_restored': 'Maintenance restaurado pós-upgrade',
  'pfsense.upgrade.late_result_reconciled': 'Resultado tardio reconciliado',
  'pfsense.upgrade.late_result_rejected': 'Resultado tardio rejeitado',
  'pfsense.credentials.create': 'Cadastrar credencial pfREST',
  'pfsense.credentials.rotate': 'Rotacionar credencial pfREST',
  'pfsense.credentials.revoke': 'Revogar credencial pfREST',
  'pfsense.credentials.test_success': 'Teste pfREST bem-sucedido',
  'pfsense.credentials.test_failure': 'Falha no teste pfREST',
  'pfsense.alias.list': 'Listar aliases pfREST',
  'pfsense.alias.compare_backup': 'Comparar aliases pfREST × backup',
  'pfsense.alias.preview': 'Preview de alteração de alias',
  'pfsense.alias.apply_success': 'Alias aplicado via pfREST',
  'pfsense.alias.apply_failure': 'Falha ao aplicar alias via pfREST',
  'package.upgrade.request': 'Solicitar upgrade remoto do package',
  'package.upgrade.request_picked_up': 'Upgrade de package aceito pelo agente',
  'package.upgrade.request_failed': 'Falha no upgrade de package',
  'package.upgrade.request_succeeded': 'Upgrade de package concluído',
  'package.upgrade.request_expired': 'Solicitação de upgrade de package expirada',
  'package.upgrade.request_cancelled': 'Upgrade de package cancelado',
  'package.upgrade.request_retry_scheduled': 'Retry de upgrade de package agendado',
  'service.restart.request': 'Solicitar reinício de serviço',
  'service.restart.request_picked_up': 'Reinício de serviço aceito pelo agente',
  'service.restart.request_failed': 'Falha no reinício de serviço',
  'service.restart.request_succeeded': 'Reinício de serviço concluído',
  'service.restart.request_expired': 'Solicitação de reinício expirada',
  'service.restart.request_cancelled': 'Reinício de serviço cancelado',
  'node.reboot.request': 'Solicitar reboot do firewall',
  'node.reboot.request_picked_up': 'Reboot aceito pelo agente',
  'node.reboot.request_failed': 'Falha no reboot',
  'node.reboot.request_succeeded': 'Reboot agendado/concluído',
  'node.reboot.request_expired': 'Solicitação de reboot expirada',
  'node.reboot.request_cancelled': 'Reboot cancelado',
  'commands.batch.created': 'Lote de comandos criado',
  'alert.acknowledge': 'Reconhecer alerta',
  'alert.resolve': 'Resolver alerta',
  'notifications.channel.create': 'Criar canal de notificação',
  'notifications.channel.update': 'Atualizar canal de notificação',
  'notifications.channel.delete': 'Excluir canal de notificação',
  'notifications.channel.test': 'Testar canal de notificação',
  'notifications.rule.create': 'Criar regra de notificação',
  'notifications.rule.update': 'Atualizar regra de notificação',
  'notifications.rule.delete': 'Excluir regra de notificação',
  'fleet.tag.create': 'Criar tag da frota',
  'fleet.tag.update': 'Atualizar tag da frota',
  'fleet.tag.delete': 'Excluir tag da frota',
  'fleet.group.create': 'Criar grupo da frota',
  'fleet.group.update': 'Atualizar grupo da frota',
  'fleet.group.delete': 'Excluir grupo da frota',
  'fleet.group.members.set': 'Atualizar membros do grupo',
  'fleet.node_metadata.update': 'Atualizar tags/criticidade do firewall',
  'role.create': 'Criar perfil',
  'role.delete': 'Excluir perfil',
  'role.permissions.update': 'Atualizar permissões do perfil',
  'security.mfa_policy.update': 'Atualizar política MFA',
  'ingest.test_connection': 'Teste de conexão do agente',
};

const TARGET_TYPE_LABELS: Record<string, string> = {
  node: 'Firewall',
  client: 'Cliente',
  user: 'Usuário',
  role: 'Perfil',
  agent_token: 'Token do agente',
  alert: 'Alerta',
  node_command: 'Comando do agente',
  http_request: 'Requisição HTTP',
  user_session: 'Sessão',
  mfa_policy: 'Política MFA',
};

const RESULT_LABELS: Record<string, string> = {
  success: 'Sucesso',
  denied: 'Negado',
  failure: 'Falha',
};

export function auditActionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export function auditTargetTypeLabel(targetType: string): string {
  return TARGET_TYPE_LABELS[targetType] ?? targetType;
}

export function auditResultLabel(result: string): string {
  return RESULT_LABELS[result] ?? result;
}

export function resolveAuditPeriodBounds(period: string): { from?: string; to?: string } {
  if (!period || period === 'custom') {
    return {};
  }

  const to = new Date();
  const from = new Date(to);

  if (period === '24h') {
    from.setHours(from.getHours() - 24);
  } else if (period === '7d') {
    from.setDate(from.getDate() - 7);
  } else if (period === '30d') {
    from.setDate(from.getDate() - 30);
  } else {
    return {};
  }

  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
}
