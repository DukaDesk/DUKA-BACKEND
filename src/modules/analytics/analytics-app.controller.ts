import {
  Controller, Get, Post, Body, Param, Delete, UseGuards, NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { ReportsService } from './reports.service';
import { DashboardsService } from './dashboards.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TenantResolverService } from '../../shared/tenant/tenant-resolver.service';
import { CreateDashboardDto } from './dto/create-dashboard.dto';
import { UpdateDashboardDto } from './dto/update-dashboard.dto';
import { CreateWidgetDto } from './dto/create-widget.dto';
import { UpdateWidgetDto } from './dto/update-widget.dto';

@ApiTags('Analytics - App (Tenant Self-Service)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'app/analytics', version: '1' })
export class AnalyticsAppController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly reportsService: ReportsService,
    private readonly dashboardsService: DashboardsService,
    private readonly tenantResolver: TenantResolverService,
  ) {}

  private async getTenantId(userId: string): Promise<string> {
    return this.tenantResolver.resolveTenantId(userId);
  }

  // ─── Event Tracking ──────────────────────────────────────────

  @Post('events')
  @ApiOperation({ summary: 'Track an analytics event for current tenant' })
  async trackEvent(@CurrentUser('id') userId: string, @Body() data: {
    userId?: string; event: string; category?: string; label?: string; value?: number;
    properties?: Record<string, any>; sessionId?: string; source?: string;
  }) {
    const tenantId = await this.getTenantId(userId);
    return this.analyticsService.trackEvent({ ...data, tenantId });
  }

  // ─── Saved Reports CRUD ──────────────────────────────────────

  @Post('reports')
  @ApiOperation({ summary: 'Create a saved report for current tenant' })
  async createReport(@CurrentUser('id') userId: string, @Body() data: {
    name: string; type?: string; metric: string;
    filters?: Record<string, any>; groupBy?: string;
    period?: string; schedule?: string;
    recipients?: string[]; format?: string;
  }) {
    const tenantId = await this.getTenantId(userId);
    return this.reportsService.create(tenantId, data);
  }

  @Post('reports/:id')
  @ApiOperation({ summary: 'Update saved report for current tenant' })
  async updateReport(@CurrentUser('id') userId: string, @Param('id') id: string, @Body() data: any) {
    const tenantId = await this.getTenantId(userId);
    return this.reportsService.update(tenantId, id, data);
  }

  @Delete('reports/:id')
  @ApiOperation({ summary: 'Delete saved report for current tenant' })
  async deleteReport(@CurrentUser('id') userId: string, @Param('id') id: string) {
    const tenantId = await this.getTenantId(userId);
    return this.reportsService.remove(tenantId, id);
  }

  // ─── Widget Types ────────────────────────────────────────────

  @Get('widget-types')
  @ApiOperation({ summary: 'Get available widget types and metrics' })
  getWidgetTypes() {
    return this.dashboardsService.getWidgetTypes();
  }

  // ─── Dashboards ──────────────────────────────────────────────

  @Post('dashboards')
  @ApiOperation({ summary: 'Create a dashboard for current tenant' })
  async createDashboard(@CurrentUser('id') userId: string, @Body() data: CreateDashboardDto) {
    const tenantId = await this.getTenantId(userId);
    return this.dashboardsService.create(tenantId, data);
  }

  @Post('dashboards/:id')
  @ApiOperation({ summary: 'Update dashboard for current tenant' })
  async updateDashboard(@CurrentUser('id') userId: string, @Param('id') id: string, @Body() data: UpdateDashboardDto) {
    const tenantId = await this.getTenantId(userId);
    return this.dashboardsService.update(tenantId, id, data);
  }

  @Delete('dashboards/:id')
  @ApiOperation({ summary: 'Delete dashboard for current tenant' })
  async deleteDashboard(@CurrentUser('id') userId: string, @Param('id') id: string) {
    const tenantId = await this.getTenantId(userId);
    return this.dashboardsService.remove(tenantId, id);
  }

  // ─── Dashboard Data Resolution ──────────────────────────────

  @Get('dashboards/:id/data')
  @ApiOperation({ summary: 'Resolve all widget data for a dashboard' })
  async getDashboardData(@CurrentUser('id') userId: string, @Param('id') id: string) {
    const tenantId = await this.getTenantId(userId);
    return this.dashboardsService.resolveDashboardData(tenantId, id);
  }

  @Get('dashboards/:dashboardId/widgets/:widgetId/data')
  @ApiOperation({ summary: 'Resolve data for a single widget' })
  async getWidgetData(
    @CurrentUser('id') userId: string,
    @Param('dashboardId') dashboardId: string,
    @Param('widgetId') widgetId: string,
  ) {
    const tenantId = await this.getTenantId(userId);
    const dashboard = await this.dashboardsService.findOne(tenantId, dashboardId);
    const widget = dashboard.widgets.find((w) => w.id === widgetId);
    if (!widget) throw new NotFoundException('Widget not found');
    return this.dashboardsService.resolveWidgetData(tenantId, widget);
  }

  // ─── Dashboard Widgets ───────────────────────────────────────

  @Post('dashboards/:dashboardId/widgets')
  @ApiOperation({ summary: 'Add widget to dashboard for current tenant' })
  async addWidget(
    @CurrentUser('id') userId: string,
    @Param('dashboardId') dashboardId: string,
    @Body() data: CreateWidgetDto,
  ) {
    const tenantId = await this.getTenantId(userId);
    return this.dashboardsService.addWidget(tenantId, dashboardId, data);
  }

  @Post('dashboards/:dashboardId/widgets/:widgetId')
  @ApiOperation({ summary: 'Update widget for current tenant' })
  async updateWidget(
    @CurrentUser('id') userId: string,
    @Param('dashboardId') dashboardId: string,
    @Param('widgetId') widgetId: string,
    @Body() data: UpdateWidgetDto,
  ) {
    const tenantId = await this.getTenantId(userId);
    return this.dashboardsService.updateWidget(tenantId, dashboardId, widgetId, data);
  }

  @Delete('dashboards/:dashboardId/widgets/:widgetId')
  @ApiOperation({ summary: 'Remove widget for current tenant' })
  async removeWidget(@CurrentUser('id') userId: string, @Param('dashboardId') dashboardId: string, @Param('widgetId') widgetId: string) {
    const tenantId = await this.getTenantId(userId);
    return this.dashboardsService.removeWidget(tenantId, dashboardId, widgetId);
  }
}
