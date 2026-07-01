import {
  Controller, Get, Post, Delete, Patch, Param, Query, Body,
  UseGuards, UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { MediaService } from './media.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Media / DAM')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'tenants/:tenantId/media', version: '1' })
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('upload')
  @ApiOperation({ summary: 'Upload file with auto-optimization and variant generation' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @Param('tenantId') tenantId: string,
    @UploadedFile() file: any,
    @Query('folderId') folderId?: string,
  ) {
    return this.mediaService.upload(tenantId, file, folderId);
  }

  @Get()
  @ApiOperation({ summary: 'List media files, optionally filtered by folder' })
  findAll(
    @Param('tenantId') tenantId: string,
    @Query('folderId') folderId?: string,
  ) {
    return this.mediaService.findAll(tenantId, folderId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get media details with versions' })
  findOne(@Param('id') id: string) {
    return this.mediaService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update media metadata (fileName, alt, folderId, visibility)' })
  update(@Param('id') id: string, @Body() data: { fileName?: string; alt?: string; folderId?: string | null; visibility?: string }) {
    return this.mediaService.update(id, data);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete media file and all variants' })
  delete(@Param('id') id: string) {
    return this.mediaService.delete(id);
  }

  @Get(':id/cdn-url')
  @ApiOperation({ summary: 'Get CDN delivery URL, optionally for a variant' })
  getCdnUrl(@Param('id') id: string, @Query('variant') variant?: string) {
    return this.mediaService.getCdnUrl(id, variant);
  }

  // ─── Folders ─────────────────────────────────────────────

  @Post('folders')
  @ApiOperation({ summary: 'Create asset folder' })
  createFolder(
    @Param('tenantId') tenantId: string,
    @Body() data: { name: string; parentId?: string },
  ) {
    return this.mediaService.createFolder(tenantId, data.name, data.parentId);
  }

  @Get('folders')
  @ApiOperation({ summary: 'List asset folders' })
  getFolders(
    @Param('tenantId') tenantId: string,
    @Query('parentId') parentId?: string,
  ) {
    return this.mediaService.getFolders(tenantId, parentId);
  }

  @Patch('folders/:id')
  @ApiOperation({ summary: 'Update folder' })
  updateFolder(@Param('id') id: string, @Body() data: { name?: string; parentId?: string | null }) {
    return this.mediaService.updateFolder(id, data);
  }

  @Delete('folders/:id')
  @ApiOperation({ summary: 'Delete empty folder' })
  deleteFolder(@Param('id') id: string) {
    return this.mediaService.deleteFolder(id);
  }
}
