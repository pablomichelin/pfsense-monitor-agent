import {
  Controller,
  Get,
  Header,
  MessageEvent,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { RealtimeService } from '../realtime/realtime.service';
import { DashboardService } from './dashboard.service';

@UseGuards(SessionAuthGuard)
@Controller('api/v1/dashboard')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly realtimeService: RealtimeService,
  ) {}

  @Get('summary')
  getSummary() {
    return this.dashboardService.getSummary();
  }

  @Sse('events')
  @Header('Cache-Control', 'no-cache, no-transform')
  @Header('X-Accel-Buffering', 'no')
  streamEvents(): Observable<MessageEvent> {
    return this.realtimeService.createDashboardStream();
  }
}
