import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { ReportsService } from './reports.service';
import { DashboardsService } from './dashboards.service';

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService, ReportsService, DashboardsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
