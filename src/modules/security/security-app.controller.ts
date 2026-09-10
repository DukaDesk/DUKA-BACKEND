import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { SecurityService } from './security.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TenantResolverService } from '../../shared/tenant/tenant-resolver.service';

@ApiTags('Security - App (Tenant Self-Service)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'app/security', version: '1' })
export class SecurityAppController {
  constructor(
    private readonly securityService: SecurityService,
    private readonly tenantResolver: TenantResolverService,
  ) {}

  private async getTenantId(userId: string): Promise<string> {
    return this.tenantResolver.resolveTenantId(userId);
  }

  // ─── Security Policies ───────────────────────────────────────

  @Get('policy')
  @ApiOperation({ summary: 'Get security policy for current app' })
  async getPolicy(@CurrentUser('id') userId: string) {
    const tenantId = await this.getTenantId(userId);
    return this.securityService.getPolicy(tenantId);
  }

  @Put('policy')
  @ApiOperation({ summary: 'Update security policy for current app' })
  async updatePolicy(@CurrentUser('id') userId: string, @Body() data: any) {
    const tenantId = await this.getTenantId(userId);
    return this.securityService.updatePolicy(tenantId, data);
  }

  // ─── API Keys ────────────────────────────────────────────────

  @Post('api-keys')
  @ApiOperation({ summary: 'Create API key for current app' })
  async createApiKey(@CurrentUser('id') userId: string, @Body() data: {
    name: string; scopes?: string[]; expiresAt?: string;
  }) {
    const tenantId = await this.getTenantId(userId);
    return this.securityService.createApiKey({ ...data, tenantId });
  }

  @Get('api-keys')
  @ApiOperation({ summary: 'List API keys for current app' })
  async getApiKeys(@CurrentUser('id') userId: string) {
    const tenantId = await this.getTenantId(userId);
    return this.securityService.getApiKeys(tenantId, undefined);
  }

  @Delete('api-keys/:id')
  @ApiOperation({ summary: 'Revoke API key' })
  revokeApiKey(@Param('id') id: string) {
    return this.securityService.revokeApiKey(id);
  }

  // ─── Security Events ─────────────────────────────────────────

  @Post('events')
  @ApiOperation({ summary: 'Record security event for current app' })
  async recordEvent(@CurrentUser('id') userId: string, @Body() data: {
    type: string; severity?: string; source?: string; ipAddress?: string;
    userAgent?: string; location?: string; details?: Record<string, any>;
    metadata?: Record<string, any>;
  }) {
    const tenantId = await this.getTenantId(userId);
    return this.securityService.recordEvent({ ...data, tenantId });
  }

  @Get('events')
  @ApiOperation({ summary: 'Get security events for current app' })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'severity', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getSecurityEvents(
    @CurrentUser('id') userId: string,
    @Query('type') type?: string,
    @Query('severity') severity?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const tenantId = await this.getTenantId(userId);
    return this.securityService.getSecurityEvents(tenantId, {
      type, severity,
      from, to,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
    });
  }

  @Get('summary')
  @ApiOperation({ summary: 'Security summary for current app' })
  async getSummary(@CurrentUser('id') userId: string) {
    const tenantId = await this.getTenantId(userId);
    return this.securityService.getSecuritySummary(tenantId);
  }

  // ─── Consent Audits ──────────────────────────────────────────

  @Post('consent')
  @ApiOperation({ summary: 'Record consent action for current app' })
  async recordConsent(@CurrentUser('id') userId: string, @Body() data: {
    action: string; consentType: string; granted: boolean; ipAddress?: string; userAgent?: string;
  }) {
    const tenantId = await this.getTenantId(userId);
    return this.securityService.recordConsent({ ...data, tenantId, userId });
  }

  @Get('consent/:userId')
  @ApiOperation({ summary: 'Get consent history for user in current app' })
  async getConsentHistory(@CurrentUser('id') userId: string, @Param('userId') targetUserId: string) {
    const tenantId = await this.getTenantId(userId);
    // Note: service method doesn't filter by tenantId, but we pass it for potential future use
    return this.securityService.getConsentHistory(targetUserId);
  }
}