import {
  Controller, Get, Post, Delete, Param, Query, Body, UseGuards, UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { CommsService } from '../comms/comms.service';
import { MediaService } from '../media/media.service';
import { CreateAnnouncementDto, CommsReplyDto, ListAnnouncementsDto } from '../comms/dto/comms.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PlatformRoleGuard, RequirePlatformRoles } from './platform-role.guard';

@ApiTags('Admin Comms (Platform Messaging)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PlatformRoleGuard)
@RequirePlatformRoles('super_admin', 'platform_operator')
@Controller({ path: 'admin', version: '1' })
export class AdminMessagingController {
  constructor(
    private readonly comms: CommsService,
    private readonly mediaService: MediaService,
  ) {}

  @Post('messages')
  @ApiOperation({ summary: 'Send a broadcast (merchants/mobile/both) or a direct message' })
  async create(@Body() dto: CreateAnnouncementDto) {
    return this.comms.createAnnouncement(dto);
  }

  @Get('messages')
  @ApiOperation({ summary: 'List platform messaging inbox' })
  async list(@Query() query: ListAnnouncementsDto) {
    return this.comms.listAll(query.page, query.limit, query.kind, query.audience);
  }

  @Get('messages/:id')
  @ApiOperation({ summary: 'Full thread: message, replies, read receipts count' })
  async thread(@Param('id') id: string) {
    return this.comms.getThread(id);
  }

  @Post('messages/:id/replies')
  @ApiOperation({ summary: 'Answer a thread as the platform' })
  async reply(@Param('id') id: string, @Body() dto: CommsReplyDto) {
    return this.comms.addPlatformReply(id, dto.body);
  }

  @Delete('messages/:id')
  @ApiOperation({ summary: 'Retract a message (replies + read receipts cascade)' })
  async remove(@Param('id') id: string) {
    return this.comms.deleteAnnouncement(id);
  }

  @Post('media/upload')
  @ApiOperation({ summary: 'Platform media for announcements (rides the platform tenant DAM)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'File to upload (max 50MB, images or video)' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  async upload(@UploadedFile() file: any) {
    const platformTenantId = await this.comms.getPlatformTenantId();
    return this.mediaService.upload(platformTenantId, file);
  }
}
