import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { getAccessActor } from '../auth/access-actor.util';
import { AccessPolicyService } from '../auth/access-policy.service';
import { MfaEnrollmentGuard } from '../auth/mfa-enrollment.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { AuthenticatedRequest } from '../common/authenticated-request.type';
import { resolveClientIp } from '../common/client-ip';
import { CreatePackageUpgradeBatchDto } from './dto/package-upgrade-batch.dto';
import { PackageUpgradeService } from './package-upgrade.service';

@UseGuards(SessionAuthGuard, MfaEnrollmentGuard, PermissionsGuard)
@Controller('api/v1/package-upgrade')
export class PackageUpgradeBatchController {
  constructor(
    private readonly upgradeService: PackageUpgradeService,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  @Post('batch')
  @RequirePermissions('package.upgrade.run')
  async createBatch(
    @Body() body: CreatePackageUpgradeBatchDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const actor = getAccessActor(request);

    for (const nodeId of body.node_ids) {
      await this.accessPolicy.assertNodeAccess(actor, nodeId);
    }

    return this.upgradeService.createUpgradeBatch(
      request.auth!.userId,
      body,
      resolveClientIp(request),
    );
  }
}
