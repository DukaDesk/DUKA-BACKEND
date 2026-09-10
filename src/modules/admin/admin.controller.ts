import { Controller, Get, Post, Put, Delete, Param, UseGuards, Query, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiBody } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'admin', version: '1' })
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post('merchants/:id/approve')
  @ApiOperation({ summary: 'Approve a tenant' })
  approveTenant(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.adminService.approveTenant(id, userId);
  }

  @Post('merchants/:id/suspend')
  @ApiOperation({ summary: 'Suspend a tenant' })
  suspendTenant(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.adminService.suspendTenant(id, userId);
  }

  @Get('merchants')
  @ApiOperation({ summary: 'Get all tenants (admin)' })
  @ApiQuery({ name: 'status', required: false })
  getTenants(@CurrentUser('id') userId: string, @Query('status') status?: string) {
    return this.adminService.getTenants(userId, status);
  }

  @Get('merchants/:id')
  @ApiOperation({ summary: 'Get tenant detail' })
  getTenantDetail(@Param('id') id: string) {
    return this.adminService.getTenantDetail(id);
  }

@Post('merchants')
  @ApiOperation({ summary: 'Create a new tenant' })
  @ApiBody({ type: 'object' })
  createTenant(@CurrentUser('id') adminUserId: string, @Body() data: {
    name: string; slug: string; description?: string; status?: 'draft' | 'published' | 'suspended'; config?: Record<string, any>;
  }) {
    return this.adminService.createTenant(adminUserId, data);
  }

  @Put('merchants/:id')
  @ApiOperation({ summary: 'Update tenant' })
  updateTenant(@CurrentUser('id') adminUserId: string, @Param('id') id: string, @Body() data: {
    name?: string; slug?: string; description?: string; status?: 'draft' | 'published' | 'suspended'; config?: Record<string, any>;
  }) {
    return this.adminService.updateTenant(adminUserId, id, data);
  }

  @Post('cleanup-deactivated')
  @ApiOperation({ summary: 'Permanently delete accounts past 30-day deactivation period' })
  cleanupDeactivated(@CurrentUser('id') userId: string) {
    return this.adminService.cleanupDeactivatedAccounts();
  }

  // ─── Tenant Settings ──────────────────────────────────────────

  @Get('merchants/:merchantId/settings')
  @ApiOperation({ summary: 'Get merchant settings' })
  getTenantSettings(@Param('merchantId') merchantId: string, @Query('category') category?: string) {
    return this.adminService.getTenantSettings(merchantId, category);
  }

  @Put('merchants/:merchantId/settings/:key')
  @ApiOperation({ summary: 'Update merchant setting' })
  updateTenantSetting(@CurrentUser('id') adminUserId: string, @Param('merchantId') merchantId: string, @Param('key') key: string, @Body() data: any) {
    return this.adminService.updateTenantSetting(merchantId, key, data, adminUserId);
  }
}