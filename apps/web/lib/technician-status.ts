export type TechnicianAccountStatus =
  | 'pending_create'
  | 'active'
  | 'password_reset_pending'
  | 'disabled'
  | 'removed'
  | 'failed'
  | string;

export function technicianAccountStatusLabel(status: TechnicianAccountStatus): string {
  switch (status) {
    case 'pending_create':
      return 'Provisionando…';
    case 'active':
      return 'Ativa';
    case 'password_reset_pending':
      return 'Reset de senha pendente';
    case 'disabled':
      return 'Desativada';
    case 'removed':
      return 'Removida';
    case 'failed':
      return 'Falhou';
    default:
      return status;
  }
}

export function technicianAccountStatusBadgeVariant(
  status: TechnicianAccountStatus,
): 'neutral' | 'info' | 'success' | 'warning' | 'danger' {
  switch (status) {
    case 'active':
      return 'success';
    case 'pending_create':
    case 'password_reset_pending':
      return 'info';
    case 'disabled':
      return 'warning';
    case 'removed':
      return 'neutral';
    case 'failed':
      return 'danger';
    default:
      return 'neutral';
  }
}

export function technicianRegistryStatusLabel(status: string): string {
  return status === 'revoked' ? 'Removido do cadastro' : 'Ativo';
}
