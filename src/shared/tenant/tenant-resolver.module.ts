import { Module } from '@nestjs/common';
import { TenantResolverService } from './tenant-resolver.service';
import { PrismaModule } from '../../common/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [TenantResolverService],
  exports: [TenantResolverService],
})
export class TenantResolverModule {}