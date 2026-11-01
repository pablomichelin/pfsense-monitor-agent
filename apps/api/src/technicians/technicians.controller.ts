import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { TechnicianStatus } from '@prisma/client';
import { getAccessActor } from '../auth/access-actor.util';
import { MfaEnrollmentGuard } from '../auth/mfa-enrollment.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { AuthenticatedRequest } from '../common/authenticated-request.type';
import { resolveClientIp } from '../common/client-ip';
import {
  CreateTechnicianDto,
  DeleteTechnicianRegistryDto,
  FleetRevokeTechnicianDto,
} from './dto/technicians.dto';
import { TechniciansService } from './technicians.service';

@UseGuards(SessionAuthGuard, MfaEnrollmentGuard, PermissionsGuard)
@Controller('api/v1/technicians')
export class TechniciansController {
  constructor(private readonly techniciansService: TechniciansService) {}

  @Get()
  @RequirePermissions('technicians.view')
  async list(@Req() request: AuthenticatedRequest, @Query('status') status?: string) {
    const actor = getAccessActor(request);
    // Default: só ativos — removidos do cadastro não poluem a matriz.
    if (status === 'all') {
      return this.techniciansService.listTechnicians(actor, 'all');
    }
    if (status === TechnicianStatus.revoked) {
      return this.techniciansService.listTechnicians(actor, TechnicianStatus.revoked);
    }
    return this.techniciansService.listTechnicians(actor, TechnicianStatus.active);
  }

  @Post()
  @RequirePermissions('technicians.manage')
  async create(
    @Body() body: CreateTechnicianDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.techniciansService.createTechnician(
      request.auth!.userId,
      body,
      getAccessActor(request),
      resolveClientIp(request),
    );
  }

  @Get(':id')
  @RequirePermissions('technicians.view')
  async getById(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.techniciansService.getTechnician(id, getAccessActor(request));
  }

  @Delete(':id')
  @RequirePermissions('technicians.manage')
  async revokeFromRegistry(
    @Param('id') id: string,
    @Body() body: DeleteTechnicianRegistryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.techniciansService.revokeTechnicianFromRegistry(
      request.auth!.userId,
      id,
      body.confirm_login_username,
      getAccessActor(request),
      resolveClientIp(request),
    );
  }

  @Post(':id/revoke-fleet')
  @RequirePermissions('technicians.manage')
  async revokeFleet(
    @Param('id') id: string,
    @Body() body: FleetRevokeTechnicianDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.techniciansService.createFleetRevoke(
      request.auth!.userId,
      id,
      body,
      getAccessActor(request),
      resolveClientIp(request),
    );
  }
}
