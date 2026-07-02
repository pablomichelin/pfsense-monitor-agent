import {
  Body,
  Controller,
  Get,
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
import { PackageUpgradeRequestDto } from './dto/package-upgrade-request.dto';
import { PackageUpgradeService } from './package-upgrade.service';

@UseGuards(SessionAuthGuard, MfaEnrollmentGuard, PermissionsGuard)
@Controller('api/v1/nodes/:id/package-upgrade')
export class PackageUpgradeController {
  constructor(
    private readonly upgradeService: PackageUpgradeService,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  @Get('status')
  @RequirePermissions('firewalls.view')
  async getStatus(
    @Param('id') nodeId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.accessPolicy.assertNodeAccess(getAccessActor(request), nodeId);
    return this.upgradeService.getStatus(nodeId);
  }

  @Post('request')
  @RequirePermissions('package.upgrade.run')
  async requestUpgrade(
    @Param('id') nodeId: string,
    @Body() body: PackageUpgradeRequestDto,
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
