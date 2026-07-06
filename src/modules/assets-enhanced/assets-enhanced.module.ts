import { Module } from '@nestjs/common';
import { AssetsEnhancedController } from './assets-enhanced.controller';
import { AssetsEnhancedService } from './assets-enhanced.service';

@Module({
  controllers: [AssetsEnhancedController],
  providers: [AssetsEnhancedService],
  exports: [AssetsEnhancedService],
})
export class AssetsEnhancedModule {}
