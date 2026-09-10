import { Module } from '@nestjs/common';
import { BookingAppController } from './booking-app.controller';
import { BookingPublicController } from './booking-public.controller';
import { BookingService } from './booking.service';
import { TenantResolverModule } from '../../shared/tenant/tenant-resolver.module';

@Module({
  imports: [TenantResolverModule],
  controllers: [BookingAppController, BookingPublicController],
  providers: [BookingService],
  exports: [BookingService],
})
export class BookingModule {}