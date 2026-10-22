import { Controller, Get, Post, Delete, Param, Query, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiExcludeEndpoint } from '@nestjs/swagger';
import { MobileBffService } from './mobile-bff.service';
import { UsersService } from '../../modules/users/users.service';
import { DeactivateProfileDto } from '../../modules/users/dto/deactivate-profile.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Mobile BFF')
@Controller({ path: 'bff/mobile', version: '1' })
export class MobileBffController {
  constructor(
    private readonly mobile: MobileBffService,
    private readonly usersService: UsersService,
  ) {}

  @Public()
  @Get('merchants/:slug/manifest')
  @ApiOperation({ summary: 'Get aggregated app manifest for mobile runtime' })
  getManifest(@Param('slug') slug: string) {
    return this.mobile.getTenantManifest(slug);
  }

  // Temporary compatibility route for already installed mobile clients.
  @Public()
  @Get('tenant/:slug/manifest')
  @ApiExcludeEndpoint()
  getLegacyManifest(@Param('slug') slug: string) {
    return this.getManifest(slug);
  }

  @Public()
  @Get('discovery')
  @ApiOperation({ summary: 'Get discovery feed (featured + categories)' })
  getDiscovery() {
    return this.mobile.getDiscoveryFeed();
  }

  // ─── Promo feed ────────────────────────────────────────────────
  // Endpoints are JWT-optional: a bearer token personalizes likedByMe, and
  // anonymous devices pass their own actor id (MMKV device key) via query.

  @UseGuards(OptionalJwtAuthGuard)
  @Get('feed')
  @ApiOperation({ summary: 'Promo feed — latest posts across publicly live tenants' })
  getFeed(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('actorId') actorId?: string,
    @CurrentUser('id') userId?: string,
  ) {
    return this.mobile.getFeedPosts(page, limit, userId ?? actorId);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('feed/:postId')
  @ApiOperation({ summary: 'One promo post (promo screen data)' })
  getFeedPost(
    @Param('postId') postId: string,
    @Query('actorId') actorId?: string,
    @CurrentUser('id') userId?: string,
  ) {
    return this.mobile.getFeedPost(postId, userId ?? actorId);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('feed/:postId/like')
  @ApiOperation({ summary: 'Toggle like (signed-in users dedupe by account; anonymous by device key)' })
  likeFeedPost(
    @Param('postId') postId: string,
    @Query('actorId') actorId?: string,
    @CurrentUser('id') userId?: string,
  ) {
    return this.mobile.toggleFeedLike(postId, userId ?? actorId, userId);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('feed/:postId/share')
  @ApiOperation({ summary: 'Record a share of a promo post' })
  shareFeedPost(
    @Param('postId') postId: string,
    @CurrentUser('id') userId?: string,
  ) {
    return this.mobile.markFeedShare(postId, userId);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('feed/:postId/cta')
  @ApiOperation({ summary: 'Record patronage and resolve the merchant app the promo opens' })
  feedCta(
    @Param('postId') postId: string,
    @CurrentUser('id') userId?: string,
  ) {
    return this.mobile.trackFeedCta(postId, userId);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('inbox')
  @ApiOperation({ summary: 'Platform comms inbox: mobile broadcasts + direct messages (actor-keyed)' })
  getInbox(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('actorId') actorId: string,
    @CurrentUser('id') userId?: string,
  ) {
    return this.mobile.getInbox(page, limit, userId ?? actorId, userId);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('inbox/:id/read')
  @ApiOperation({ summary: 'Mark an inbox message read (drives unread dots)' })
  markInboxRead(
    @Param('id') id: string,
    @Query('actorId') actorId: string,
    @CurrentUser('id') userId?: string,
  ) {
    return this.mobile.markInboxRead(id, userId ?? actorId);
  }

  @Public()
  @Get('discovery/categories/:categoryId/apps')
  @ApiOperation({ summary: 'Get published tenant apps under a discovery category' })
  getCategoryApps(@Param('categoryId') categoryId: string) {
    return this.mobile.getTenantsByCategory(categoryId);
  }

  @Public()
  @Get('merchants/:merchantId/catalog')
  @ApiOperation({ summary: 'Get merchant catalog with products' })
  getCatalog(@Param('merchantId') merchantId: string, @Query() query: any) {
    return this.mobile.getTenantCatalog(merchantId, query);
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
