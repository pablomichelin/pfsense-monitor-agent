import {
  Controller,
  Get,
  NotFoundException,
  Res,
  UseGuards,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';
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

  @Get('package-artifact')
  @UseGuards(PackageReleaseRateLimitGuard)
  async downloadPackageArtifact(@Res() reply: FastifyReply) {
    try {
      this.packageRelease.assertArtifactMatchesConfig();
      const artifact = this.packageRelease.openArtifactStream();
      return reply
        .header('content-type', 'application/gzip')
        .header('content-length', String(artifact.size))
        .header(
          'content-disposition',
          `attachment; filename="${artifact.filename}"`,
        )
        .send(artifact.stream);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw error;
    }
  }
}
