import { Module } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { SendGridConnector } from './connectors/sendgrid.connector';
import { GoogleCalendarConnector } from './connectors/google-calendar.connector';

@Module({
  controllers: [IntegrationsController],
  providers: [IntegrationsService, SendGridConnector, GoogleCalendarConnector],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
