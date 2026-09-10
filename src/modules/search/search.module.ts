import { Module } from '@nestjs/common';
import { SearchAppController } from './search-app.controller';
import { SearchPublicController } from './search-public.controller';
import { SearchService } from './search.service';
import { TenantResolverModule } from '../../shared/tenant/tenant-resolver.module';

@Module({
  imports: [TenantResolverModule],
  controllers: [SearchAppController, SearchPublicController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}