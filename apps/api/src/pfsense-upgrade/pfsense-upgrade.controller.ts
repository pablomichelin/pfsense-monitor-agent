import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { getAccessActor } from '../auth/access-actor.util';
import { AccessPolicyService } from '../auth/access-policy.service';
import { MfaEnrollmentGuard } from '../auth/mfa-enrollment.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { AuthenticatedRequest } from '../common/authenticated-request.type';
import { resolveClientIp } from '../common/client-ip';
import { PermissionsService } from '../auth/permissions.service';
import { PfsenseUpgradeRequestDto } from './dto/pfsense-upgrade-request.dto';
import { PfsenseUpgradeService } from './pfsense-upgrade.service';

@UseGuards(SessionAuthGuard, MfaEnrollmentGuard, PermissionsGuard)
@Controller('api/v1/nodes/:id/pfsense-upgrade')
export class PfsenseUpgradeController {
  constructor(
    private readonly upgradeService: PfsenseUpgradeService,
    private readonly accessPolicy: AccessPolicyService,
    private readonly permissionsService: PermissionsService,
  ) {}

  @Get('status')
  @RequirePermissions('firewalls.view')
  async getStatus(
    @Param('id') nodeId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.accessPolicy.assertNodeAccess(getAccessActor(request), nodeId);

    const canRunUpgrade = await this.permissionsService.hasPermission(
      request.auth!.role,
      'pfsense.upgrade.run',
    );

    return this.upgradeService.getStatus(nodeId, canRunUpgrade);
  }

  @Post('refresh-check')
  @RequirePermissions('pfsense.upgrade.run')
  async requestRefreshCheck(
    @Param('id') nodeId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.accessPolicy.assertNodeAccess(getAccessActor(request), nodeId);

    return this.upgradeService.requestRefreshCheck(
      nodeId,
      request.auth!.userId,
      resolveClientIp(request),
    );
  }

  @Post('request')
  @RequirePermissions('pfsense.upgrade.run')
  async requestUpgrade(
    @Param('id') nodeId: string,
    @Body() body: PfsenseUpgradeRequestDto,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.accessPolicy.assertNodeAccess(getAccessActor(request), nodeId);

    return this.upgradeService.requestUpgrade(
      nodeId,
      request.auth!.userId,
      body,
      resolveClientIp(request),
    );
  }
}
