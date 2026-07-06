import { Module } from '@nestjs/common';
import { ThemeController } from './theme.controller';
import { ThemeService } from './theme.service';
import { ThemeCompiler } from './theme-compiler.service';

@Module({
  controllers: [ThemeController],
  providers: [ThemeService, ThemeCompiler],
  exports: [ThemeService, ThemeCompiler],
})
export class ThemeModule {}
