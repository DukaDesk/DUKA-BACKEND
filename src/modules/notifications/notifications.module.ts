import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { SmsAdapter } from './adapters/sms.adapter';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, SmsAdapter],
  exports: [NotificationsService, SmsAdapter],
})
export class NotificationsModule {}
