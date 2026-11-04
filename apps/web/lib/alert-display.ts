/** Presentation only: raw alert titles and types remain in technical details. */
export function alertTitle(title: string): string {
  return title.replace(/^Service (.+) stopped$/, 'Serviço $1 parado')
    .replace(/^Gateway (.+) down$/, 'Gateway $1 indisponível')
    .replace(/^Gateway (.+) degraded$/, 'Gateway $1 degradado');
}
export const alertTypes: Record<string, string> = {
  heartbeat_missing: 'Sem contato', service_down: 'Serviço parado', gateway_down: 'Gateway indisponível',
  certificate_expiring: 'Certificado a vencer', version_change: 'Versão alterada', agent_error: 'Erro do agente',
  node_uid_conflict: 'Identidade em conflito', clock_skew: 'Relógio divergente', auth_failure_repeated: 'Falhas de autenticação',
};
