import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { SmsAdapter } from './adapters/sms.adapter';
import { EmailAdapter } from './adapters/email.adapter';
import { PushAdapter } from './adapters/push.adapter';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, SmsAdapter, EmailAdapter, PushAdapter],
  exports: [NotificationsService, SmsAdapter, EmailAdapter, PushAdapter],
})
export class NotificationsModule {}
