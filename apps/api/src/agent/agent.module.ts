import { Module } from '@nestjs/common';
import { PackageReleaseRateLimitGuard } from '../common/package-release-rate-limit.guard';
import { PackageReleaseService } from '../common/package-release.service';
import { AgentReleaseController } from './agent-release.controller';

@Module({
  controllers: [AgentReleaseController],
  providers: [PackageReleaseService, PackageReleaseRateLimitGuard],
})
export class AgentModule {}
