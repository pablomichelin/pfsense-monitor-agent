import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { getAccessActor } from '../auth/access-actor.util';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { AuthenticatedRequest } from '../common/authenticated-request.type';
import { RawBodyRequest } from '../common/raw-body-request.type';
import { AlertsService } from './alerts.service';
import { ListAlertsQueryDto } from './dto/list-alerts-query.dto';
import { ResolveAlertDto } from './dto/resolve-alert.dto';

@UseGuards(SessionAuthGuard, PermissionsGuard)
@Controller('api/v1/alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  @RequirePermissions('alerts.view')
  listAlerts(
    @Query() query: ListAlertsQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.alertsService.listAlerts(getAccessActor(request), query);
  }

  @Post(':id/acknowledge')
  @RequirePermissions('alerts.acknowledge')
  acknowledgeAlert(
    @Param('id') id: string,
    @Req() request: RawBodyRequest & AuthenticatedRequest,
    @Headers('cf-connecting-ip') cfConnectingIp?: string,
  ) {
    return this.alertsService.acknowledgeAlert(
      getAccessActor(request),
      id,
      {
        userId: request.auth?.userId,
        email: request.auth?.email,
      },
      cfConnectingIp ?? request.ip,
    );
  }

  @Post(':id/resolve')
  @RequirePermissions('alerts.resolve')
  resolveAlert(
    @Param('id') id: string,
    @Body() body: ResolveAlertDto,
    @Req() request: RawBodyRequest & AuthenticatedRequest,
    @Headers('cf-connecting-ip') cfConnectingIp?: string,
  ) {
    return this.alertsService.resolveAlert(
      getAccessActor(request),
      id,
      body,
      {
        userId: request.auth?.userId,
        email: request.auth?.email,
      },
      cfConnectingIp ?? request.ip,
    );
  }
}
