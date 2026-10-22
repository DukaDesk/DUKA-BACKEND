import { Module } from '@nestjs/common';
import { CommsService } from './comms.service';
import { CommsAppController } from './comms-app.controller';
import { TenantResolverModule } from '../../shared/tenant/tenant-resolver.module';

@Module({
  imports: [TenantResolverModule],
  controllers: [CommsAppController],
  providers: [CommsService],
  exports: [CommsService],
})
export class CommsModule {}
