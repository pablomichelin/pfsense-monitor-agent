import {
  Body,
  Controller,
  Delete,
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
  RotatePfrestCredentialDto,
  UpsertPfrestCredentialDto,
} from './dto/node-capabilities.dto';
import { NodeCapabilitiesService } from './node-capabilities.service';

@UseGuards(SessionAuthGuard, MfaEnrollmentGuard, PermissionsGuard)
@Controller('api/v1/nodes/:id/capabilities')
export class NodeCapabilitiesController {
  constructor(
    private readonly capabilitiesService: NodeCapabilitiesService,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  @Get()
  @RequirePermissions('pfsense.api.view')
  async getCapabilities(
    @Param('id') nodeId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.accessPolicy.assertNodeAccess(getAccessActor(request), nodeId);
    return this.capabilitiesService.getNodeCapabilities(nodeId);
  }

  @Post('credentials/pfrest')
  @RequirePermissions('pfsense.credentials.manage')
  async upsertCredential(
    @Param('id') nodeId: string,
    @Body() body: UpsertPfrestCredentialDto,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.accessPolicy.assertNodeAccess(getAccessActor(request), nodeId);
    return this.capabilitiesService.upsertPfrestCredential(
      nodeId,
      request.auth!.userId,
      body,
      resolveClientIp(request),
    );
  }

  @Post('credentials/pfrest/rotate')
  @RequirePermissions('pfsense.credentials.manage')
  async rotateCredential(
    @Param('id') nodeId: string,
    @Body() body: RotatePfrestCredentialDto,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.accessPolicy.assertNodeAccess(getAccessActor(request), nodeId);
    return this.capabilitiesService.rotatePfrestCredential(
      nodeId,
      request.auth!.userId,
      body,
      resolveClientIp(request),
    );
  }

  @Delete('credentials/pfrest')
  @RequirePermissions('pfsense.credentials.manage')
  async revokeCredential(
    @Param('id') nodeId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.accessPolicy.assertNodeAccess(getAccessActor(request), nodeId);
    return this.capabilitiesService.revokePfrestCredential(
      nodeId,
      request.auth!.userId,
      resolveClientIp(request),
    );
  }

  @Post('credentials/pfrest/test')
  @RequirePermissions('pfsense.credentials.manage')
  async testCredential(
    @Param('id') nodeId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.accessPolicy.assertNodeAccess(getAccessActor(request), nodeId);
    return this.capabilitiesService.testPfrestCredential(
      nodeId,
      request.auth!.userId,
      resolveClientIp(request),
    );
  }
}

@UseGuards(SessionAuthGuard, MfaEnrollmentGuard, PermissionsGuard)
@Controller('api/v1/node-capabilities')
export class NodeCapabilitiesStatusController {
  constructor(private readonly capabilitiesService: NodeCapabilitiesService) {}

  @Get('status')
  @RequirePermissions('pfsense.api.view')
  getStatus() {
    return this.capabilitiesService.getStatus();
  }
}
