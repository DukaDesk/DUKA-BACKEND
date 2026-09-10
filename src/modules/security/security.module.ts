import { Module } from '@nestjs/common';
import { SecurityAppController } from './security-app.controller';
import { SecurityPublicController } from './security-public.controller';
import { SecurityService } from './security.service';
import { TenantResolverModule } from '../../shared/tenant/tenant-resolver.module';

@Module({
  imports: [TenantResolverModule],
  controllers: [SecurityAppController, SecurityPublicController],
  providers: [SecurityService],
  exports: [SecurityService],
})
export class SecurityModule {}