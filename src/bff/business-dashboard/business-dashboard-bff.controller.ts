import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { BusinessDashboardBffService } from './business-dashboard-bff.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

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

  @Get('tenants')
  @ApiOperation({ summary: 'Get paginated tenant list' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  getTenants(@Query('status') status?: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.bff.getTenantsList(status, parseInt(page || '1') || 1, parseInt(limit || '20') || 20);
  }

  @Get('audit')
  @ApiOperation({ summary: 'Get recent audit logs' })
  getAuditLogs() {
    return this.bff.getRecentAuditLogs();
  }
}
