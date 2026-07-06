import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { InfrastructureService } from './infrastructure.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Infrastructure & DevOps')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ version: '1' })
export class InfrastructureController {
  constructor(private readonly infraService: InfrastructureService) {}

  // ─── Deployments ─────────────────────────────────────────────

  @Post('infra/deployments')
  @ApiOperation({ summary: 'Create a deployment' })
  createDeployment(@Body() data: {
    tenantId: string; version: string; branch?: string;
    commitHash?: string; triggeredBy?: string; metadata?: Record<string, any>;
  }) {
    return this.infraService.createDeployment(data);
  }

  @Get('infra/deployments')
  @ApiOperation({ summary: 'List deployments' })
  @ApiQuery({ name: 'tenantId', required: true })
  getDeployments(
    @Query('tenantId') tenantId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.infraService.getDeployments(
      tenantId,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
    );
  }

  @Get('infra/deployments/:id')
  @ApiOperation({ summary: 'Get deployment details' })
  getDeployment(@Param('id') id: string) {
    return this.infraService.getDeployment(id);
  }

  @Put('infra/deployments/:id/status')
  @ApiOperation({ summary: 'Update deployment status' })
  updateDeploymentStatus(@Param('id') id: string, @Body() data: {
    status: string; buildLog?: string; artifactUrl?: string; completedAt?: string;
  }) {
    return this.infraService.updateDeploymentStatus(id, data);
  }

  // ─── Environments ────────────────────────────────────────────

  @Post('infra/environments')
  @ApiOperation({ summary: 'Create environment' })
  createEnvironment(@Body() data: {
    tenantId?: string; name: string; slug: string;
    variables?: Record<string, string>; isActive?: boolean;
  }) {
    return this.infraService.createEnvironment(data);
  }

  @Get('infra/environments')
  @ApiOperation({ summary: 'List environments' })
  @ApiQuery({ name: 'tenantId', required: false })
  getEnvironments(@Query('tenantId') tenantId?: string) {
    return this.infraService.getEnvironments(tenantId);
  }

  @Get('infra/environments/:id')
  @ApiOperation({ summary: 'Get environment details' })
  getEnvironment(@Param('id') id: string) {
    return this.infraService.getEnvironment(id);
  }

  @Put('infra/environments/:id')
  @ApiOperation({ summary: 'Update environment' })
  updateEnvironment(@Param('id') id: string, @Body() data: any) {
    return this.infraService.updateEnvironment(id, data);
  }

  @Delete('infra/environments/:id')
  @ApiOperation({ summary: 'Delete environment' })
  deleteEnvironment(@Param('id') id: string) {
    return this.infraService.deleteEnvironment(id);
  }

  // ─── Health Checks ───────────────────────────────────────────

  @Post('infra/health')
  @ApiOperation({ summary: 'Record health check' })
  recordHealthCheck(@Body() data: {
    tenantId?: string; service: string; status: string;
    latencyMs?: number; message?: string;
  }) {
    return this.infraService.recordHealthCheck(data);
  }

  @Get('infra/health/history')
  @ApiOperation({ summary: 'Health check history' })
  getHealthHistory(
    @Query('tenantId') tenantId?: string,
    @Query('service') service?: string,
    @Query('limit') limit?: string,
  ) {
    return this.infraService.getHealthHistory(tenantId, service, limit ? parseInt(limit) : 100);
  }

  @Get('infra/status')
  @ApiOperation({ summary: 'Current service status' })
  getServiceStatus(@Query('tenantId') tenantId?: string) {
    return this.infraService.getServiceStatus(tenantId);
  }

  // ─── Backups ─────────────────────────────────────────────────

  @Post('infra/backups')
  @ApiOperation({ summary: 'Create backup' })
  createBackup(@Body() data: {
    tenantId: string; type?: string; includes?: string[]; excludes?: string[];
  }) {
    return this.infraService.createBackup(data);
  }

  @Get('infra/backups')
  @ApiOperation({ summary: 'List backups' })
  @ApiQuery({ name: 'tenantId', required: true })
  getBackups(
    @Query('tenantId') tenantId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.infraService.getBackups(
      tenantId,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
    );
  }

  @Put('infra/backups/:id/status')
  @ApiOperation({ summary: 'Update backup status' })
  updateBackupStatus(@Param('id') id: string, @Body() data: any) {
    return this.infraService.updateBackupStatus(id, data);
  }

  // ─── Cache ───────────────────────────────────────────────────

  @Post('infra/cache/clear')
  @ApiOperation({ summary: 'Clear cache' })
  clearCache(@Query('tenantId') tenantId?: string) {
    return this.infraService.clearCache(tenantId);
  }

  @Get('infra/cache/stats')
  @ApiOperation({ summary: 'Cache statistics' })
  getCacheStats() {
    return this.infraService.getCacheStats();
  }

  // ─── Overview ────────────────────────────────────────────────

  @Get('infra/overview')
  @ApiOperation({ summary: 'Infrastructure overview' })
  getOverview() {
    return this.infraService.getInfraOverview();
  }
}
