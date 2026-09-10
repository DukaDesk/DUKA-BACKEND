import { Module } from '@nestjs/common';
import { FormsAppController } from './forms-app.controller';
import { FormsPublicController } from './forms-public.controller';
import { FormsService } from './forms.service';
import { TenantResolverModule } from '../../shared/tenant/tenant-resolver.module';

@Module({
  imports: [TenantResolverModule],
  controllers: [FormsAppController, FormsPublicController],
  providers: [FormsService],
  exports: [FormsService],
})
export class FormsModule {}