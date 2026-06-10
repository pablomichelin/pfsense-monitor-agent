'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui';
import {
  auditActionLabel,
  auditResultLabel,
  auditTargetTypeLabel,
} from '@/lib/audit-labels';
import { formatRelativeAge } from '@/lib/format';
import { roleLabel } from '@/lib/rbac-labels';

type AuditItem = {
  id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  target_display_name: string | null;
  actor_email: string | null;
  actor_id: string | null;
  actor_role?: string | null;
  client_id?: string | null;
  result?: string | null;
  ip_address: string | null;
  metadata_json: unknown;
  created_at: string;
};

function resultBadgeVariant(result: string): 'success' | 'danger' | 'warning' {
  if (result === 'denied') {
    return 'danger';
  }
  if (result === 'failure') {
    return 'warning';
  }
  return 'success';
}

export function AuditEventRow({ item }: { item: AuditItem }) {
  const [expanded, setExpanded] = useState(false);
  const raw = item.metadata_json;
  const hasPayload =
    raw != null &&
    typeof raw === 'object' &&
    (Array.isArray(raw) ? raw.length > 0 : Object.keys(raw).length > 0);

  const actorLabel = item.actor_email ?? item.actor_id ?? '—';
  const targetLabel = item.target_display_name ?? item.target_id ?? '—';

  return (
    <article className="rounded-lg border border-slate-800/80 bg-panel-soft/40 px-3 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Badge variant="info" className="font-mono">
          {auditActionLabel(item.action)}
        </Badge>

        {item.result && item.result !== 'success' ? (
          <Badge variant={resultBadgeVariant(item.result)}>
            {auditResultLabel(item.result)}
          </Badge>
        ) : null}

        {item.actor_role ? (
          <Badge variant="neutral">{roleLabel(item.actor_role)}</Badge>
        ) : null}

        <Badge variant="neutral" className="font-mono">
          {auditTargetTypeLabel(item.target_type)}
        </Badge>

        <span className="text-slate-300">{actorLabel}</span>

        <span
          className="max-w-[8rem] truncate text-slate-400 sm:max-w-[20rem]"
          title={item.target_id ?? undefined}
        >
          → {targetLabel}
        </span>

        <time
          className="ml-auto shrink-0 font-mono text-xs text-slate-500"
          dateTime={item.created_at}
        >
          {new Date(item.created_at).toLocaleString('pt-BR', {
            dateStyle: 'short',
            timeStyle: 'short',
          })}
          <span className="hidden sm:inline"> · {formatRelativeAge(item.created_at)}</span>
        </time>

        {hasPayload ? (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="shrink-0 rounded-lg border border-slate-600/80 px-2.5 py-1 text-xs text-slate-400 transition hover:border-cyan-400/40 hover:text-slate-200"
          >
            {expanded ? 'Ocultar detalhes' : 'Ver detalhes'}
          </button>
        ) : null}
      </div>

      {expanded && hasPayload ? (
        <pre className="mt-3 overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 font-mono text-xs text-slate-300">
          {JSON.stringify(item.metadata_json, null, 2)}
        </pre>
      ) : null}
    </article>
  );
}
