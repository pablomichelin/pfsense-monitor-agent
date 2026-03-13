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
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { AuthenticatedRequest } from '../common/authenticated-request.type';
import { RawBodyRequest } from '../common/raw-body-request.type';
import { AlertsService } from './alerts.service';
import { ListAlertsQueryDto } from './dto/list-alerts-query.dto';
import { ResolveAlertDto } from './dto/resolve-alert.dto';

@Roles(UserRole.superadmin, UserRole.admin, UserRole.operator, UserRole.readonly)
@UseGuards(SessionAuthGuard, RolesGuard)
@Controller('api/v1/alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  listAlerts(@Query() query: ListAlertsQueryDto) {
    return this.alertsService.listAlerts(query);
  }

  @Post(':id/acknowledge')
  @Roles(UserRole.superadmin, UserRole.admin, UserRole.operator)
  acknowledgeAlert(
    @Param('id') id: string,
    @Req() request: RawBodyRequest & AuthenticatedRequest,
    @Headers('cf-connecting-ip') cfConnectingIp?: string,
  ) {
    return this.alertsService.acknowledgeAlert(
      id,
      {
        userId: request.auth?.userId,
        email: request.auth?.email,
      },
      cfConnectingIp ?? request.ip,
    );
  }

  @Post(':id/resolve')
  @Roles(UserRole.superadmin, UserRole.admin, UserRole.operator)
  resolveAlert(
    @Param('id') id: string,
    @Body() body: ResolveAlertDto,
    @Req() request: RawBodyRequest & AuthenticatedRequest,
    @Headers('cf-connecting-ip') cfConnectingIp?: string,
  ) {
    return this.alertsService.resolveAlert(
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
