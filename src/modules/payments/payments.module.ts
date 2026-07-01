import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaystackAdapter } from './providers/paystack.adapter';
import { FlutterwaveAdapter } from './providers/flutterwave.adapter';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, PaystackAdapter, FlutterwaveAdapter],
  exports: [PaymentsService],
})
export class PaymentsModule {}
