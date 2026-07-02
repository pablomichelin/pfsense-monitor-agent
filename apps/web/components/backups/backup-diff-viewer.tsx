'use client';

import { useMemo, useState } from 'react';
import type {
  ConfigBackupDiffResponse,
  ConfigBackupItem,
} from '@/lib/api';
import { compareConfigBackupsAction } from '@/lib/backups';
import { formatDateTime, shortSha256 } from '@/lib/format';

const STATUS_LABELS: Record<string, string> = {
  unchanged: 'Sem alteracao',
  added: 'Adicionada',
  removed: 'Removida',
  modified: 'Modificada',
};

type Props = {
  nodeId: string;
  items: ConfigBackupItem[];
  enabled: boolean;
};

export function BackupDiffViewer({ nodeId, items, enabled }: Props) {
  const storedItems = useMemo(
    () => items.filter((item) => item.status === 'stored'),
    [items],
  );
  const [fromId, setFromId] = useState(storedItems[1]?.id ?? storedItems[0]?.id ?? '');
  const [toId, setToId] = useState(storedItems[0]?.id ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ConfigBackupDiffResponse | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (!enabled) {
    return (
      <div className="mt-4 rounded-xl border border-slate-800 bg-panel-soft/40 px-4 py-3 text-sm text-slate-500">
        Diff avancado desabilitado no controlador (`BACKUP_DIFF_ENABLED=false`).
      </div>
    );
  }

  if (storedItems.length < 2) {
    return (
      <div className="mt-4 rounded-xl border border-slate-800 bg-panel-soft/40 px-4 py-3 text-sm text-slate-500">
        Sao necessarios pelo menos dois backups armazenados para comparar versoes.
      </div>
    );
  }

  const runDiff = async () => {
    if (!fromId || !toId || fromId === toId) {
      setError('Selecione duas versoes diferentes.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const diff = await compareConfigBackupsAction(nodeId, fromId, toId);
      setResult(diff);
      setExpanded({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao gerar diff');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-slate-800 bg-panel-soft/40 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-slate-500">
            Diff de configuracao
          </p>
          <p className="mt-1 text-sm text-slate-400">
            Comparacao estruturada com mascaramento fail-closed de secoes desconhecidas e segredos.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]">
          <label className="text-xs text-slate-400">
            Versao base
            <select
              value={fromId}
              onChange={(event) => setFromId(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            >
              {storedItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {formatDateTime(item.received_at)} · {shortSha256(item.config_sha256)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-400">
            Versao comparada
            <select
              value={toId}
              onChange={(event) => setToId(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            >
              {storedItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {formatDateTime(item.received_at)} · {shortSha256(item.config_sha256)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void runDiff()}
            disabled={loading}
            className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-200 transition hover:border-cyan-400/60 disabled:opacity-50"
          >
            {loading ? 'Comparando...' : 'Comparar'}
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      {result ? (
        <div className="mt-4 space-y-3">
          {result.diff.secrets_masked ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              Segredos e secoes nao reconhecidas foram mascarados ({result.diff.unknown_sections_masked} secao(oes) desconhecida(s)).
            </div>
          ) : null}

          {result.diff.identical ? (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
              As versoes selecionadas possuem o mesmo hash SHA256.
            </div>
          ) : (
            result.diff.sections
              .filter((section) => section.status !== 'unchanged')
              .map((section) => {
                const isOpen = expanded[section.name] ?? section.status === 'modified';
                return (
                  <div
                    key={section.name}
                    className="rounded-lg border border-slate-800 bg-slate-950/40"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded((current) => ({
                          ...current,
                          [section.name]: !isOpen,
                        }))
                      }
                      className="flex w-full items-center justify-between px-4 py-3 text-left"
                    >
                      <span className="font-mono text-sm text-cyan-200">{section.name}</span>
                      <span className="text-xs text-slate-400">
                        {STATUS_LABELS[section.status] ?? section.status}
                        {section.masked ? ' · mascarada' : ''}
                      </span>
                    </button>
                    {isOpen ? (
                      <div className="border-t border-slate-800 px-4 py-3 text-xs text-slate-300">
                        {section.summary ? <p className="mb-2">{section.summary}</p> : null}
                        {section.changes?.length ? (
                          <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-black/30 p-3 font-mono text-[11px] leading-5">
                            {section.changes.join('\n')}
                          </pre>
                        ) : (
                          <p className="text-slate-500">Sem detalhes expostos (politica fail-closed).</p>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })
          )}
        </div>
      ) : null}
    </div>
  );
}
