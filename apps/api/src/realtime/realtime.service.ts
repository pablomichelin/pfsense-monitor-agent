import { Injectable, MessageEvent } from '@nestjs/common';
import { Observable, Subject, interval, map, merge, of } from 'rxjs';

export type DashboardRefreshEvent = {
  event_id: string;
  source: 'heartbeat_ingested' | 'node_reconciled';
  occurred_at: string;
  node_id?: string;
  node_uid?: string;
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

  createDashboardStream(): Observable<MessageEvent> {
    return merge(
      of<MessageEvent>({
        id: this.buildEventId('connected'),
        type: 'connected',
        data: {
          occurred_at: new Date().toISOString(),
        },
      }),
      this.dashboardEvents.pipe(
        map((event): MessageEvent => ({
          id: event.event_id,
          type: 'dashboard.refresh',
          data: event,
        })),
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
