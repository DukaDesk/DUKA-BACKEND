import { DataConsentModule } from '../data-consent/data-consent.module';
import { Module } from '@nestjs/common';
import { CommerceAppController } from './commerce-app.controller';
import { CommercePublicController } from './commerce-public.controller';
import { CommerceService } from './commerce.service';
import { TenantResolverModule } from '../../shared/tenant/tenant-resolver.module';

@Module({
  imports: [TenantResolverModule, DataConsentModule],
  controllers: [CommerceAppController, CommercePublicController],
  providers: [CommerceService],
  exports: [CommerceService],
})
export class CommerceModule {}