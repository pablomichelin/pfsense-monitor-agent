'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { Button, Card } from '@/components/ui';
import { updateMfaPolicyAction } from '@/lib/mfa-policy-actions';
import {
  mfaModeLabel,
  type MfaPolicyResponse,
} from '@/lib/mfa-policy';
import { roleLabel } from '@/lib/rbac-labels';

const inputClass =
  'rounded border border-slate-600/80 bg-slate-950/40 px-2 py-1 text-xs text-slate-200 outline-none';

type Props = {
  policy: MfaPolicyResponse;
  canManage: boolean;
};

export function MfaPolicyAdminPanel({ policy: initialPolicy, canManage }: Props) {
  const [policy, setPolicy] = useState(initialPolicy);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selectedRoles = useMemo(
    () => new Set(policy.stored.enforced_roles),
    [policy.stored.enforced_roles],
  );

  const handleSubmit = (formData: FormData) => {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await updateMfaPolicyAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPolicy(result.data);
      setMessage('Politica MFA atualizada.');
    });
  };

  return (
    <div className="space-y-section">
      {message ? (
        <div className="rounded-lg border border-emerald-700/60 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-lg border border-rose-700/60 bg-rose-950/30 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      <Card className="p-4 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Estado efetivo</h3>
            <p className="mt-1 text-xs text-slate-400">
              Modo: <span className="text-slate-200">{mfaModeLabel(policy.effective.mode)}</span>
              {' · '}
              Perfis exigidos:{' '}
              <span className="text-slate-200">
                {policy.effective.enforced_roles.length > 0
                  ? policy.effective.enforced_roles.map(roleLabel).join(', ')
                  : 'nenhum'}
              </span>
            </p>
          </div>
          <div className="text-right text-xs text-slate-500">
            <div>Ultima alteracao (banco): {new Date(policy.stored.updated_at).toLocaleString('pt-BR')}</div>
            {!policy.editable ? (
              <div className="mt-1 text-amber-300">
                Override via env ativo — painel somente leitura.
              </div>
            ) : null}
          </div>
        </div>

        {(policy.env_override.enforced_roles ||
          policy.env_override.enforcement_blocking) && (
          <div className="rounded-lg border border-amber-700/50 bg-amber-950/20 px-3 py-2 text-xs text-amber-100">
            Break-glass:{' '}
            {policy.env_override.enforced_roles
              ? `MFA_ENFORCED_ROLES=${policy.env_override.enforced_roles_value?.join(',') ?? ''}`
              : null}
            {policy.env_override.enforced_roles &&
            policy.env_override.enforcement_blocking
              ? ' · '
              : null}
            {policy.env_override.enforcement_blocking
              ? `MFA_ENFORCEMENT_BLOCKING=${String(policy.env_override.enforcement_blocking_value)}`
              : null}
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-slate-700/70 bg-panel-soft/40 p-3">
            <div className="text-xs text-slate-500">Usuarios sem MFA (perfis exigidos)</div>
            <div className="mt-1 text-2xl font-semibold text-slate-100">
              {policy.compliance.total_missing_mfa}
            </div>
          </div>
          <div className="rounded-lg border border-slate-700/70 bg-panel-soft/40 p-3">
            <div className="text-xs text-slate-500">Prontidao blocking</div>
            <div
              className={`mt-1 text-sm font-semibold ${
                policy.blocking_readiness.ready ? 'text-emerald-300' : 'text-amber-300'
              }`}
            >
              {policy.blocking_readiness.ready ? 'Pronto' : 'Bloqueado'}
            </div>
            {!policy.blocking_readiness.ready && policy.blocking_readiness.reason ? (
              <p className="mt-1 text-xs text-slate-400">{policy.blocking_readiness.reason}</p>
            ) : null}
          </div>
          <div className="rounded-lg border border-slate-700/70 bg-panel-soft/40 p-3">
            <div className="text-xs text-slate-500">Superadmins qualificados</div>
            <div className="mt-1 text-2xl font-semibold text-slate-100">
              {policy.blocking_readiness.qualified_superadmins}
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="text-sm font-semibold text-slate-100">Enforcement por perfil</h3>
        <p className="mt-1 text-xs text-slate-400">
          Soft: aviso e banner em /conta. Blocking: rotas /api/v1/admin bloqueadas ate enrollment.
        </p>

        <form action={handleSubmit} className="mt-4 space-y-4">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="text-slate-500">
                <tr>
                  <th className="px-2 py-2 font-medium">Exigir MFA</th>
                  <th className="px-2 py-2 font-medium">Perfil</th>
                  <th className="px-2 py-2 font-medium">Ativos</th>
                  <th className="px-2 py-2 font-medium">Sem MFA</th>
                </tr>
              </thead>
              <tbody>
                {policy.roles.map((role) => (
                  <tr key={role.code} className="border-t border-slate-800/80">
                    <td className="px-2 py-2">
                      <input
                        type="checkbox"
                        name="enforced_roles"
                        value={role.code}
                        defaultChecked={selectedRoles.has(role.code)}
                        disabled={!canManage || !policy.editable || pending}
                        className="h-4 w-4 rounded border-slate-600 bg-panel-soft"
                      />
                    </td>
                    <td className="px-2 py-2 text-slate-200">
                      {role.label}
                      <span className="ml-2 text-slate-500">({role.code})</span>
                    </td>
                    <td className="px-2 py-2 text-slate-300">{role.active_users}</td>
                    <td className="px-2 py-2">
                      {role.enforced && role.users_missing_mfa > 0 ? (
                        <span className="text-amber-300">{role.users_missing_mfa}</span>
                      ) : (
                        <span className="text-slate-500">{role.users_missing_mfa}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <span>Modo blocking</span>
              <select
                name="enforcement_blocking"
                defaultValue={String(policy.stored.enforcement_blocking)}
                disabled={!canManage || !policy.editable || pending}
                className={inputClass}
              >
                <option value="false">Soft (default seguro)</option>
                <option value="true">Blocking</option>
              </select>
            </label>
            {canManage && policy.editable ? (
              <Button type="submit" disabled={pending}>
                {pending ? 'Salvando…' : 'Salvar politica'}
              </Button>
            ) : null}
          </div>
        </form>
      </Card>

      {policy.compliance.users_missing_mfa.length > 0 ? (
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-slate-100">Usuarios pendentes de MFA</h3>
          <ul className="mt-3 space-y-2 text-xs">
            {policy.compliance.users_missing_mfa.map((user) => (
              <li
                key={user.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-amber-800/40 bg-amber-950/20 px-3 py-2"
              >
                <span className="text-slate-200">{user.email}</span>
                <span className="text-slate-400">{roleLabel(user.role)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-500">
            Oriente enrollment em{' '}
            <Link href="/conta" className="text-cyan-400 hover:text-cyan-300">
              Minha conta
            </Link>
            . Recovery codes sao exibidos uma unica vez no enrollment.
          </p>
        </Card>
      ) : null}

      <Card className="p-4 space-y-2 text-xs text-slate-400">
        <h3 className="text-sm font-semibold text-slate-200">Runbook rapido (anti-lockout)</h3>
        <ol className="list-decimal space-y-1 pl-4">
          <li>Enroll MFA em um superadmin ativo e guarde recovery codes offline.</li>
          <li>Teste login MFA + recovery antes de ligar blocking.</li>
          <li>Em emergencia: esvaziar MFA_ENFORCED_ROLES no env e reiniciar a API.</li>
          <li>Rollback via painel: modo soft + desmarcar perfis, ou blocking=false.</li>
        </ol>
        <p>Detalhes operacionais: docs/122-ENTREGA-POLITICA-MFA-2026-07-02.md</p>
      </Card>
    </div>
  );
}
