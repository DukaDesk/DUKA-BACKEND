import { Module } from '@nestjs/common';
import { PublishingController } from './publishing.controller';
import { PublishingService } from './publishing.service';
import { ManifestCompiler } from './compiler/manifest-compiler.service';
import { ValidationEngine } from './validation/validation-engine.service';

@Module({
  controllers: [PublishingController],
  providers: [PublishingService, ManifestCompiler, ValidationEngine],
  exports: [PublishingService, ManifestCompiler, ValidationEngine],
})
export class PublishingModule {}
