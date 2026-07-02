import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { getAccessActor } from '../auth/access-actor.util';
import { MfaEnrollmentGuard } from '../auth/mfa-enrollment.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { AuthenticatedRequest } from '../common/authenticated-request.type';
import { MetricsHistoryQueryDto } from './dto/metrics-history-query.dto';
import { MetricsHistoryService } from './metrics-history.service';

@UseGuards(SessionAuthGuard, MfaEnrollmentGuard, PermissionsGuard)
@Controller('api/v1/nodes/:nodeId/metrics')
export class MetricsHistoryController {
  constructor(private readonly metricsHistoryService: MetricsHistoryService) {}

  @Get('history')
  @RequirePermissions('firewalls.view')
  getHistory(
    @Param('nodeId') nodeId: string,
    @Query() query: MetricsHistoryQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.metricsHistoryService.getNodeHistory(
      getAccessActor(request),
      nodeId,
      query.period,
    );
  }
}
