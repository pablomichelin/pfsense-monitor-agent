import {
  Controller,
  Get,
  Header,
  MessageEvent,
  Req,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { getAccessActor } from '../auth/access-actor.util';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { AuthenticatedRequest } from '../common/authenticated-request.type';
import { RealtimeService } from '../realtime/realtime.service';
import { DashboardService } from './dashboard.service';

@UseGuards(SessionAuthGuard, PermissionsGuard)
@Controller('api/v1/dashboard')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly realtimeService: RealtimeService,
  ) {}

  @Get('summary')
  @RequirePermissions('firewalls.view')
  getSummary(@Req() request: AuthenticatedRequest) {
    return this.dashboardService.getSummary(getAccessActor(request));
  }

  @Sse('events')
  @Header('Cache-Control', 'no-cache, no-transform')
  @Header('X-Accel-Buffering', 'no')
  streamEvents(): Observable<MessageEvent> {
    return this.realtimeService.createDashboardStream();
  }
}
