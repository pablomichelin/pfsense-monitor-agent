import { Injectable, MessageEvent } from '@nestjs/common';
import { Observable, Subject, interval, map, merge, of } from 'rxjs';

export type DashboardRefreshEvent = {
  event_id: string;
  source: 'heartbeat_ingested' | 'node_reconciled';
  occurred_at: string;
  node_id?: string;
  node_uid?: string;
  client_id?: string;
  reason?: string;
};

@Injectable()
export class RealtimeService {
  private readonly dashboardEvents = new Subject<DashboardRefreshEvent>();
  private nextEventId = 0;

  private buildEventId(scope: 'connected' | 'dashboard' | 'keepalive'): string {
    this.nextEventId += 1;
    return `${scope}-${this.nextEventId}`;
  }

  publishDashboardRefresh(
    event: Omit<DashboardRefreshEvent, 'event_id'>,
  ): void {
    this.dashboardEvents.next({
      event_id: this.buildEventId('dashboard'),
      ...event,
    });
  }

  /**
   * D1: stream filtrado por escopo. `allowedClientIds === null` => escopo global
   * (superadmin) recebe tudo. Caso contrario, eventos com identidade de node fora
   * do escopo do usuario tem a identidade removida (node_id/node_uid/client_id),
   * preservando apenas o sinal generico de refresh — sem vazamento cross-escopo.
   */
  createDashboardStream(
    allowedClientIds: string[] | null = null,
  ): Observable<MessageEvent> {
    const scoped = allowedClientIds !== null;
    const allowedSet = scoped ? new Set(allowedClientIds) : null;

    return merge(
      of<MessageEvent>({
        id: this.buildEventId('connected'),
        type: 'connected',
        data: {
          occurred_at: new Date().toISOString(),
        },
      }),
      this.dashboardEvents.pipe(
        map((event): MessageEvent => {
          let data: DashboardRefreshEvent = event;
          if (scoped && event.node_id) {
            const inScope =
              event.client_id != null && allowedSet!.has(event.client_id);
            if (!inScope) {
              data = {
                event_id: event.event_id,
                source: event.source,
                occurred_at: event.occurred_at,
                reason: event.reason,
              };
            }
          }

          return {
            id: event.event_id,
            type: 'dashboard.refresh',
            data,
          };
        }),
      ),
      interval(15000).pipe(
        map((): MessageEvent => ({
          id: this.buildEventId('keepalive'),
          type: 'keepalive',
          data: {
            occurred_at: new Date().toISOString(),
          },
        })),
      ),
    );
  }
}
