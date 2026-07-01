import { Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { TenantConfigService } from './tenant-config.service';
import { SubscriptionService } from './subscription.service';

@Module({
  controllers: [TenantsController],
  providers: [TenantsService, TenantConfigService, SubscriptionService],
  exports: [TenantsService, TenantConfigService, SubscriptionService],
})
export class TenantsModule {}
