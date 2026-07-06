import {
  Controller, Get, Post, Body, Param, Delete, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { ReportsService } from './reports.service';
import { DashboardsService } from './dashboards.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Analytics & BI')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ version: '1' })
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly reportsService: ReportsService,
    private readonly dashboardsService: DashboardsService,
  ) {}

  // ─── Event Tracking ──────────────────────────────────────────

  @Post('analytics/events')
  @ApiOperation({ summary: 'Track an analytics event' })
  trackEvent(@Body() data: {
    tenantId: string; userId?: string; event: string;
    category?: string; label?: string; value?: number;
    properties?: Record<string, any>; sessionId?: string; source?: string;
  }) {
    return this.analyticsService.trackEvent(data);
  }

  @Get('analytics/events')
  @ApiOperation({ summary: 'Get analytics events with filters' })
  @ApiQuery({ name: 'tenantId', required: true })
  @ApiQuery({ name: 'event', required: false })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'userId', required: false })
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

  @Get('analytics/events/aggregate')
  @ApiOperation({ summary: 'Aggregate events by period' })
  @ApiQuery({ name: 'tenantId', required: true })
  @ApiQuery({ name: 'event', required: true })
  getEventAggregation(
    @Query('tenantId') tenantId: string,
    @Query('event') event: string,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analyticsService.getEventAggregation(
      tenantId, event, period as any, from, to,
    );
  }

  // ─── Reports ─────────────────────────────────────────────────

  @Get('analytics/reports/revenue')
  @ApiOperation({ summary: 'Revenue report' })
  @ApiQuery({ name: 'tenantId', required: true })
  getRevenueReport(
    @Query('tenantId') tenantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analyticsService.getRevenueReport(tenantId, from, to);
  }

  @Get('analytics/reports/users')
  @ApiOperation({ summary: 'User analytics' })
  @ApiQuery({ name: 'tenantId', required: true })
  getUserAnalytics(
    @Query('tenantId') tenantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analyticsService.getUserAnalytics(tenantId, from, to);
  }

  @Get('analytics/reports/bookings')
  @ApiOperation({ summary: 'Booking analytics' })
  @ApiQuery({ name: 'tenantId', required: true })
  getBookingAnalytics(
    @Query('tenantId') tenantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analyticsService.getBookingAnalytics(tenantId, from, to);
  }

  @Get('analytics/summary')
  @ApiOperation({ summary: 'Dashboard summary' })
  @ApiQuery({ name: 'tenantId', required: true })
  getDashboardSummary(@Query('tenantId') tenantId: string) {
    return this.analyticsService.getDashboardSummary(tenantId);
  }

  // ─── Saved Reports CRUD ──────────────────────────────────────

  @Post('analytics/reports')
  @ApiOperation({ summary: 'Create a saved report' })
  createReport(
    @Query('tenantId') tenantId: string,
    @Body() data: {
      name: string; type?: string; metric: string;
      filters?: Record<string, any>; groupBy?: string;
      period?: string; schedule?: string;
      recipients?: string[]; format?: string;
    },
  ) {
    return this.reportsService.create(tenantId, data);
  }

  @Get('analytics/reports/saved')
  @ApiOperation({ summary: 'List saved reports' })
  @ApiQuery({ name: 'tenantId', required: true })
  getReports(@Query('tenantId') tenantId: string) {
    return this.reportsService.findAll(tenantId);
  }

  @Get('analytics/reports/:id')
  @ApiOperation({ summary: 'Get saved report' })
  getReport(
    @Query('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.reportsService.findOne(tenantId, id);
  }

  @Post('analytics/reports/:id')
  @ApiOperation({ summary: 'Update saved report' })
  updateReport(
    @Query('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() data: any,
  ) {
    return this.reportsService.update(tenantId, id, data);
  }

  @Delete('analytics/reports/:id')
  @ApiOperation({ summary: 'Delete saved report' })
  deleteReport(
    @Query('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.reportsService.remove(tenantId, id);
  }

  // ─── Dashboards ──────────────────────────────────────────────

  @Post('analytics/dashboards')
  @ApiOperation({ summary: 'Create a dashboard' })
  createDashboard(
    @Query('tenantId') tenantId: string,
    @Body() data: { name: string; slug: string; description?: string; layout?: Record<string, any> },
  ) {
    return this.dashboardsService.create(tenantId, data);
  }

  @Get('analytics/dashboards')
  @ApiOperation({ summary: 'List dashboards' })
  @ApiQuery({ name: 'tenantId', required: true })
  getDashboards(@Query('tenantId') tenantId: string) {
    return this.dashboardsService.findAll(tenantId);
  }

  @Get('analytics/dashboards/:id')
  @ApiOperation({ summary: 'Get dashboard with widgets' })
  getDashboard(
    @Query('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.dashboardsService.findOne(tenantId, id);
  }

  @Post('analytics/dashboards/:id')
  @ApiOperation({ summary: 'Update dashboard' })
  updateDashboard(
    @Query('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() data: any,
  ) {
    return this.dashboardsService.update(tenantId, id, data);
  }

  @Delete('analytics/dashboards/:id')
  @ApiOperation({ summary: 'Delete dashboard' })
  deleteDashboard(
    @Query('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.dashboardsService.remove(tenantId, id);
  }

  // ─── Dashboard Widgets ───────────────────────────────────────

  @Post('analytics/dashboards/:dashboardId/widgets')
  @ApiOperation({ summary: 'Add widget to dashboard' })
  addWidget(
    @Query('tenantId') tenantId: string,
    @Param('dashboardId') dashboardId: string,
    @Body() data: {
      type: string; title: string; subtitle?: string;
      config?: Record<string, any>; position?: number;
      width?: number; height?: number; metric?: string; dataset?: string;
      query?: Record<string, any>;
    },
  ) {
    return this.dashboardsService.addWidget(tenantId, dashboardId, data);
  }

  @Post('analytics/dashboards/:dashboardId/widgets/:widgetId')
  @ApiOperation({ summary: 'Update widget' })
  updateWidget(
    @Query('tenantId') tenantId: string,
    @Param('dashboardId') dashboardId: string,
    @Param('widgetId') widgetId: string,
    @Body() data: any,
  ) {
    return this.dashboardsService.updateWidget(tenantId, dashboardId, widgetId, data);
  }

  @Delete('analytics/dashboards/:dashboardId/widgets/:widgetId')
  @ApiOperation({ summary: 'Remove widget' })
  removeWidget(
    @Query('tenantId') tenantId: string,
    @Param('dashboardId') dashboardId: string,
    @Param('widgetId') widgetId: string,
  ) {
    return this.dashboardsService.removeWidget(tenantId, dashboardId, widgetId);
  }
}
