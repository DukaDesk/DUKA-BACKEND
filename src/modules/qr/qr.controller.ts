import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { QrService } from './qr.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('QR')
@Controller({ path: 'qr', version: '1' })
export class QrController {
  constructor(private readonly qrService: QrService) {}

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('generate/:merchantId')
  @ApiOperation({ summary: 'Generate QR code data for a merchant' })
  generate(@Param('merchantId') merchantId: string) {
    return this.qrService.generate(merchantId);
  }

  @Public()
  @Get('resolve/:slug')
  @ApiOperation({ summary: 'Resolve QR code slug to tenant' })
  resolve(@Param('slug') slug: string) {
    return this.qrService.resolve(slug);
  }
}
