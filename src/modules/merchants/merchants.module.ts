import { Module } from '@nestjs/common';
import { MerchantsController } from './merchants.controller';
import { MerchantsService } from './merchants.service';
import { TenantConfigService } from './tenant-config.service';
import { SubscriptionService } from './subscription.service';

@Module({
  controllers: [MerchantsController],
  providers: [MerchantsService, TenantConfigService, SubscriptionService],
  exports: [MerchantsService, TenantConfigService, SubscriptionService],
})
export class MerchantsModule {}
