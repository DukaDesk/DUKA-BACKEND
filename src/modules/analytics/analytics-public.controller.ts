import {
  Controller, Get, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { ReportsService } from './reports.service';
import { DashboardsService } from './dashboards.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Analytics - Public (Read-Only)')
@Controller({ path: 'analytics', version: '1' })
export class AnalyticsPublicController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly reportsService: ReportsService,
    private readonly dashboardsService: DashboardsService,
  ) {}

  // ─── Event Tracking ──────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('events')
  @ApiOperation({ summary: 'Get analytics events with filters' })
  @ApiQuery({ name: 'tenantId', required: true })
  @ApiQuery({ name: 'event', required: false })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  getEvents(
    @Query('tenantId') tenantId: string,
    @Query('event') event?: string,
    @Query('category') category?: string,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.analyticsService.getEvents(tenantId, {
      event, category, userId, from, to,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
    });
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('events/aggregate')
  @ApiOperation({ summary: 'Aggregate events by period' })
  @ApiQuery({ name: 'tenantId', required: true })
  @ApiQuery({ name: 'event', required: true })
  @ApiQuery({ name: 'period', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  getEventAggregation(
    @Query('tenantId') tenantId: string,
    @Query('event') event: string,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analyticsService.getEventAggregation(tenantId, event, period as any, from, to);
  }

  // ─── Reports ─────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('reports/revenue')
  @ApiOperation({ summary: 'Revenue report' })
  @ApiQuery({ name: 'tenantId', required: true })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  getRevenueReport(@Query('tenantId') tenantId: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.analyticsService.getRevenueReport(tenantId, from, to);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('reports/users')
  @ApiOperation({ summary: 'User analytics' })
  @ApiQuery({ name: 'tenantId', required: true })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  getUserAnalytics(@Query('tenantId') tenantId: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.analyticsService.getUserAnalytics(tenantId, from, to);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('reports/bookings')
  @ApiOperation({ summary: 'Booking analytics' })
  @ApiQuery({ name: 'tenantId', required: true })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  getBookingAnalytics(@Query('tenantId') tenantId: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.analyticsService.getBookingAnalytics(tenantId, from, to);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('summary')
  @ApiOperation({ summary: 'Dashboard summary' })
  @ApiQuery({ name: 'tenantId', required: true })
  getDashboardSummary(@Query('tenantId') tenantId: string) {
    return this.analyticsService.getDashboardSummary(tenantId);
  }

  // ─── Saved Reports ──────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('reports/saved')
  @ApiOperation({ summary: 'List saved reports' })
  @ApiQuery({ name: 'tenantId', required: true })
  getReports(@Query('tenantId') tenantId: string) {
    return this.reportsService.findAll(tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('reports/:id')
  @ApiOperation({ summary: 'Get saved report' })
  @ApiQuery({ name: 'tenantId', required: true })
  getReport(@Query('tenantId') tenantId: string, @Param('id') id: string) {
    return this.reportsService.findOne(tenantId, id);
  }

  // ─── Dashboard Data Resolution ──────────────────────────────

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('dashboards/:id/data')
  @ApiOperation({ summary: 'Resolve all widget data for a dashboard (public)' })
  @ApiQuery({ name: 'tenantId', required: true })
  getDashboardData(@Query('tenantId') tenantId: string, @Param('id') id: string) {
    return this.dashboardsService.resolveDashboardData(tenantId, id);
  }

  // ─── Dashboards ──────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('dashboards')
  @ApiOperation({ summary: 'List dashboards' })
  @ApiQuery({ name: 'tenantId', required: true })
  getDashboards(@Query('tenantId') tenantId: string) {
    return this.dashboardsService.findAll(tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('dashboards/:id')
  @ApiOperation({ summary: 'Get dashboard with widgets' })
  @ApiQuery({ name: 'tenantId', required: true })
  getDashboard(@Query('tenantId') tenantId: string, @Param('id') id: string) {
    return this.dashboardsService.findOne(tenantId, id);
  }
}