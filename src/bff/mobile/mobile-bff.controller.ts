import { Controller, Get, Post, Delete, Param, Query, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { MobileBffService } from './mobile-bff.service';
import { UsersService } from '../../modules/users/users.service';
import { DeactivateProfileDto } from '../../modules/users/dto/deactivate-profile.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Mobile BFF')
@Controller({ path: 'bff/mobile', version: '1' })
export class MobileBffController {
  constructor(
    private readonly mobile: MobileBffService,
    private readonly usersService: UsersService,
  ) {}

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

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('profile/deactivate')
  @ApiOperation({ summary: 'Deactivate profile (30-day soft delete)' })
  deactivate(@CurrentUser('id') userId: string, @Body() dto?: DeactivateProfileDto) {
    return this.usersService.deactivate(userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('profile/reactivate')
  @ApiOperation({ summary: 'Reactivate a deactivated profile' })
  reactivate(@CurrentUser('id') userId: string) {
    return this.usersService.reactivate(userId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Delete('profile')
  @ApiOperation({ summary: 'Permanently delete profile immediately' })
  permanentDelete(@CurrentUser('id') userId: string) {
    return this.usersService.permanentDelete(userId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('profile/deactivation-status')
  @ApiOperation({ summary: 'Get deactivation status and days remaining' })
  getDeactivationStatus(@CurrentUser('id') userId: string) {
    return this.usersService.getDeactivationStatus(userId);
  }
}
