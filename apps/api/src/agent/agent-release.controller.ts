import { Controller, Get, UseGuards } from '@nestjs/common';
import { PackageReleaseRateLimitGuard } from '../common/package-release-rate-limit.guard';
import { PackageReleaseService } from '../common/package-release.service';

@Controller('api/v1/agent')
export class AgentReleaseController {
  constructor(private readonly packageRelease: PackageReleaseService) {}

  @Get('package-release')
  @UseGuards(PackageReleaseRateLimitGuard)
  getPackageRelease() {
    return this.packageRelease.getPackageRelease();
  }
}
