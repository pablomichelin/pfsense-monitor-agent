'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { DISPLAY_TIME_ZONE } from '@/lib/format';

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
  realtimeEnabled?: boolean;
};

type StreamState = 'connecting' | 'live' | 'reconnecting' | 'closed';
const INITIAL_RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_DELAY_MS = 60_000;

const sourceLabel: Record<DashboardRefreshEvent['source'], string> = {
  heartbeat_ingested: 'heartbeat',
  node_reconciled: 'reconciliacao',
};

const formatClock = (value: string): string =>
  new Intl.DateTimeFormat('pt-BR', {
    timeZone: DISPLAY_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));

export function RealtimeRefresh({
  scope = 'all',
  nodeId,
  renderedAt,
  realtimeEnabled = true,
}: RealtimeRefreshProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const refreshTimerRef = useRef<number | null>(null);
  const lastRefreshAtRef = useRef<number>(0);
  const [streamState, setStreamState] = useState<StreamState>('connecting');
  const [lastEvent, setLastEvent] = useState<DashboardRefreshEvent | null>(null);

  const REFRESH_THROTTLE_MS = 30000;

  const refreshPanel = useCallback(() => {
    lastRefreshAtRef.current = Date.now();
    startTransition(() => {
      router.refresh();
    });
  }, [router, startTransition]);

  const handleManualRefresh = () => {
    if (refreshTimerRef.current !== null) {
      window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    refreshPanel();
  };

  useEffect(() => {
    setStreamState('connecting');
    setLastEvent(null);
    lastRefreshAtRef.current = 0;
    if (!realtimeEnabled) return;

    let retryTimer: number | null = null;
    let retryDelay = INITIAL_RECONNECT_DELAY_MS;
    let closeSource: (() => void) | undefined;

    const scheduleRefresh = () => {
      if (refreshTimerRef.current !== null) {
        return;
      }

      refreshTimerRef.current = window.setTimeout(() => {
        refreshTimerRef.current = null;
        refreshPanel();
      }, Math.max(1200, REFRESH_THROTTLE_MS - (Date.now() - lastRefreshAtRef.current)));
    };

    const handleConnected = () => {
      retryDelay = INITIAL_RECONNECT_DELAY_MS;
      setStreamState('live');
      // Recupera mudanças entre o snapshot SSR e a primeira conexão.
      scheduleRefresh();
    };

    const handleRefresh = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as DashboardRefreshEvent;
        if (!payload || !['heartbeat_ingested', 'node_reconciled'].includes(payload.source) || !Number.isFinite(Date.parse(payload.occurred_at))) return;
        const fleetReconciled = payload.source === 'node_reconciled' && payload.node_id == null;
        if (scope === 'node' && payload.node_id !== nodeId && !fleetReconciled) return;
        setStreamState('live');
        setLastEvent(payload);
        scheduleRefresh();
      } catch {
        // Eventos incompletos não devem gerar uma atualização nem quebrar a UI.
      }
    };

    const handleKeepalive = () => {
      setStreamState('live');
    };

    const connect = () => {
      const eventSource = new EventSource('/api/realtime/dashboard');
      const handleError = () => {
        if (eventSource.readyState !== EventSource.CLOSED) {
          setStreamState('reconnecting');
          return;
        }

        setStreamState('closed');
        if (retryTimer !== null) return;
        retryTimer = window.setTimeout(() => {
          retryTimer = null;
          closeSource?.();
          connect();
        }, retryDelay);
        retryDelay = Math.min(retryDelay * 2, MAX_RECONNECT_DELAY_MS);
      };

      eventSource.addEventListener('open', handleConnected);
      eventSource.addEventListener('connected', handleKeepalive);
      eventSource.addEventListener('dashboard.refresh', handleRefresh as EventListener);
      eventSource.addEventListener('keepalive', handleKeepalive);
      eventSource.addEventListener('error', handleError);
      closeSource = () => {
        eventSource.removeEventListener('open', handleConnected);
        eventSource.removeEventListener('connected', handleKeepalive);
        eventSource.removeEventListener('dashboard.refresh', handleRefresh as EventListener);
        eventSource.removeEventListener('keepalive', handleKeepalive);
        eventSource.removeEventListener('error', handleError);
        eventSource.close();
      };
    };
    connect();

    return () => {
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }

      if (retryTimer !== null) window.clearTimeout(retryTimer);
      closeSource?.();
    };
  }, [nodeId, realtimeEnabled, refreshPanel, scope]);

  const displayState = realtimeEnabled ? streamState : 'manual';
  const statusLabel =
    displayState === 'manual' ? 'Atualização manual'
      : displayState === 'connecting' ? 'Tempo real conectando'
        : displayState === 'reconnecting' ? 'Tempo real reconectando'
          : displayState === 'closed' ? 'Tempo real desconectado'
            : isPending ? 'Atualizando painel' : 'Tempo real ativo';

  return (
    <div className="inline-flex flex-wrap items-center gap-3 text-xs text-fg-muted">
      <div className="flex items-center gap-2">
        <span
          className={`status-dot ${
            displayState === 'live'
              ? isPending
                ? 'bg-amber-300'
                : 'bg-cyan-400'
              : displayState === 'reconnecting' || displayState === 'closed'
                ? 'bg-rose-400'
                : 'bg-slate-500'
          }`}
        />
        <span>{statusLabel}</span>
      </div>
      {realtimeEnabled && lastEvent ? (
        <div className="text-right font-mono text-[11px] text-fg-muted">
          <div>
            {sourceLabel[lastEvent.source]} {formatClock(lastEvent.occurred_at)}
          </div>
          {renderedAt ? <div>Atualizado {formatClock(renderedAt)} (Brasília)</div> : null}
        </div>
      ) : renderedAt ? (
        <span className="font-mono text-[11px] text-fg-muted">
          Atualizado {formatClock(renderedAt)} (Brasília)
        </span>
      ) : null}
      {displayState === 'manual' || displayState === 'closed' ? (
        <Button variant="secondary" size="sm" loading={isPending} onClick={handleManualRefresh}>
          Atualizar agora
        </Button>
      ) : null}
    </div>
  );
}
