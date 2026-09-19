import { Controller, Get, Post, Param, UseGuards, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiBody } from '@nestjs/swagger';
import { PublishingService } from './publishing.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Publishing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'merchants/:id/publishing', version: '1' })
export class PublishingController {
  constructor(private readonly publishingService: PublishingService) {}

  @Post('validate')
  @ApiOperation({ summary: 'Validate current draft' })
  validate(@Param('id') id: string) {
    return this.publishingService.validate(id);
  }

  @Post('publish')
  @ApiOperation({ summary: 'Validate, compile, and publish (or accept client-compiled manifest)' })
  @ApiBody({ schema: {
    type: 'object',
    properties: {
      manifest: { type: 'object', description: 'Client-compiled manifest (optional — if omitted, compiles from drafts)' },
      version: { type: 'string', description: 'Requested version string (optional)' },
    },
  }})
  publish(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() body?: { manifest?: any; version?: string },
  ) {
    return this.publishingService.publish(id, userId, body);
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
