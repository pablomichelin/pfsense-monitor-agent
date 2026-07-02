import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { getAccessActor } from '../auth/access-actor.util';
import { MfaEnrollmentGuard } from '../auth/mfa-enrollment.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { AuthenticatedRequest } from '../common/authenticated-request.type';
import { resolveClientIp } from '../common/client-ip';
import {
  CreateNotificationChannelDto,
  CreateNotificationRuleDto,
  ListNotificationDeliveriesQueryDto,
  UpdateNotificationChannelDto,
  UpdateNotificationRuleDto,
} from './dto/notifications.dto';
import {
  NotificationsService,
} from './notifications.service';

@UseGuards(SessionAuthGuard, MfaEnrollmentGuard, PermissionsGuard)
@Controller('api/v1/notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
  ) {}

  @Get('status')
  @RequirePermissions('notifications.view')
  getStatus() {
    return this.notificationsService.getStatus();
  }

  @Get('channels')
  @RequirePermissions('notifications.view')
  listChannels() {
    return this.notificationsService.listChannels();
  }

  @Post('channels')
  @RequirePermissions('notifications.manage')
  createChannel(
    @Body() body: CreateNotificationChannelDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.notificationsService.createChannel(
      body,
      {
        userId: request.auth?.userId,
        email: request.auth?.email,
      },
      resolveClientIp(request),
    );
  }

  @Patch('channels/:id')
  @RequirePermissions('notifications.manage')
  updateChannel(
    @Param('id') id: string,
    @Body() body: UpdateNotificationChannelDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.notificationsService.updateChannel(
      id,
      body,
      {
        userId: request.auth?.userId,
        email: request.auth?.email,
      },
      resolveClientIp(request),
    );
  }

  @Delete('channels/:id')
  @RequirePermissions('notifications.manage')
  deleteChannel(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.notificationsService.deleteChannel(
      id,
      {
        userId: request.auth?.userId,
        email: request.auth?.email,
      },
      resolveClientIp(request),
    );
  }

  @Post('channels/:id/test')
  @RequirePermissions('notifications.test')
  testChannel(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.notificationsService.testChannel(
      id,
      {
        userId: request.auth?.userId,
        email: request.auth?.email,
      },
      resolveClientIp(request),
    );
  }

  @Get('rules')
  @RequirePermissions('notifications.view')
  listRules() {
    return this.notificationsService.listRules();
  }

  @Post('rules')
  @RequirePermissions('notifications.manage')
  createRule(
    @Body() body: CreateNotificationRuleDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.notificationsService.createRule(
      body,
      {
        userId: request.auth?.userId,
        email: request.auth?.email,
      },
      resolveClientIp(request),
    );
  }

  @Patch('rules/:id')
  @RequirePermissions('notifications.manage')
  updateRule(
    @Param('id') id: string,
    @Body() body: UpdateNotificationRuleDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.notificationsService.updateRule(
      id,
      body,
      {
        userId: request.auth?.userId,
        email: request.auth?.email,
      },
      resolveClientIp(request),
    );
  }

  @Delete('rules/:id')
  @RequirePermissions('notifications.manage')
  deleteRule(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.notificationsService.deleteRule(
      id,
      {
        userId: request.auth?.userId,
        email: request.auth?.email,
      },
      resolveClientIp(request),
    );
  }

  @Get('deliveries')
  @RequirePermissions('notifications.view')
  listDeliveries(@Query() query: ListNotificationDeliveriesQueryDto) {
    return this.notificationsService.listDeliveries(query.alert_id);
  }
}
