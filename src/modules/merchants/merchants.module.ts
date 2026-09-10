import { Module } from '@nestjs/common';
import { MerchantsController } from './merchants.controller';
import { MerchantsAppController } from './merchants-app.controller';
import { MerchantsService } from './merchants.service';
import { TenantConfigService } from './tenant-config.service';
import { SubscriptionService } from './subscription.service';
import { TenantResolverModule } from '../../shared/tenant/tenant-resolver.module';

@Module({
  imports: [TenantResolverModule],
  controllers: [MerchantsController, MerchantsAppController],
  providers: [MerchantsService, TenantConfigService, SubscriptionService],
  exports: [MerchantsService, TenantConfigService, SubscriptionService],
})
export class MerchantsModule {}