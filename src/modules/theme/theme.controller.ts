import { Controller, Get, Put, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ThemeService } from './theme.service';
import { UpdateThemeDto } from './dto/update-theme.dto';
import { CompiledThemeBundle, ThemeTokens } from './theme-compiler.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Theme')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'tenants/:tenantId/theme', version: '1' })
export class ThemeController {
  constructor(private readonly themeService: ThemeService) {}

  @Get()
  @ApiOperation({ summary: 'Get current theme configuration' })
  getTheme(@Param('tenantId') tenantId: string) {
    return this.themeService.getTheme(tenantId);
  }

  @Put()
  @ApiOperation({ summary: 'Update theme configuration with versioning' })
  updateTheme(@Param('tenantId') tenantId: string, @Body() dto: UpdateThemeDto) {
    return this.themeService.updateTheme(tenantId, dto);
  }

  @Get('versions')
  @ApiOperation({ summary: 'Get theme version history' })
  getVersionHistory(@Param('tenantId') tenantId: string) {
    return this.themeService.getVersionHistory(tenantId);
  }

  @Get('versions/:version')
  @ApiOperation({ summary: 'Get a specific theme version snapshot' })
  getVersion(@Param('tenantId') tenantId: string, @Param('version') version: string) {
    return this.themeService.getVersion(tenantId, parseInt(version, 10));
  }

  @Post('versions/:version/restore')
  @ApiOperation({ summary: 'Restore a previous theme version' })
  restoreVersion(@Param('tenantId') tenantId: string, @Param('version') version: string) {
    return this.themeService.restoreVersion(tenantId, parseInt(version, 10));
  }

  @Get('compiled')
  @ApiOperation({ summary: 'Get compiled theme token bundle (light + dark) for SDUI runtime' })
  getCompiledBundle(@Param('tenantId') tenantId: string): Promise<CompiledThemeBundle> {
    return this.themeService.getCompiledBundle(tenantId);
  }

  @Get('preview')
  @ApiOperation({ summary: 'Get theme tokens for live preview' })
  getPreviewTokens(@Param('tenantId') tenantId: string): Promise<ThemeTokens> {
    return this.themeService.getPreviewTokens(tenantId);
  }

  @Post('reset')
  @ApiOperation({ summary: 'Reset theme to factory defaults' })
  resetToDefaults(@Param('tenantId') tenantId: string) {
    return this.themeService.resetToDefaults(tenantId);
  }
}
