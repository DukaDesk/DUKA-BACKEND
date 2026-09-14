import {
  Controller, Get, Param, UseGuards, Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { BusinessDashboardBffService } from './business-dashboard-bff.service';

@ApiTags('Business Dashboard BFF')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'bff/admin', version: '1' })
export class BusinessDashboardBffController {
  constructor(private readonly bff: BusinessDashboardBffService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Get platform overview stats' })
  getOverview() {
    return this.bff.getPlatformOverview();
  }

  @Get('merchants')
  @ApiOperation({ summary: 'Get paginated tenant list' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  getTenants(@Query('status') status?: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    const p = Number(page) || 1;
    const l = Number(limit) || 20;
    return this.bff.getTenantsList(status, p, l);
  }

  @Get('audit')
  @ApiOperation({ summary: 'Get recent audit logs' })
  @ApiQuery({ name: 'limit', required: false })
  getAuditLogs(@Query('limit') limit?: string) {
    return this.bff.getRecentAuditLogs(Number(limit) || 20);
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Dashboard analytics: revenue trend, user growth, order volume, GMV, active tenants' })
  @ApiQuery({ name: 'dateFrom', required: false, type: String, description: 'Start date (ISO format)' })
  @ApiQuery({ name: 'dateTo', required: false, type: String, description: 'End date (ISO format)' })
  @ApiQuery({ name: 'groupBy', required: false, type: String, enum: ['day', 'week', 'month'], default: 'day' })
  getAnalytics(@Query('dateFrom') dateFrom?: string, @Query('dateTo') dateTo?: string, @Query('groupBy') groupBy?: string) {
    return this.bff.getAnalytics(dateFrom, dateTo, (groupBy as any) || 'day');
  }

  @Get('revenue')
  @ApiOperation({ summary: 'Revenue report with filters: dateFrom, dateTo, tenantId, groupBy' })
  @ApiQuery({ name: 'dateFrom', required: false, type: String, description: 'Start date (ISO format)' })
  @ApiQuery({ name: 'dateTo', required: false, type: String, description: 'End date (ISO format)' })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'groupBy', required: false, type: String, enum: ['day', 'week', 'month'], default: 'day' })
  getRevenue(@Query('dateFrom') dateFrom?: string, @Query('dateTo') dateTo?: string, @Query('tenantId') tenantId?: string, @Query('groupBy') groupBy?: string) {
    return this.bff.getRevenueReport(dateFrom, dateTo, tenantId, (groupBy as any) || 'day');
  }

  @Get('merchants/:merchantId/analytics')
  @ApiOperation({ summary: 'Per-merchant analytics (for drill-down)' })
  @ApiParam({ name: 'merchantId', description: 'Merchant ID' })
  @ApiQuery({ name: 'dateFrom', required: false, type: String, description: 'Start date (ISO format)' })
  @ApiQuery({ name: 'dateTo', required: false, type: String, description: 'End date (ISO format)' })
  @ApiQuery({ name: 'groupBy', required: false, type: String, enum: ['day', 'week', 'month'], default: 'day' })
  getMerchantAnalytics(@Param('merchantId') merchantId: string, @Query('dateFrom') dateFrom?: string, @Query('dateTo') dateTo?: string, @Query('groupBy') groupBy?: string) {
    return this.bff.getMerchantAnalytics(merchantId, dateFrom, dateTo, (groupBy as any) || 'day');
  }
}
