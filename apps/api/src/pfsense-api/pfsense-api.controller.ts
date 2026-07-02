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
import {
  ApplyAliasChangeDto,
  PreviewAliasChangeDto,
} from './dto/pfsense-api.dto';
import { PfsenseApiService } from './pfsense-api.service';

@UseGuards(SessionAuthGuard, MfaEnrollmentGuard, PermissionsGuard)
@Controller('api/v1/nodes/:id/pfsense-api')
export class PfsenseApiController {
  constructor(
    private readonly pfsenseApiService: PfsenseApiService,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  @Get('status')
  @RequirePermissions('pfsense.api.view')
  getStatus() {
    return this.pfsenseApiService.getStatus();
  }

  @Get('aliases')
  @RequirePermissions('pfsense.alias.view')
  async listAliases(
    @Param('id') nodeId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.accessPolicy.assertNodeAccess(getAccessActor(request), nodeId);
    return this.pfsenseApiService.listAliases(
      nodeId,
      request.auth!.userId,
      resolveClientIp(request),
    );
  }

  @Get('aliases/compare-backup')
  @RequirePermissions('pfsense.alias.view')
  async compareAliases(
    @Param('id') nodeId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.accessPolicy.assertNodeAccess(getAccessActor(request), nodeId);
    return this.pfsenseApiService.compareAliasesWithBackup(
      nodeId,
      request.auth!.userId,
      resolveClientIp(request),
    );
  }

  @Post('aliases/preview')
  @RequirePermissions('pfsense.alias.manage')
  async previewAlias(
    @Param('id') nodeId: string,
    @Body() body: PreviewAliasChangeDto,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.accessPolicy.assertNodeAccess(getAccessActor(request), nodeId);
    return this.pfsenseApiService.previewAliasChange(
      nodeId,
      body,
      request.auth!.userId,
      resolveClientIp(request),
    );
  }

  @Post('aliases/apply')
  @RequirePermissions('pfsense.alias.apply')
  async applyAlias(
    @Param('id') nodeId: string,
    @Body() body: ApplyAliasChangeDto,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.accessPolicy.assertNodeAccess(getAccessActor(request), nodeId);
    return this.pfsenseApiService.applyAliasChange(
      nodeId,
      body,
      request.auth!.userId,
      resolveClientIp(request),
    );
  }
}
