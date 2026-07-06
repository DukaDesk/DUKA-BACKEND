import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AssetsEnhancedService } from './assets-enhanced.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Asset Platform Enhanced')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ version: '1' })
export class AssetsEnhancedController {
  constructor(private readonly assetsService: AssetsEnhancedService) {}

  // ─── Collections ─────────────────────────────────────────────

  @Post('assets/collections')
  @ApiOperation({ summary: 'Create asset collection' })
  createCollection(@Body() data: {
    tenantId: string; name: string; slug: string;
    description?: string; coverUrl?: string; isPublic?: boolean;
  }) {
    return this.assetsService.createCollection(data);
  }

  @Get('assets/collections')
  @ApiOperation({ summary: 'List collections' })
  @ApiQuery({ name: 'tenantId', required: true })
  getCollections(@Query('tenantId') tenantId: string) {
    return this.assetsService.getCollections(tenantId);
  }

  @Get('assets/collections/:id')
  @ApiOperation({ summary: 'Get collection with media' })
  getCollection(@Param('id') id: string) {
    return this.assetsService.getCollection(id);
  }

  @Put('assets/collections/:id')
  @ApiOperation({ summary: 'Update collection' })
  updateCollection(@Param('id') id: string, @Body() data: any) {
    return this.assetsService.updateCollection(id, data);
  }

  @Delete('assets/collections/:id')
  @ApiOperation({ summary: 'Delete collection' })
  deleteCollection(@Param('id') id: string) {
    return this.assetsService.deleteCollection(id);
  }

  @Post('assets/collections/:collectionId/media')
  @ApiOperation({ summary: 'Add media to collection' })
  addMedia(
    @Param('collectionId') collectionId: string,
    @Body() data: { mediaId: string; order?: number },
  ) {
    return this.assetsService.addMediaToCollection(collectionId, data.mediaId, data.order);
  }

  @Delete('assets/collections/:collectionId/media/:mediaId')
  @ApiOperation({ summary: 'Remove media from collection' })
  removeMedia(
    @Param('collectionId') collectionId: string,
    @Param('mediaId') mediaId: string,
  ) {
    return this.assetsService.removeMediaFromCollection(collectionId, mediaId);
  }

  // ─── Sharing ─────────────────────────────────────────────────

  @Post('assets/shares')
  @ApiOperation({ summary: 'Create share link' })
  createShare(@Body() data: {
    tenantId: string; mediaId: string;
    expiresAt?: string; maxDownloads?: number; password?: string; createdBy?: string;
  }) {
    return this.assetsService.createShare(data);
  }

  @Get('assets/shares')
  @ApiOperation({ summary: 'List share links' })
  @ApiQuery({ name: 'tenantId', required: true })
  getShares(@Query('tenantId') tenantId: string) {
    return this.assetsService.getSharedLinks(tenantId);
  }

  @Get('assets/shares/:token')
  @ApiOperation({ summary: 'Resolve share token (public)' })
  resolveShare(@Param('token') token: string) {
    return this.assetsService.resolveShareToken(token);
  }

  @Delete('assets/shares/:id')
  @ApiOperation({ summary: 'Deactivate share link' })
  deactivateShare(@Param('id') id: string) {
    return this.assetsService.deactivateShare(id);
  }

  // ─── Storage Providers ───────────────────────────────────────

  @Post('assets/storage')
  @ApiOperation({ summary: 'Create storage provider' })
  createStorage(@Body() data: {
    tenantId?: string; name: string; provider: string;
    config?: Record<string, any>; isDefault?: boolean;
  }) {
    return this.assetsService.createStorageProvider(data);
  }

  @Get('assets/storage')
  @ApiOperation({ summary: 'List storage providers' })
  @ApiQuery({ name: 'tenantId', required: false })
  getStorage(@Query('tenantId') tenantId?: string) {
    return this.assetsService.getStorageProviders(tenantId);
  }

  @Put('assets/storage/:id')
  @ApiOperation({ summary: 'Update storage provider' })
  updateStorage(@Param('id') id: string, @Body() data: any) {
    return this.assetsService.updateStorageProvider(id, data);
  }

  @Get('assets/storage/stats')
  @ApiOperation({ summary: 'Storage statistics' })
  getStorageStats(@Query('tenantId') tenantId?: string) {
    return this.assetsService.getStorageStats(tenantId);
  }

  // ─── Transformation ──────────────────────────────────────────

  @Get('assets/transforms')
  @ApiOperation({ summary: 'Get transformation presets' })
  getPresets() {
    return this.assetsService.getTransformationPresets();
  }

  @Post('assets/transforms/:mediaId')
  @ApiOperation({ summary: 'Transform asset' })
  transformAsset(
    @Param('mediaId') mediaId: string,
    @Body() options: {
      width?: number; height?: number; fit?: string; format?: string; quality?: number;
    },
  ) {
    return this.assetsService.transformAsset(mediaId, options);
  }
}
