import {
  Controller, Get, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { ReportsService } from './reports.service';
import { DashboardsService } from './dashboards.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TenantResolverService } from '../../shared/tenant/tenant-resolver.service';

@ApiTags('Analytics - Public (Read-Only)')
@Controller({ path: 'analytics', version: '1' })
export class AnalyticsPublicController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly reportsService: ReportsService,
    private readonly dashboardsService: DashboardsService,
    private readonly tenantResolver: TenantResolverService,
  ) {}

  // ─── Event Tracking ──────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('events')
  @ApiOperation({ summary: 'Get analytics events with filters' })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'event', required: false })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getEvents(
    @CurrentUser('id') currentUserId: string,
    @Query('tenantId') tenantId?: string,
    @Query('event') event?: string,
    @Query('category') category?: string,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const tid = tenantId || await this.tenantResolver.resolveTenantId(currentUserId);
    return this.analyticsService.getEvents(tid, {
      event, category, userId, from, to,
      page: Number(page) || 1,
      limit: Number(limit) || 50,
    });
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('events/aggregate')
  @ApiOperation({ summary: 'Aggregate events by period' })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'event', required: true })
  @ApiQuery({ name: 'period', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async getEventAggregation(
    @CurrentUser('id') currentUserId: string,
    @Query('tenantId') tenantId?: string,
    @Query('event') event?: string,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const tid = tenantId || await this.tenantResolver.resolveTenantId(currentUserId);
    return this.analyticsService.getEventAggregation(tid, event!, period as any, from, to);
  }

  // ─── Reports ─────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('reports/revenue')
  @ApiOperation({ summary: 'Revenue report' })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async getRevenueReport(@CurrentUser('id') currentUserId: string, @Query('tenantId') tenantId?: string, @Query('from') from?: string, @Query('to') to?: string) {
    const tid = tenantId || await this.tenantResolver.resolveTenantId(currentUserId);
    return this.analyticsService.getRevenueReport(tid, from, to);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('reports/users')
  @ApiOperation({ summary: 'User analytics' })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async getUserAnalytics(@CurrentUser('id') currentUserId: string, @Query('tenantId') tenantId?: string, @Query('from') from?: string, @Query('to') to?: string) {
    const tid = tenantId || await this.tenantResolver.resolveTenantId(currentUserId);
    return this.analyticsService.getUserAnalytics(tid, from, to);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('reports/bookings')
  @ApiOperation({ summary: 'Booking analytics' })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async getBookingAnalytics(@CurrentUser('id') currentUserId: string, @Query('tenantId') tenantId?: string, @Query('from') from?: string, @Query('to') to?: string) {
    const tid = tenantId || await this.tenantResolver.resolveTenantId(currentUserId);
    return this.analyticsService.getBookingAnalytics(tid, from, to);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('summary')
  @ApiOperation({ summary: 'Dashboard summary' })
  @ApiQuery({ name: 'tenantId', required: false })
  async getDashboardSummary(@CurrentUser('id') currentUserId: string, @Query('tenantId') tenantId?: string) {
    const tid = tenantId || await this.tenantResolver.resolveTenantId(currentUserId);
    return this.analyticsService.getDashboardSummary(tid);
  }

  // ─── Saved Reports ──────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('reports/saved')
  @ApiOperation({ summary: 'List saved reports' })
  @ApiQuery({ name: 'tenantId', required: false })
  async getReports(@CurrentUser('id') currentUserId: string, @Query('tenantId') tenantId?: string) {
    const tid = tenantId || await this.tenantResolver.resolveTenantId(currentUserId);
    return this.reportsService.findAll(tid);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('reports/:id')
  @ApiOperation({ summary: 'Get saved report' })
  @ApiQuery({ name: 'tenantId', required: false })
  async getReport(@CurrentUser('id') currentUserId: string, @Param('id') id: string, @Query('tenantId') tenantId?: string) {
    const tid = tenantId || await this.tenantResolver.resolveTenantId(currentUserId);
    return this.reportsService.findOne(tid, id);
  }

  // ─── Dashboard Data Resolution ──────────────────────────────

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('dashboards/:id/data')
  @ApiOperation({ summary: 'Resolve all widget data for a dashboard (public)' })
  @ApiQuery({ name: 'tenantId', required: false })
  async getDashboardData(@CurrentUser('id') currentUserId: string, @Param('id') id: string, @Query('tenantId') tenantId?: string) {
    const tid = tenantId || await this.tenantResolver.resolveTenantId(currentUserId);
    return this.dashboardsService.resolveDashboardData(tid, id);
  }

  // ─── Dashboards ──────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('dashboards')
  @ApiOperation({ summary: 'List dashboards' })
  @ApiQuery({ name: 'tenantId', required: false })
  async getDashboards(@CurrentUser('id') currentUserId: string, @Query('tenantId') tenantId?: string) {
    const tid = tenantId || await this.tenantResolver.resolveTenantId(currentUserId);
    return this.dashboardsService.findAll(tid);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('dashboards/:id')
  @ApiOperation({ summary: 'Get dashboard with widgets' })
  @ApiQuery({ name: 'tenantId', required: false })
  async getDashboard(@CurrentUser('id') currentUserId: string, @Param('id') id: string, @Query('tenantId') tenantId?: string) {
    const tid = tenantId || await this.tenantResolver.resolveTenantId(currentUserId);
    return this.dashboardsService.findOne(tid, id);
  }
}