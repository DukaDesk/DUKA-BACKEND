import { Module } from '@nestjs/common';
import { MediaAppController } from './media-app.controller';
import { MediaService } from './media.service';
import { ImageOptimizer } from './image-optimizer.service';
import { StorageService } from './storage.service';
import { TenantResolverModule } from '../../shared/tenant/tenant-resolver.module';

@Module({
  imports: [TenantResolverModule],
  controllers: [MediaAppController],
  providers: [MediaService, ImageOptimizer, StorageService],
  exports: [MediaService, ImageOptimizer, StorageService],
})
export class MediaModule {}