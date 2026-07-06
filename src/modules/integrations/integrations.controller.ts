import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { IntegrationsService } from './integrations.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Integrations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ version: '1' })
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Get('integrations/available')
  @ApiOperation({ summary: 'List available integration connectors' })
  getAvailableConnectors() {
    return this.integrationsService.getAvailableConnectors();
  }

  @Post('tenants/:tenantId/integrations/connect')
  @ApiOperation({ summary: 'Connect an integration provider' })
  connect(
    @Param('tenantId') tenantId: string,
    @Body() data: { provider: string; config: Record<string, any> },
  ) {
    return this.integrationsService.connect(tenantId, data.provider, data.config);
  }

  @Post('tenants/:tenantId/integrations/:provider/disconnect')
  @ApiOperation({ summary: 'Disconnect an integration' })
  disconnect(@Param('tenantId') tenantId: string, @Param('provider') provider: string) {
    return this.integrationsService.disconnect(tenantId, provider);
  }

  @Get('tenants/:tenantId/integrations')
  @ApiOperation({ summary: 'List connected integrations' })
  getConnectors(@Param('tenantId') tenantId: string) {
    return this.integrationsService.getConnectors(tenantId);
  }

  @Get('tenants/:tenantId/integrations/:provider')
  @ApiOperation({ summary: 'Get integration details' })
  getConnector(@Param('tenantId') tenantId: string, @Param('provider') provider: string) {
    return this.integrationsService.getConnector(tenantId, provider);
  }

  @Post('tenants/:tenantId/integrations/:provider/test')
  @ApiOperation({ summary: 'Test integration connection' })
  testConnection(@Param('tenantId') tenantId: string, @Param('provider') provider: string) {
    return this.integrationsService.testConnection(tenantId, provider);
  }

  @Post('tenants/:tenantId/integrations/:provider/sync')
  @ApiOperation({ summary: 'Trigger a data sync' })
  @ApiQuery({ name: 'type', required: false, description: 'full | incremental' })
  sync(
    @Param('tenantId') tenantId: string,
    @Param('provider') provider: string,
    @Query('type') type?: string,
  ) {
    return this.integrationsService.sync(tenantId, provider, type);
  }

  @Get('tenants/:tenantId/integrations/:provider/sync-history')
  @ApiOperation({ summary: 'Get sync job history' })
  getSyncHistory(@Param('tenantId') tenantId: string, @Param('provider') provider: string) {
    return this.integrationsService.getSyncHistory(tenantId, provider);
  }

  @Post('tenants/:tenantId/integrations/webhook')
  @ApiOperation({ summary: 'Queue an outgoing webhook' })
  queueWebhook(
    @Param('tenantId') tenantId: string,
    @Body() data: { eventType: string; payload: any; url: string; headers?: Record<string, string> },
  ) {
    return this.integrationsService.queueWebhook(tenantId, data.eventType, data.payload, data.url, data.headers);
  }

  @Post('integrations/webhooks/process')
  @ApiOperation({ summary: 'Process pending outgoing webhooks' })
  processPendingWebhooks() {
    return this.integrationsService.processPendingWebhooks();
  }
}
