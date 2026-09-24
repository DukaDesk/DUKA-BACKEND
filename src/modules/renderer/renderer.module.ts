import { Module } from '@nestjs/common';
import { RendererController } from './renderer.controller';
import { RendererService } from './renderer.service';
import { ReleasesModule } from '../../shared/releases/releases.module';

@Module({
  imports: [ReleasesModule],
  controllers: [RendererController],
  providers: [RendererService],
  exports: [RendererService],
})
export class RendererModule {}
