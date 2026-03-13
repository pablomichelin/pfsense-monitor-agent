'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

type DashboardRefreshEvent = {
  event_id: string;
  source: 'heartbeat_ingested' | 'node_reconciled';
  occurred_at: string;
  node_id?: string;
  node_uid?: string;
  reason?: string;
};

type RealtimeRefreshProps = {
  scope?: 'all' | 'node';
  nodeId?: string;
  renderedAt?: string;
};

type StreamState = 'connecting' | 'live' | 'error';

const sourceLabel: Record<DashboardRefreshEvent['source'], string> = {
  heartbeat_ingested: 'heartbeat',
  node_reconciled: 'reconciliacao',
};

const formatClock = (value: string): string =>
  new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));

export function RealtimeRefresh({
  scope = 'all',
  nodeId,
  renderedAt,
}: RealtimeRefreshProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const refreshTimerRef = useRef<number | null>(null);
  const [streamState, setStreamState] = useState<StreamState>('connecting');
  const [lastEvent, setLastEvent] = useState<DashboardRefreshEvent | null>(null);

  useEffect(() => {
    const eventSource = new EventSource('/api/realtime/dashboard');

    const scheduleRefresh = (payload: DashboardRefreshEvent | null) => {
      if (scope === 'node' && nodeId && payload?.node_id !== nodeId) {
        return;
      }

      if (refreshTimerRef.current !== null) {
        return;
      }

      refreshTimerRef.current = window.setTimeout(() => {
        refreshTimerRef.current = null;
        startTransition(() => {
          router.refresh();
        });
      }, 1200);
    };

    const handleConnected = () => {
      setStreamState('live');
    };

    const handleRefresh = (event: MessageEvent<string>) => {
      setStreamState('live');

      try {
        const payload = JSON.parse(event.data) as DashboardRefreshEvent;
        setLastEvent(payload);
        scheduleRefresh(payload);
      } catch {
        scheduleRefresh(null);
      }
    };

    const handleKeepalive = () => {
      setStreamState('live');
    };

    const handleError = () => {
      setStreamState('error');
    };

    eventSource.addEventListener('open', handleConnected);
    eventSource.addEventListener('connected', handleConnected);
    eventSource.addEventListener('dashboard.refresh', handleRefresh as EventListener);
    eventSource.addEventListener('keepalive', handleKeepalive);
    eventSource.addEventListener('error', handleError);

    return () => {
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }

      eventSource.removeEventListener('open', handleConnected);
      eventSource.removeEventListener('connected', handleConnected);
      eventSource.removeEventListener(
        'dashboard.refresh',
        handleRefresh as EventListener,
      );
      eventSource.removeEventListener('keepalive', handleKeepalive);
      eventSource.removeEventListener('error', handleError);
      eventSource.close();
    };
  }, [nodeId, router, scope, startTransition]);

  const statusLabel =
    streamState === 'error'
      ? 'Tempo real reconectando'
      : isPending
        ? 'Atualizando painel'
        : 'Tempo real ativo';

  return (
    <div className="inline-flex min-w-[15rem] items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs text-slate-400">
      <div className="flex items-center gap-2">
        <span
          className={`status-dot ${
            streamState === 'live'
              ? isPending
                ? 'bg-amber-300'
                : 'bg-cyan-400'
              : streamState === 'error'
                ? 'bg-rose-400'
                : 'bg-slate-500'
          }`}
        />
        <span>{statusLabel}</span>
      </div>
      {lastEvent ? (
        <div className="text-right font-mono text-[11px] text-slate-500">
          <div>
            {sourceLabel[lastEvent.source]} {formatClock(lastEvent.occurred_at)}
          </div>
          {renderedAt ? <div>render {formatClock(renderedAt)}</div> : null}
        </div>
      ) : renderedAt ? (
        <span className="font-mono text-[11px] text-slate-500">
          render {formatClock(renderedAt)}
        </span>
      ) : null}
    </div>
  );
}
