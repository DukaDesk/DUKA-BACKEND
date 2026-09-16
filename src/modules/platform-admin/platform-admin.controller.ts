import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { PlatformAdminService } from './platform-admin.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Platform Administration')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ version: '1' })
export class PlatformAdminController {
  constructor(private readonly adminService: PlatformAdminService) {}

  // ─── Platform Settings ───────────────────────────────────────

  @Get('admin/settings')
  @ApiOperation({ summary: 'Get all platform settings' })
  @ApiQuery({ name: 'category', required: false, description: 'Filter by setting category' })
  getSettings(@Query('category') category?: string) {
    return this.adminService.getAllSettings(category);
  }

  @Get('admin/settings/:key')
  @ApiOperation({ summary: 'Get a platform setting' })
  getSetting(@Param('key') key: string) {
    return this.adminService.getSetting(key);
  }

  @Put('admin/settings/:key')
  @ApiOperation({ summary: 'Set a platform setting' })
  setSetting(@Param('key') key: string, @Body() data: {
    value: any; type?: string; category?: string; description?: string; isEncrypted?: boolean;
  }) {
    return this.adminService.setSetting(key, data);
  }

  @Delete('admin/settings/:key')
  @ApiOperation({ summary: 'Delete a platform setting' })
  deleteSetting(@Param('key') key: string) {
    return this.adminService.deleteSetting(key);
  }

  // ─── System Announcements ────────────────────────────────────

  @Post('admin/announcements')
  @ApiOperation({ summary: 'Create system announcement' })
  createAnnouncement(@Body() data: {
    title: string; body: string; type?: string; priority?: string;
    audiences?: string[]; startsAt?: string; expiresAt?: string; createdBy?: string;
  }) {
    return this.adminService.createAnnouncement(data);
  }

  @Get('admin/announcements')
  @ApiOperation({ summary: 'List all announcements' })
  @ApiQuery({ name: 'page', required: false, type: Number, default: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, default: 20 })
  getAllAnnouncements(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getAllAnnouncements(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
    );
  }

  @Get('admin/announcements/active')
  @ApiOperation({ summary: 'Get active announcements' })
  @ApiQuery({ name: 'type', required: false, description: 'Filter by announcement type' })
  getActiveAnnouncements(@Query('type') type?: string) {
    return this.adminService.getActiveAnnouncements(type);
  }

  @Put('admin/announcements/:id')
  @ApiOperation({ summary: 'Update announcement' })
  updateAnnouncement(@Param('id') id: string, @Body() data: any) {
    return this.adminService.updateAnnouncement(id, data);
  }

  @Delete('admin/announcements/:id')
  @ApiOperation({ summary: 'Delete announcement' })
  deleteAnnouncement(@Param('id') id: string) {
    return this.adminService.deleteAnnouncement(id);
  }

  // ─── Feature Flags ───────────────────────────────────────────

  @Post('admin/feature-flags')
  @ApiOperation({ summary: 'Create feature flag' })
  createFeatureFlag(@Body() data: {
    key: string; name: string; description?: string;
    enabled?: boolean; rules?: Record<string, any>; tenants?: string[];
  }) {
    return this.adminService.createFeatureFlag(data);
  }

  @Get('admin/feature-flags')
  @ApiOperation({ summary: 'List feature flags' })
  getFeatureFlags() {
    return this.adminService.getAllFeatureFlags();
  }

  @Get('admin/feature-flags/:key')
  @ApiOperation({ summary: 'Get feature flag' })
  getFeatureFlag(@Param('key') key: string) {
    return this.adminService.getFeatureFlag(key);
  }

  @Put('admin/feature-flags/:key')
  @ApiOperation({ summary: 'Update feature flag' })
  updateFeatureFlag(@Param('key') key: string, @Body() data: any) {
    return this.adminService.updateFeatureFlag(key, data);
  }

  @Delete('admin/feature-flags/:key')
  @ApiOperation({ summary: 'Delete feature flag' })
  deleteFeatureFlag(@Param('key') key: string) {
    return this.adminService.deleteFeatureFlag(key);
  }

  // ─── Plan Management ─────────────────────────────────────────

  @Post('admin/plans')
  @ApiOperation({ summary: 'Create plan' })
  createPlan(@Body() data: {
    name: string; slug: string; price: number; currency?: string;
    features?: Record<string, any>; limits?: Record<string, any>; isActive?: boolean;
  }) {
    return this.adminService.createPlan(data);
  }

  @Get('admin/plans')
  @ApiOperation({ summary: 'List plans' })
  getPlans() {
    return this.adminService.getAllPlans();
  }

  @Get('admin/plans/:id')
  @ApiOperation({ summary: 'Get plan' })
  getPlan(@Param('id') id: string) {
    return this.adminService.getPlan(id);
  }

  @Put('admin/plans/:id')
  @ApiOperation({ summary: 'Update plan' })
  updatePlan(@Param('id') id: string, @Body() data: any) {
    return this.adminService.updatePlan(id, data);
  }

  @Delete('admin/plans/:id')
  @ApiOperation({ summary: 'Delete plan' })
  deletePlan(@Param('id') id: string) {
    return this.adminService.deletePlan(id);
  }

  // ─── API Quotas ──────────────────────────────────────────────

  @Get('admin/quotas/:merchantId')
  @ApiOperation({ summary: 'Get merchant API quota' })
  getQuota(@Param('merchantId') merchantId: string) {
    return this.adminService.getApiQuota(merchantId);
  }

  @Put('admin/quotas/:merchantId')
  @ApiOperation({ summary: 'Update merchant API quota' })
  updateQuota(@Param('merchantId') merchantId: string, @Body() data: any) {
    return this.adminService.updateApiQuota(merchantId, data);
  }

  // ─── Subscriptions ───────────────────────────────────────────

  @Get('admin/subscriptions')
  @ApiOperation({ summary: 'List all subscriptions' })
  @ApiQuery({ name: 'page', required: false, type: Number, default: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, default: 20 })
  getSubscriptions(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getAllSubscriptions(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
    );
  }

  @Put('admin/subscriptions/:id')
  @ApiOperation({ summary: 'Update subscription' })
  updateSubscription(@Param('id') id: string, @Body() data: any) {
    return this.adminService.updateSubscription(id, data);
  }

  // ─── Platform Stats ──────────────────────────────────────────

  @Get('admin/stats')
  @ApiOperation({ summary: 'Get platform statistics' })
  getStats() {
    return this.adminService.getPlatformStats();
  }

  // ─── Maintenance (stub) ─────────────────────────────────────

  @Get('admin/maintenance')
  @ApiOperation({ summary: 'Get maintenance windows (stub)' })
  getMaintenance() {
    return { data: [], meta: { page: 1, limit: 10, total: 0, pages: 0 } };
  }

  // ─── Policies (stub) ────────────────────────────────────────

  @Get('admin/policies')
  @ApiOperation({ summary: 'Get platform policies (stub)' })
  getPolicies() {
    return { data: [], meta: { page: 1, limit: 10, total: 0, pages: 0 } };
  }
}
