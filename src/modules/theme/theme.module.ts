import { Module } from '@nestjs/common';
import { ThemeAppController } from './theme-app.controller';
import { ThemePublicController } from './theme-public.controller';
import { ThemeService } from './theme.service';
import { ThemeCompiler } from './theme-compiler.service';
import { TenantResolverModule } from '../../shared/tenant/tenant-resolver.module';

@Module({
  imports: [TenantResolverModule],
  controllers: [ThemeAppController, ThemePublicController],
  providers: [ThemeService, ThemeCompiler],
  exports: [ThemeService, ThemeCompiler],
})
export class ThemeModule {}