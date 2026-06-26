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
  @Post('generate/:tenantId')
  @ApiOperation({ summary: 'Generate QR code data for a tenant' })
  generate(@Param('tenantId') tenantId: string) {
    return this.qrService.generate(tenantId);
  }

  @Public()
  @Get('resolve/:slug')
  @ApiOperation({ summary: 'Resolve QR code slug to tenant' })
  resolve(@Param('slug') slug: string) {
    return this.qrService.resolve(slug);
  }
}
