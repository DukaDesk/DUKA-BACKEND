import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { DeveloperService } from './developer.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Developer Platform')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ version: '1' })
export class DeveloperController {
  constructor(private readonly devService: DeveloperService) {}

  // ─── Developer Apps ──────────────────────────────────────────

  @Post('developer/apps')
  @ApiOperation({ summary: 'Create developer app' })
  createApp(@Body() data: {
    tenantId: string; name: string; description?: string;
    website?: string; callbackUrls?: string[]; scopes?: string[];
    createdBy?: string; logoUrl?: string;
  }) {
    return this.devService.createApp(data);
  }

  @Get('developer/apps')
  @ApiOperation({ summary: 'List developer apps' })
  @ApiQuery({ name: 'tenantId', required: true })
  getApps(@Query('tenantId') tenantId: string) {
    return this.devService.getApps(tenantId);
  }

  @Get('developer/apps/:id')
  @ApiOperation({ summary: 'Get developer app' })
  getApp(@Param('id') id: string) {
    return this.devService.getApp(id);
  }

  @Put('developer/apps/:id')
  @ApiOperation({ summary: 'Update developer app' })
  updateApp(@Param('id') id: string, @Body() data: any) {
    return this.devService.updateApp(id, data);
  }

  @Post('developer/apps/:id/regenerate-secret')
  @ApiOperation({ summary: 'Regenerate client secret' })
  regenerateSecret(@Param('id') id: string) {
    return this.devService.regenerateSecret(id);
  }

  @Delete('developer/apps/:id')
  @ApiOperation({ summary: 'Delete developer app' })
  deleteApp(@Param('id') id: string) {
    return this.devService.deleteApp(id);
  }

  // ─── Webhook Endpoints ───────────────────────────────────────

  @Post('developer/webhooks')
  @ApiOperation({ summary: 'Create webhook endpoint' })
  createWebhook(@Body() data: {
    tenantId: string; appId?: string; name: string; url: string;
    events: string[]; secret?: string; retryCount?: number;
    timeoutMs?: number; headers?: Record<string, string>;
  }) {
    return this.devService.createWebhook(data);
  }

  @Get('developer/webhooks')
  @ApiOperation({ summary: 'List webhook endpoints' })
  @ApiQuery({ name: 'tenantId', required: true })
  getWebhooks(@Query('tenantId') tenantId: string) {
    return this.devService.getWebhooks(tenantId);
  }

  @Get('developer/webhooks/:id')
  @ApiOperation({ summary: 'Get webhook endpoint' })
  getWebhook(@Param('id') id: string) {
    return this.devService.getWebhook(id);
  }

  @Put('developer/webhooks/:id')
  @ApiOperation({ summary: 'Update webhook endpoint' })
  updateWebhook(@Param('id') id: string, @Body() data: any) {
    return this.devService.updateWebhook(id, data);
  }

  @Delete('developer/webhooks/:id')
  @ApiOperation({ summary: 'Delete webhook endpoint' })
  deleteWebhook(@Param('id') id: string) {
    return this.devService.deleteWebhook(id);
  }

  @Post('developer/webhooks/:id/trigger')
  @ApiOperation({ summary: 'Test trigger webhook' })
  triggerWebhook(
    @Param('id') id: string,
    @Body() data: { event: string; payload: any },
  ) {
    return this.devService.triggerWebhookById(id, data.event, data.payload);
  }

  // ─── Webhook Logs ────────────────────────────────────────────

  @Get('developer/webhook-logs')
  @ApiOperation({ summary: 'Webhook event logs' })
  getWebhookLogs(
    @Query('endpointId') endpointId?: string,
    @Query('tenantId') tenantId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.devService.getWebhookLogs(
      endpointId, tenantId,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 50,
    );
  }

  @Get('developer/webhooks/:id/retries')
  @ApiOperation({ summary: 'Get failed webhook retries' })
  getRetries(@Param('id') id: string) {
    return this.devService.getWebhookRetries(id);
  }

  // ─── Resources ───────────────────────────────────────────────

  @Get('developer/resources')
  @ApiOperation({ summary: 'API resources and info' })
  getApiResources() {
    return this.devService.getApiResources();
  }

  @Get('developer/rate-limit')
  @ApiOperation({ summary: 'Rate limit status' })
  @ApiQuery({ name: 'tenantId', required: true })
  getRateLimit(@Query('tenantId') tenantId: string) {
    return this.devService.getRateLimitStatus(tenantId);
  }
}
