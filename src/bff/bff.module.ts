import { Module } from '@nestjs/common';
import { MobileBffController } from './mobile/mobile-bff.controller';
import { MobileBffService } from './mobile/mobile-bff.service';
import { TenantDashboardBffController } from './tenant-dashboard/tenant-dashboard-bff.controller';
import { TenantDashboardBffService } from './tenant-dashboard/tenant-dashboard-bff.service';
import { BusinessDashboardBffController } from './business-dashboard/business-dashboard-bff.controller';
import { BusinessDashboardBffService } from './business-dashboard/business-dashboard-bff.service';
import { WebsiteBffController } from './website/website-bff.controller';
import { WebsiteBffService } from './website/website-bff.service';

@Module({
  controllers: [
    MobileBffController,
    TenantDashboardBffController,
    BusinessDashboardBffController,
    WebsiteBffController,
  ],
  providers: [
    MobileBffService,
    TenantDashboardBffService,
    BusinessDashboardBffService,
    WebsiteBffService,
  ],
  exports: [
    MobileBffService,
    TenantDashboardBffService,
    BusinessDashboardBffService,
    WebsiteBffService,
  ],
})
export class BffModule {}
