import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ThemeService } from './theme.service';
import { CompiledThemeBundle, ThemeTokens } from './theme-compiler.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Theme - Public (SDUI Runtime)')
@Controller({ path: 'merchants/:merchantId/theme', version: '1' })
export class ThemePublicController {
  constructor(private readonly themeService: ThemeService) {}

  @Public()
  @Get('compiled')
  @ApiOperation({ summary: 'Get compiled theme token bundle (light + dark) for SDUI runtime' })
  getCompiledBundle(@Param('merchantId') merchantId: string): Promise<CompiledThemeBundle> {
    return this.themeService.getCompiledBundle(merchantId);
  }

  @Public()
  @Get('preview')
  @ApiOperation({ summary: 'Get theme tokens for live preview' })
  getPreviewTokens(@Param('merchantId') merchantId: string): Promise<ThemeTokens> {
    return this.themeService.getPreviewTokens(merchantId);
  }
}