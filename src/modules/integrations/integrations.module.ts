import { Module } from '@nestjs/common';
import { IntegrationsAppController } from './integrations-app.controller';
import { IntegrationsPublicController } from './integrations-public.controller';
import { IntegrationsService } from './integrations.service';
import { SendGridConnector } from './connectors/sendgrid.connector';
import { GoogleCalendarConnector } from './connectors/google-calendar.connector';
import { TenantResolverModule } from '../../shared/tenant/tenant-resolver.module';

@Module({
  imports: [TenantResolverModule],
  controllers: [IntegrationsAppController, IntegrationsPublicController],
  providers: [IntegrationsService, SendGridConnector, GoogleCalendarConnector],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}