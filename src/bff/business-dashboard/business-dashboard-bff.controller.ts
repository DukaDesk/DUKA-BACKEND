import {
  Controller, Get, Post, Body, Param, UseGuards, Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Business Dashboard BFF')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'bff/admin', version: '1' })
export class BusinessDashboardBffController {
  @Get('overview')
  @ApiOperation({ summary: 'Get platform overview stats' })
  getOverview() {
    return {
      totalTenants: 0,
      activeTenants: 0,
      totalUsers: 0,
      totalOrders: 0,
      totalRevenue: 0,
      gmv: 0,
    };
  }

  @Get('merchants')
  @ApiOperation({ summary: 'Get paginated tenant list' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  getTenants(@Query('status') status?: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    return { tenants: [], total: 0, page: 1, totalPages: 0 };
  }

  @Get('audit')
  @ApiOperation({ summary: 'Get recent audit logs' })
  getAuditLogs() {
    return { auditLogs: [], total: 0 };
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Dashboard analytics: revenue trend, user growth, order volume, GMV, active tenants' })
  @ApiQuery({ name: 'dateFrom', required: false, type: String, description: 'Start date (ISO format)' })
  @ApiQuery({ name: 'dateTo', required: false, type: String, description: 'End date (ISO format)' })
  @ApiQuery({ name: 'groupBy', required: false, type: String, enum: ['day', 'week', 'month'], default: 'day' })
  getAnalytics(@Query('dateFrom') dateFrom?: string, @Query('dateTo') dateTo?: string, @Query('groupBy') groupBy?: string) {
    return {
      revenueTrend: [],
      userGrowth: [],
      orderVolume: [],
      gmv: 0,
      activeTenants: 0,
      period: { dateFrom, dateTo, groupBy },
    };
  }

  @Get('revenue')
  @ApiOperation({ summary: 'Revenue report with filters: dateFrom, dateTo, tenantId, groupBy' })
  @ApiQuery({ name: 'dateFrom', required: false, type: String, description: 'Start date (ISO format)' })
  @ApiQuery({ name: 'dateTo', required: false, type: String, description: 'End date (ISO format)' })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'groupBy', required: false, type: String, enum: ['day', 'week', 'month'], default: 'day' })
  getRevenue(@Query('dateFrom') dateFrom?: string, @Query('dateTo') dateTo?: string, @Query('tenantId') tenantId?: string, @Query('groupBy') groupBy?: string) {
    return {
      revenue: 0,
      transactionCount: 0,
      averageOrderValue: 0,
      period: { dateFrom: dateFrom, dateTo: dateTo, tenantId, groupBy },
    };
  }

  @Get('merchants/:merchantId/analytics')
  @ApiOperation({ summary: 'Per-merchant analytics (for drill-down)' })
  @ApiParam({ name: 'merchantId', description: 'Merchant ID' })
  @ApiQuery({ name: 'dateFrom', required: false, type: String, description: 'Start date (ISO format)' })
  @ApiQuery({ name: 'dateTo', required: false, type: String, description: 'End date (ISO format)' })
  @ApiQuery({ name: 'groupBy', required: false, type: String, enum: ['day', 'week', 'month'], default: 'day' })
  getMerchantAnalytics(@Param() param: { merchantId: string }, @Query('dateFrom') dateFrom?: string, @Query('dateTo') dateTo?: string, @Query('groupBy') groupBy?: string) {
    return {
      merchantId: param.merchantId,
      revenue: 0,
      orderCount: 0,
      activeUsers: 0,
      conversionRate: 0,
      period: { dateFrom, dateTo, groupBy },
    };
  }
}