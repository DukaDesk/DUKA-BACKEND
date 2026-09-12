import {
  Controller, Get, Post, Delete, Patch, Param, Query, Body,
  UseGuards, UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiBody, ApiQuery } from '@nestjs/swagger';
import { MediaService } from './media.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TenantResolverService } from '../../shared/tenant/tenant-resolver.service';
import { UpdateMediaDto, CreateFolderDto, UpdateFolderDto } from './dto/media.dto';

@ApiTags('Media / DAM - App (Tenant Self-Service)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'app/media', version: '1' })
export class MediaAppController {
  constructor(
    private readonly mediaService: MediaService,
    private readonly tenantResolver: TenantResolverService,
  ) {}

  private async getTenantId(userId: string): Promise<string> {
    return this.tenantResolver.resolveTenantId(userId);
  }

  @Post('upload')
  @ApiOperation({ summary: 'Upload file with auto-optimization and variant generation' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'File to upload (max 10MB)' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async upload(
    @CurrentUser('id') userId: string,
    @UploadedFile() file: any,
    @Query('folderId') folderId?: string,
  ) {
    const tenantId = await this.getTenantId(userId);
    return this.mediaService.upload(tenantId, file, folderId);
  }

  @Get()
  @ApiOperation({ summary: 'List media files, optionally filtered by folder' })
  @ApiQuery({ name: 'folderId', required: false })
  async findAll(
    @CurrentUser('id') userId: string,
    @Query('folderId') folderId?: string,
  ) {
    const tenantId = await this.getTenantId(userId);
    return this.mediaService.findAll(tenantId, folderId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get media details with versions' })
  findOne(@Param('id') id: string) {
    return this.mediaService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update media metadata (fileName, alt, folderId, visibility)' })
  update(@Param('id') id: string, @Body() data: UpdateMediaDto) {
    return this.mediaService.update(id, data);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete media file and all variants' })
  delete(@Param('id') id: string) {
    return this.mediaService.delete(id);
  }

  @Get(':id/cdn-url')
  @ApiOperation({ summary: 'Get CDN delivery URL, optionally for a variant' })
  @ApiQuery({ name: 'variant', required: false })
  getCdnUrl(@Param('id') id: string, @Query('variant') variant?: string) {
    return this.mediaService.getCdnUrl(id, variant);
  }

  // ─── Folders ─────────────────────────────────────────────

  @Post('folders')
  @ApiOperation({ summary: 'Create asset folder' })
  async createFolder(
    @CurrentUser('id') userId: string,
    @Body() data: CreateFolderDto,
  ) {
    const tenantId = await this.getTenantId(userId);
    return this.mediaService.createFolder(tenantId, data.name, data.parentId);
  }

  @Get('folders')
  @ApiOperation({ summary: 'List asset folders' })
  @ApiQuery({ name: 'parentId', required: false })
  async getFolders(
    @CurrentUser('id') userId: string,
    @Query('parentId') parentId?: string,
  ) {
    const tenantId = await this.getTenantId(userId);
    return this.mediaService.getFolders(tenantId, parentId);
  }

  @Patch('folders/:id')
  @ApiOperation({ summary: 'Update folder' })
  updateFolder(@Param('id') id: string, @Body() data: UpdateFolderDto) {
    return this.mediaService.updateFolder(id, data);
  }

  @Delete('folders/:id')
  @ApiOperation({ summary: 'Delete empty folder' })
  deleteFolder(@Param('id') id: string) {
    return this.mediaService.deleteFolder(id);
  }
}
