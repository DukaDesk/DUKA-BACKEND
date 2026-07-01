import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { MobileBffService } from './mobile-bff.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Mobile BFF')
@Controller({ path: 'bff/mobile', version: '1' })
export class MobileBffController {
  constructor(private readonly mobile: MobileBffService) {}

  @Public()
  @Get('tenant/:slug/manifest')
  @ApiOperation({ summary: 'Get aggregated app manifest for mobile runtime' })
  getManifest(@Param('slug') slug: string) {
    return this.mobile.getTenantManifest(slug);
  }

  @Public()
  @Get('discovery')
  @ApiOperation({ summary: 'Get discovery feed (featured + categories)' })
  getDiscovery() {
    return this.mobile.getDiscoveryFeed();
  }

  @Public()
  @Get('tenants/:tenantId/catalog')
  @ApiOperation({ summary: 'Get tenant catalog with products' })
  getCatalog(@Param('tenantId') tenantId: string, @Query() query: any) {
    return this.mobile.getTenantCatalog(tenantId, query);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('profile')
  @ApiOperation({ summary: 'Get aggregated user profile with memberships + consents' })
  getProfile(@CurrentUser('id') userId: string) {
    return this.mobile.getUserProfile(userId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('notifications')
  @ApiOperation({ summary: 'Get notifications with unread count' })
  getNotifications(@CurrentUser('id') userId: string) {
    return this.mobile.getNotifications(userId);
  }
}
