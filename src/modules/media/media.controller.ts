import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { MediaService } from './media.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Media')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'tenants/:tenantId/media', version: '1' })
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('upload')
  @ApiOperation({ summary: 'Upload a file' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @Param('tenantId') tenantId: string,
    @UploadedFile() file: any,
  ) {
    return this.mediaService.upload(tenantId, file);
  }

  @Get()
  @ApiOperation({ summary: 'Get all media for a tenant' })
  findAll(@Param('tenantId') tenantId: string) {
    return this.mediaService.findAll(tenantId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a media file' })
  delete(@Param('id') id: string) {
    return this.mediaService.delete(id);
  }
}
