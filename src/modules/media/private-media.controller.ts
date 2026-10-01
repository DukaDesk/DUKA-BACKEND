import { Controller, Get, NotFoundException, Param, Res, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Response } from 'express';
import { StorageService } from './storage.service';

@ApiExcludeController()
@Controller({ path: 'media', version: '1' })
export class PrivateMediaController {
  constructor(private readonly storage: StorageService) {}

  @Get('private/:token')
  async getPrivateDocument(@Param('token') token: string, @Res() response: Response) {
    try {
      const file = await this.storage.readTemporaryFile(token);
      response.set({
        'Content-Type': file.contentType,
        'Content-Disposition': 'attachment; filename="compliance-document"',
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      });
      return response.send(file.body);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundException('Document not found');
      }
      throw new UnauthorizedException('Document link is invalid or expired');
    }
  }
}
