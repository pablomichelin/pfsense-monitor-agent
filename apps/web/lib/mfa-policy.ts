export type MfaPolicyMode = 'off' | 'soft' | 'blocking';

export type MfaPolicyRoleStatus = {
  code: string;
  label: string;
  enforced: boolean;
  active_users: number;
  users_missing_mfa: number;
};

export type MfaPolicyComplianceUser = {
  id: string;
  email: string;
  role: string;
  mfa_enabled: boolean;
  recovery_codes_remaining: number;
};

export type MfaPolicyResponse = {
  effective: {
    enforced_roles: string[];
    enforcement_blocking: boolean;
    mode: MfaPolicyMode;
  };
  stored: {
    enforced_roles: string[];
    enforcement_blocking: boolean;
    updated_at: string;
  };
  env_override: {
    enforced_roles: boolean;
    enforcement_blocking: boolean;
    enforced_roles_value: string[] | null;
    enforcement_blocking_value: boolean | null;
  };
  editable: boolean;
  roles: MfaPolicyRoleStatus[];
  compliance: {
    enforced_roles: string[];
    users_missing_mfa: MfaPolicyComplianceUser[];
    total_missing_mfa: number;
  };
  blocking_readiness: {
    ready: boolean;
    reason: string | null;
    qualified_superadmins: number;
  };
};

export const MFA_MODE_LABELS: Record<MfaPolicyMode, string> = {
  off: 'Desligado',
  soft: 'Soft (aviso)',
  blocking: 'Blocking (bloqueia /admin)',
};

export function mfaModeLabel(mode: MfaPolicyMode): string {
  return MFA_MODE_LABELS[mode] ?? mode;
}
