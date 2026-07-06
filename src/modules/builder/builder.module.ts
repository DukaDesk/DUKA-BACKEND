import { Module } from '@nestjs/common';
import { BuilderController } from './builder.controller';
import { BuilderService } from './builder.service';
import { ComponentRegistryService } from './component-registry.service';
import { ActionBuilderService } from './action-builder.service';
import { ConditionalEngineService } from './conditional-engine.service';
import { DataBindingService } from './data-binding.service';
import { LivePreviewService } from './live-preview.service';
import { ThemeModule } from '../theme/theme.module';

@Module({
  imports: [ThemeModule],
  controllers: [BuilderController],
  providers: [
    BuilderService,
    ComponentRegistryService,
    ActionBuilderService,
    ConditionalEngineService,
    DataBindingService,
    LivePreviewService,
  ],
  exports: [
    BuilderService,
    ComponentRegistryService,
    ActionBuilderService,
    ConditionalEngineService,
    DataBindingService,
    LivePreviewService,
  ],
})
export class BuilderModule {}
