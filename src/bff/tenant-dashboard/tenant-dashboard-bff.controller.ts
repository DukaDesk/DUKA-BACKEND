import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TenantDashboardBffService } from './tenant-dashboard-bff.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Tenant Dashboard BFF')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'bff/tenant', version: '1' })
export class TenantDashboardBffController {
  constructor(private readonly bff: TenantDashboardBffService) {}

  @Get(':id/summary')
  @ApiOperation({ summary: 'Get tenant dashboard summary' })
  getSummary(@Param('id') id: string) {
    return this.bff.getDashboardSummary(id);
  }

  @Get(':id/analytics')
  @ApiOperation({ summary: 'Get tenant analytics (30d)' })
  getAnalytics(@Param('id') id: string) {
    return this.bff.getAnalyticsSummary(id);
  }

  @Get(':id/integrations')
  @ApiOperation({ summary: 'Get connected integration status' })
  getIntegrations(@Param('id') id: string) {
    return this.bff.getIntegrationStatus(id);
  }
}
