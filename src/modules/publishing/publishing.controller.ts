import {
  Controller, Get, Post, Param, UseGuards, Body, Headers,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiBody, ApiHeader } from '@nestjs/swagger';
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
  @ApiOperation({ summary: 'Validate current draft (owner/manager)' })
  validate(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.publishingService.validate(id, userId);
  }

  @Post('publish')
  @ApiOperation({
    summary: 'Validate, compile, and publish (or accept client-compiled PublishedApp)',
  })
  @ApiHeader({ name: 'idempotency-key', required: false })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        manifest: {
          type: 'object',
          description: 'Client-compiled PublishedApp 1.0.0 (optional — if omitted, compiles from drafts)',
        },
        version: { type: 'string', description: 'Requested version string (optional)' },
      },
    },
  })
  publish(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Body() body?: { manifest?: any; version?: string },
  ) {
    return this.publishingService.publish(id, userId, {
      manifest: body?.manifest,
      version: body?.version,
      idempotencyKey: idempotencyKey || undefined,
    });
  }

  @Get('releases')
  @ApiOperation({ summary: 'Get release history (owner/manager)' })
  getReleases(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.publishingService.getReleaseHistory(id, userId);
  }

  @Get('releases/:version')
  @ApiOperation({ summary: 'Get specific release (owner/manager, non-draft)' })
  getRelease(
    @Param('id') id: string,
    @Param('version') version: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.publishingService.getRelease(id, version, userId);
  }

  @Post('rollback/:version')
  @ApiOperation({ summary: 'Rollback to a previous version (owner/manager)' })
  rollback(
    @Param('id') id: string,
    @Param('version') version: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.publishingService.rollback(id, version, userId);
  }

  @Get('draft')
  @ApiOperation({ summary: 'Get current draft state (owner/manager)' })
  getDraft(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.publishingService.getCurrentDraft(id, userId);
  }
}
