import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { IntegrationsService } from './integrations.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TenantResolverService } from '../../shared/tenant/tenant-resolver.service';

@ApiTags('Integrations - App (Tenant Self-Service)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'app/integrations', version: '1' })
export class IntegrationsAppController {
  constructor(
    private readonly integrationsService: IntegrationsService,
    private readonly tenantResolver: TenantResolverService,
  ) {}

  private async getTenantId(userId: string): Promise<string> {
    return this.tenantResolver.resolveTenantId(userId);
  }

  @Post('connect')
  @ApiOperation({ summary: 'Connect an integration provider for current tenant' })
  async connect(@CurrentUser('id') userId: string, @Body() data: { provider: string; config: Record<string, any> }) {
    const tenantId = await this.getTenantId(userId);
    return this.integrationsService.connect(tenantId, data.provider, data.config);
  }

  @Post(':provider/disconnect')
  @ApiOperation({ summary: 'Disconnect an integration for current tenant' })
  async disconnect(@CurrentUser('id') userId: string, @Param('provider') provider: string) {
    const tenantId = await this.getTenantId(userId);
    return this.integrationsService.disconnect(tenantId, provider);
  }

  @Post(':provider/test')
  @ApiOperation({ summary: 'Test integration connection for current tenant' })
  async testConnection(@CurrentUser('id') userId: string, @Param('provider') provider: string) {
    const tenantId = await this.getTenantId(userId);
    return this.integrationsService.testConnection(tenantId, provider);
  }

  @Post(':provider/sync')
  @ApiOperation({ summary: 'Trigger a data sync for current tenant' })
  @ApiQuery({ name: 'type', required: false, description: 'full | incremental' })
  async sync(@CurrentUser('id') userId: string, @Param('provider') provider: string, @Query('type') type?: string) {
    const tenantId = await this.getTenantId(userId);
    return this.integrationsService.sync(tenantId, provider, type);
  }

  @Post('webhook')
  @ApiOperation({ summary: 'Queue an outgoing webhook for current tenant' })
  async queueWebhook(@CurrentUser('id') userId: string, @Body() data: {
    eventType: string; payload: any; url: string; headers?: Record<string, string>;
  }) {
    const tenantId = await this.getTenantId(userId);
    return this.integrationsService.queueWebhook(tenantId, data.eventType, data.payload, data.url, data.headers);
  }

  @Post('webhooks/process')
  @ApiOperation({ summary: 'Process pending outgoing webhooks' })
  async processPendingWebhooks() {
    return this.integrationsService.processPendingWebhooks();
  }
}