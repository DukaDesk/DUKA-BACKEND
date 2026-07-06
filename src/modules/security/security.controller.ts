import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { SecurityService } from './security.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Security & Compliance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ version: '1' })
export class SecurityController {
  constructor(private readonly securityService: SecurityService) {}

  // ─── Security Policies ───────────────────────────────────────

  @Get('security/policy/:tenantId')
  @ApiOperation({ summary: 'Get security policy' })
  getPolicy(@Param('tenantId') tenantId: string) {
    return this.securityService.getPolicy(tenantId);
  }

  @Put('security/policy/:tenantId')
  @ApiOperation({ summary: 'Update security policy' })
  updatePolicy(@Param('tenantId') tenantId: string, @Body() data: any) {
    return this.securityService.updatePolicy(tenantId, data);
  }

  @Post('security/validate-password')
  @ApiOperation({ summary: 'Validate password against policy' })
  validatePassword(@Body() data: { password: string; tenantId: string }) {
    return this.securityService.validatePasswordStrength(data.password, data.tenantId);
  }

  // ─── API Keys ────────────────────────────────────────────────

  @Post('security/api-keys')
  @ApiOperation({ summary: 'Create API key' })
  createApiKey(@Body() data: {
    tenantId?: string; userId?: string; name: string;
    scopes?: string[]; expiresAt?: string;
  }) {
    return this.securityService.createApiKey(data);
  }

  @Get('security/api-keys')
  @ApiOperation({ summary: 'List API keys' })
  getApiKeys(
    @Query('tenantId') tenantId?: string,
    @Query('userId') userId?: string,
  ) {
    return this.securityService.getApiKeys(tenantId, userId);
  }

  @Delete('security/api-keys/:id')
  @ApiOperation({ summary: 'Revoke API key' })
  revokeApiKey(@Param('id') id: string) {
    return this.securityService.revokeApiKey(id);
  }

  // ─── Security Events ─────────────────────────────────────────

  @Post('security/events')
  @ApiOperation({ summary: 'Record security event' })
  recordEvent(@Body() data: {
    tenantId?: string; userId?: string; type: string;
    severity?: string; source?: string; ipAddress?: string;
    userAgent?: string; location?: string; details?: Record<string, any>;
    metadata?: Record<string, any>;
  }) {
    return this.securityService.recordEvent(data);
  }

  @Get('security/events')
  @ApiOperation({ summary: 'Get security events' })
  getSecurityEvents(
    @Query('tenantId') tenantId?: string,
    @Query('type') type?: string,
    @Query('severity') severity?: string,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.securityService.getSecurityEvents(tenantId, {
      type, severity, userId, from, to,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
    });
  }

  @Get('security/summary')
  @ApiOperation({ summary: 'Security summary' })
  getSummary(@Query('tenantId') tenantId?: string) {
    return this.securityService.getSecuritySummary(tenantId);
  }

  // ─── Consent Audits ──────────────────────────────────────────

  @Post('security/consent')
  @ApiOperation({ summary: 'Record consent action' })
  recordConsent(@Body() data: {
    tenantId?: string; userId: string; action: string;
    consentType: string; granted: boolean; ipAddress?: string; userAgent?: string;
  }) {
    return this.securityService.recordConsent(data);
  }

  @Get('security/consent/:userId')
  @ApiOperation({ summary: 'Get consent history' })
  getConsentHistory(@Param('userId') userId: string) {
    return this.securityService.getConsentHistory(userId);
  }
}
