import { Module } from '@nestjs/common';
import { NotificationsAppController } from './notifications-app.controller';
import { NotificationsPublicController } from './notifications-public.controller';
import { NotificationsService } from './notifications.service';
import { SmsAdapter } from './adapters/sms.adapter';
import { EmailAdapter } from './adapters/email.adapter';
import { PushAdapter } from './adapters/push.adapter';
import { TenantResolverModule } from '../../shared/tenant/tenant-resolver.module';

@Module({
  imports: [TenantResolverModule],
  controllers: [NotificationsAppController, NotificationsPublicController],
  providers: [NotificationsService, SmsAdapter, EmailAdapter, PushAdapter],
  exports: [NotificationsService, SmsAdapter, EmailAdapter, PushAdapter],
})
export class NotificationsModule {}