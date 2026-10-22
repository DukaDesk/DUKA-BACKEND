import { Module } from '@nestjs/common';
import { FeedService } from './feed.service';
import { FeedAppController } from './feed-app.controller';
import { TenantResolverModule } from '../../shared/tenant/tenant-resolver.module';

@Module({
  imports: [TenantResolverModule],
  controllers: [FeedAppController],
  providers: [FeedService],
  exports: [FeedService],
})
export class FeedModule {}
