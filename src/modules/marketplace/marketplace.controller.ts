import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { MarketplaceService } from './marketplace.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Marketplace & Plugins')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ version: '1' })
export class MarketplaceController {
  constructor(private readonly marketplaceService: MarketplaceService) {}

  // ─── Listings ────────────────────────────────────────────────

  @Post('marketplace/listings')
  @ApiOperation({ summary: 'Create marketplace listing' })
  createListing(@Body() data: {
    name: string; slug: string; type?: string; description?: string;
    version?: string; author?: string; price?: number; currency?: string;
    categories?: string[]; tags?: string[]; screenshots?: string[];
    iconUrl?: string; readme?: string; configSchema?: Record<string, any>;
    permissions?: string[]; dependencies?: Record<string, any>;
    isFree?: boolean; isPublished?: boolean;
  }) {
    return this.marketplaceService.createListing(data);
  }

  @Get('marketplace/listings')
  @ApiOperation({ summary: 'Get published listings' })
  getPublishedListings(
    @Query('type') type?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.marketplaceService.getPublishedListings(
      type,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
    );
  }

  @Get('marketplace/listings/all')
  @ApiOperation({ summary: 'Get all listings (admin)' })
  getAllListings(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.marketplaceService.getAllListings(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 50,
    );
  }

  @Get('marketplace/listings/:slug')
  @ApiOperation({ summary: 'Get listing by slug' })
  getListing(@Param('slug') slug: string) {
    return this.marketplaceService.getListing(slug);
  }

  @Put('marketplace/listings/:slug')
  @ApiOperation({ summary: 'Update listing' })
  updateListing(@Param('slug') slug: string, @Body() data: any) {
    return this.marketplaceService.updateListing(slug, data);
  }

  @Delete('marketplace/listings/:slug')
  @ApiOperation({ summary: 'Delete listing' })
  deleteListing(@Param('slug') slug: string) {
    return this.marketplaceService.deleteListing(slug);
  }

  @Post('marketplace/listings/:slug/download')
  @ApiOperation({ summary: 'Record download' })
  recordDownload(@Param('slug') slug: string) {
    return this.marketplaceService.recordDownload(slug);
  }

  // ─── Plugin Installation ─────────────────────────────────────

  @Post('marketplace/install')
  @ApiOperation({ summary: 'Install plugin' })
  installPlugin(
    @Query('tenantId') tenantId: string,
    @Body() data: { listingSlug: string },
  ) {
    return this.marketplaceService.installPlugin(tenantId, data.listingSlug);
  }

  @Get('marketplace/installed')
  @ApiOperation({ summary: 'Get installed plugins' })
  @ApiQuery({ name: 'tenantId', required: true })
  getInstalledPlugins(@Query('tenantId') tenantId: string) {
    return this.marketplaceService.getInstalledPlugins(tenantId);
  }

  @Put('marketplace/installed/:listingSlug/config')
  @ApiOperation({ summary: 'Update plugin config' })
  updatePluginConfig(
    @Query('tenantId') tenantId: string,
    @Param('listingSlug') listingSlug: string,
    @Body() config: Record<string, any>,
  ) {
    return this.marketplaceService.updatePluginConfig(tenantId, listingSlug, config);
  }

  @Post('marketplace/installed/:listingSlug/toggle')
  @ApiOperation({ summary: 'Toggle plugin active state' })
  togglePlugin(
    @Query('tenantId') tenantId: string,
    @Param('listingSlug') listingSlug: string,
    @Body() data: { isActive: boolean },
  ) {
    return this.marketplaceService.togglePlugin(tenantId, listingSlug, data.isActive);
  }

  @Delete('marketplace/installed/:listingSlug')
  @ApiOperation({ summary: 'Uninstall plugin' })
  uninstallPlugin(
    @Query('tenantId') tenantId: string,
    @Param('listingSlug') listingSlug: string,
  ) {
    return this.marketplaceService.uninstallPlugin(tenantId, listingSlug);
  }

  @Get('marketplace/stats')
  @ApiOperation({ summary: 'Marketplace statistics' })
  getStats() {
    return this.marketplaceService.getPluginStats();
  }
}
