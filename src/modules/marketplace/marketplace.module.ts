import { Module } from '@nestjs/common';
import { MarketplaceController } from './marketplace.controller';
import { MarketplaceService } from './marketplace.service';
import { PlatformRoleGuard } from '../admin/platform-role.guard';

@Module({
  controllers: [MarketplaceController],
  providers: [MarketplaceService, PlatformRoleGuard],
  exports: [MarketplaceService],
})
export class MarketplaceModule {}
