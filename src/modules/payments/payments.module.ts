import { Module } from '@nestjs/common';
import { PaymentsAppController } from './payments-app.controller';
import { PaymentsPublicController } from './payments-public.controller';
import { PaymentsService } from './payments.service';
import { PaystackAdapter } from './providers/paystack.adapter';
import { FlutterwaveAdapter } from './providers/flutterwave.adapter';
import { StripeAdapter } from './providers/stripe.adapter';
import { TenantResolverModule } from '../../shared/tenant/tenant-resolver.module';

@Module({
  imports: [TenantResolverModule],
  controllers: [PaymentsAppController, PaymentsPublicController],
  providers: [PaymentsService, PaystackAdapter, FlutterwaveAdapter, StripeAdapter],
  exports: [PaymentsService],
})
export class PaymentsModule {}