import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { ImageOptimizer } from './image-optimizer.service';

@Module({
  controllers: [MediaController],
  providers: [MediaService, ImageOptimizer],
  exports: [MediaService, ImageOptimizer],
})
export class MediaModule {}
