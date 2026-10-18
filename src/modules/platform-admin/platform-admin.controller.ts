import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, NotImplementedException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { PlatformAdminService } from './platform-admin.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PlatformRoleGuard, RequirePlatformRoles } from '../admin/platform-role.guard';

@ApiTags('Platform Administration')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PlatformRoleGuard)
@RequirePlatformRoles('super_admin', 'platform_operator')
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
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'plan', required: false, description: 'Filter by plan slug' })
  @ApiQuery({ name: 'search', required: false, description: 'Search merchant and plan names' })
  @ApiQuery({
    name: 'sort',
    required: false,
    enum: ['createdAt', 'status', 'currentPeriodEnd', 'merchantName', 'planName', 'amount'],
  })
  @ApiQuery({ name: 'order', required: false, enum: ['asc', 'desc'] })
  getSubscriptions(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('plan') plan?: string,
    @Query('search') search?: string,
    @Query('sort') sort?: string,
    @Query('order') order?: string,
  ) {
    return this.adminService.getAllSubscriptions(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
      { status, plan, search, sort, order },
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

  // ─── Maintenance ────────────────────────────────────────────

  @Get('admin/maintenance')
  @ApiOperation({ summary: 'Maintenance scheduling is not implemented' })
  getMaintenance() {
    throw new NotImplementedException('Maintenance scheduling is not available yet');
  }

  // ─── Policies (governed lifecycle) ──────────────────────────

  @Get('admin/policies')
  @ApiOperation({ summary: 'List platform policies' })
  @ApiQuery({ name: 'page', required: false, type: Number, default: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, default: 20 })
  @ApiQuery({ name: 'status', required: false, description: 'draft | in_review | published | archived' })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'search', required: false })
  getPolicies(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('search') search?: string,
  ) {
    return this.adminService.getPolicies(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
      { status, category, search },
    );
  }

  @Post('admin/policies')
  @ApiOperation({ summary: 'Create a draft platform policy' })
  createPolicy(@CurrentUser('id') actorId: string, @Body() data: { key: string; title: string; body: string; category?: string; effectiveAt?: string }) {
    return this.adminService.createPolicy(actorId, data);
  }

  @Put('admin/policies/:id')
  @ApiOperation({ summary: 'Update a draft/in-review platform policy' })
  updatePolicy(@Param('id') id: string, @CurrentUser('id') actorId: string, @Body() data: any) {
    return this.adminService.updatePolicy(id, actorId, data);
  }

  @Post('admin/policies/:id/submit')
  @ApiOperation({ summary: 'Submit a draft policy for review' })
  submitPolicy(@Param('id') id: string, @CurrentUser('id') actorId: string) {
    return this.adminService.submitPolicy(id, actorId);
  }

  @Post('admin/policies/:id/publish')
  @RequirePlatformRoles('super_admin')
  @ApiOperation({ summary: 'Publish a reviewed policy (super admin only)' })
  publishPolicy(@Param('id') id: string, @CurrentUser('id') actorId: string) {
    return this.adminService.publishPolicy(id, actorId);
  }

  @Post('admin/policies/:id/archive')
  @RequirePlatformRoles('super_admin')
  @ApiOperation({ summary: 'Archive a published policy (super admin only)' })
  archivePolicy(@Param('id') id: string, @CurrentUser('id') actorId: string) {
    return this.adminService.archivePolicy(id, actorId);
  }

  // ─── Operational reports & exports ──────────────────────────

  @Get('admin/reports/:report/export')
  @RequirePlatformRoles('super_admin', 'platform_operator')
  @ApiOperation({ summary: 'Export an operational report as CSV (scope-enforced, audited)' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'plan', required: false })
  @ApiQuery({ name: 'priority', required: false })
  @ApiQuery({ name: 'category', required: false })
  exportReport(
    @Param('report') report: string,
    @CurrentUser('id') actorId: string,
    @Query() query: Record<string, string>,
  ) {
    return this.adminService.exportReport(
      report,
      {
        search: query.search,
        status: query.status,
        plan: query.plan,
        priority: query.priority,
        category: query.category,
        assigneeId: query.assigneeId,
      },
      actorId,
    );
  }

  // ─── Support tickets (case/task workflow) ───────────────────

  @Get('admin/support-tickets')
  @RequirePlatformRoles('super_admin', 'platform_operator', 'support_agent')
  @ApiOperation({ summary: 'List support tickets' })
  @ApiQuery({ name: 'page', required: false, type: Number, default: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, default: 20 })
  @ApiQuery({ name: 'status', required: false, description: 'open | in_progress | escalated | resolved | closed' })
  @ApiQuery({ name: 'priority', required: false, description: 'low | normal | high | urgent' })
  @ApiQuery({ name: 'assigneeId', required: false })
  @ApiQuery({ name: 'search', required: false })
  listSupportTickets(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('assigneeId') assigneeId?: string,
    @Query('search') search?: string,
  ) {
    return this.adminService.listSupportTickets(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
      { status, priority, assigneeId, search },
    );
  }

  @Post('admin/support-tickets')
  @ApiOperation({ summary: 'Create a support ticket' })
  createSupportTicket(@CurrentUser('id') actorId: string, @Body() data: {
    subject: string; description: string; priority?: string; category?: string;
    tenantId?: string; reportedBy?: string; assigneeId?: string;
  }) {
    return this.adminService.createSupportTicket(actorId, data);
  }

  @Get('admin/support-tickets/:id')
  @RequirePlatformRoles('super_admin', 'platform_operator', 'support_agent')
  @ApiOperation({ summary: 'Get a support ticket with its event trail' })
  getSupportTicket(@Param('id') id: string) {
    return this.adminService.getSupportTicket(id);
  }

  @Post('admin/support-tickets/:id/assign')
  @RequirePlatformRoles('super_admin', 'platform_operator', 'support_agent')
  @ApiOperation({ summary: 'Assign a support ticket to an operator' })
  assignSupportTicket(@Param('id') id: string, @CurrentUser('id') actorId: string, @Body() body: { assigneeId: string }) {
    return this.adminService.assignSupportTicket(id, actorId, body?.assigneeId);
  }

  @Post('admin/support-tickets/:id/escalate')
  @RequirePlatformRoles('super_admin', 'platform_operator', 'support_agent')
  @ApiOperation({ summary: 'Escalate a support ticket' })
  escalateSupportTicket(@Param('id') id: string, @CurrentUser('id') actorId: string, @Body() body: { note?: string }) {
    return this.adminService.escalateSupportTicket(id, actorId, body?.note);
  }

  @Post('admin/support-tickets/:id/resolve')
  @RequirePlatformRoles('super_admin', 'platform_operator', 'support_agent')
  @ApiOperation({ summary: 'Resolve a support ticket (resolution required)' })
  resolveSupportTicket(@Param('id') id: string, @CurrentUser('id') actorId: string, @Body() body: { resolution: string }) {
    return this.adminService.resolveSupportTicket(id, actorId, body?.resolution);
  }

  @Post('admin/support-tickets/:id/comments')
  @RequirePlatformRoles('super_admin', 'platform_operator', 'support_agent')
  @ApiOperation({ summary: 'Add a comment to a support ticket' })
  commentSupportTicket(@Param('id') id: string, @CurrentUser('id') actorId: string, @Body() body: { message: string }) {
    return this.adminService.commentSupportTicket(id, actorId, body?.message);
  }
}
