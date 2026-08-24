'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { NodeConfigBackupsResponse } from '@/lib/api';
import { acknowledgeBackupDriftAction, updateBackupRetentionPolicyAction } from '@/lib/backups';
import { formatBytes } from '@/lib/format';

type Props = {
  nodeId: string;
  backups: NodeConfigBackupsResponse;
  canManage: boolean;
};

export function BackupDriftIndicator({ nodeId, backups, canManage }: Props) {
  const router = useRouter();
  const [clearing, setClearing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!backups.advanced_features?.drift_enabled) {
    return null;
  }

  if (!backups.drift?.active || !backups.drift.state) {
    return null;
  }

  const sections =
    backups.drift.state.sensitive_changed_sections ??
    backups.drift.state.changed_sections ??
    [];

  const handleAcknowledge = async () => {
    setClearing(true);
    setMessage(null);
    try {
      const result = await acknowledgeBackupDriftAction(nodeId);
      setMessage(
        result.cleared
          ? 'Drift reconhecido. Indicador limpo ate proxima mudanca sensivel.'
          : 'Nenhum drift ativo para limpar.',
      );
      if (result.cleared) {
        router.refresh();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao reconhecer drift');
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
      <p className="font-medium">Drift de configuracao detectado</p>
      <p className="mt-1 text-xs text-amber-100/90">
        Secoes sensiveis alteradas: {sections.length > 0 ? sections.join(', ') : '—'}
      </p>
      {backups.drift.state.detected_at ? (
        <p className="mt-1 text-xs text-amber-100/80">
          Detectado em {new Date(backups.drift.state.detected_at).toLocaleString('pt-BR')}
        </p>
      ) : null}
      {canManage ? (
        <button
          type="button"
          onClick={() => void handleAcknowledge()}
          disabled={clearing}
          className="mt-3 rounded-lg border border-amber-400/40 px-3 py-1.5 text-xs text-amber-50 transition hover:bg-amber-500/20 disabled:opacity-50"
        >
          {clearing ? 'Salvando...' : 'Reconhecer drift'}
        </button>
      ) : null}
      {message ? <p className="mt-2 text-xs">{message}</p> : null}
    </div>
  );
}

export function BackupRetentionPolicyForm({
  nodeId,
  backups,
  canManage,
}: Props) {
  const [count, setCount] = useState<string>(
    backups.retention_policy?.count?.toString() ?? '30',
  );
  const [maxMb, setMaxMb] = useState<string>(
    backups.retention_policy
      ? String(Math.round(backups.retention_policy.max_bytes / (1024 * 1024)))
      : '250',
  );
  const [useGlobal, setUseGlobal] = useState(
    backups.retention_policy?.source !== 'node',
  );
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  if (!canManage) {
    return (
      <div className="mt-4 rounded-xl border border-slate-800 bg-panel-soft/40 px-4 py-3 text-sm text-slate-400">
        Retencao efetiva: {backups.retention_policy?.count ?? '—'} backups ·{' '}
        {formatBytes(backups.retention_policy?.max_bytes ?? null)} (
        {backups.retention_policy?.source === 'node' ? 'override do node' : 'global'})
      </div>
    );
  }

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const result = await updateBackupRetentionPolicyAction(nodeId, {
        retention_count: useGlobal ? null : Number.parseInt(count, 10),
        retention_max_bytes: useGlobal
          ? null
          : Number.parseInt(maxMb, 10) * 1024 * 1024,
      });
      setFeedback(
        `Politica salva (${result.effective.count} backups, ${formatBytes(result.effective.max_bytes)}).` +
          (result.deleted_backup_uids.length > 0
            ? ` ${result.deleted_backup_uids.length} backup(s) antigo(s) removido(s).`
            : ''),
      );
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Falha ao salvar politica');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-slate-800 bg-panel-soft/40 p-4">
      <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">
        Retencao por firewall
      </p>
      <label className="mt-3 flex items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={useGlobal}
          onChange={(event) => setUseGlobal(event.target.checked)}
        />
        Usar defaults globais do controlador
      </label>
      {!useGlobal ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-400">
            Quantidade maxima
            <input
              type="number"
              min={1}
              max={365}
              value={count}
              onChange={(event) => setCount(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-fg"
            />
          </label>
          <label className="text-xs text-slate-400">
            Teto em MB
            <input
              type="number"
              min={1}
              max={1024}
              value={maxMb}
              onChange={(event) => setMaxMb(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-fg"
            />
          </label>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={saving}
        className="mt-3 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-200 transition hover:border-cyan-400/60 disabled:opacity-50"
      >
        {saving ? 'Salvando...' : 'Salvar retencao'}
      </button>
      {feedback ? <p className="mt-2 text-xs text-slate-400">{feedback}</p> : null}
    </div>
  );
}
