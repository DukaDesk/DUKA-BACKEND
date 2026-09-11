import { Module } from '@nestjs/common';
import { AnalyticsAppController } from './analytics-app.controller';
import { AnalyticsPublicController } from './analytics-public.controller';
import { AnalyticsService } from './analytics.service';
import { ReportsService } from './reports.service';
import { DashboardsService } from './dashboards.service';
import { TenantResolverModule } from '../../shared/tenant/tenant-resolver.module';

@Module({
  imports: [TenantResolverModule],
  controllers: [AnalyticsAppController, AnalyticsPublicController],
  providers: [AnalyticsService, ReportsService, DashboardsService],
  exports: [AnalyticsService, DashboardsService],
})
export class AnalyticsModule {}