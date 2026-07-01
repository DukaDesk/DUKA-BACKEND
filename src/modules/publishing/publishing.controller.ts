import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PublishingService } from './publishing.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Publishing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'tenants/:id/publishing', version: '1' })
export class PublishingController {
  constructor(private readonly publishingService: PublishingService) {}

  @Post('validate')
  @ApiOperation({ summary: 'Validate current draft' })
  validate(@Param('id') id: string) {
    return this.publishingService.validate(id);
  }

  @Post('publish')
  @ApiOperation({ summary: 'Validate, compile, and publish' })
  publish(@Param('id') id: string) {
    return this.publishingService.publish(id);
  }

  @Get('releases')
  @ApiOperation({ summary: 'Get release history' })
  getReleases(@Param('id') id: string) {
    return this.publishingService.getReleaseHistory(id);
  }

  @Get('releases/:version')
  @ApiOperation({ summary: 'Get specific release' })
  getRelease(@Param('id') id: string, @Param('version') version: string) {
    return this.publishingService.getRelease(id, version);
  }

  @Post('rollback/:version')
  @ApiOperation({ summary: 'Rollback to a previous version' })
  rollback(@Param('id') id: string, @Param('version') version: string) {
    return this.publishingService.rollback(id, version);
  }

  @Get('draft')
  @ApiOperation({ summary: 'Get current draft state' })
  getDraft(@Param('id') id: string) {
    return this.publishingService.getCurrentDraft(id);
  }
}
