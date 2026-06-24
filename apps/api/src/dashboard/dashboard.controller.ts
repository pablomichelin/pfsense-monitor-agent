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
import { AccessPolicyService } from '../auth/access-policy.service';
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
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  @Get('summary')
  @RequirePermissions('firewalls.view')
  getSummary(@Req() request: AuthenticatedRequest) {
    return this.dashboardService.getSummary(getAccessActor(request));
  }

  @Sse('events')
  @RequirePermissions('firewalls.view')
  @Header('Cache-Control', 'no-cache, no-transform')
  @Header('X-Accel-Buffering', 'no')
  async streamEvents(
    @Req() request: AuthenticatedRequest,
  ): Promise<Observable<MessageEvent>> {
    // D1: resolve o escopo do usuario e filtra a stream por allowedClientIds.
    const allowedClientIds = await this.accessPolicy.getAllowedClientIds(
      getAccessActor(request),
    );
    return this.realtimeService.createDashboardStream(allowedClientIds);
  }
}
