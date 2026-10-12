import { Module } from '@nestjs/common';
import { ReleasesModule } from '../../shared/releases/releases.module';
import { DataConsentService } from './data-consent.service';
import { DataConsentController } from './data-consent.controller';
@Module({ imports: [ReleasesModule], providers: [DataConsentService], controllers: [DataConsentController], exports: [DataConsentService] })
export class DataConsentModule {}
