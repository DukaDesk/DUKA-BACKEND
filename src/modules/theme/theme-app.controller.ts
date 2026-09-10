import { Controller, Get, Put, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ThemeService } from './theme.service';
import { UpdateThemeDto } from './dto/update-theme.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TenantResolverService } from '../../shared/tenant/tenant-resolver.service';

@ApiTags('Theme - App (Tenant Self-Service)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'app/theme', version: '1' })
export class ThemeAppController {
  constructor(
    private readonly themeService: ThemeService,
    private readonly tenantResolver: TenantResolverService,
  ) {}

  private async getTenantId(userId: string): Promise<string> {
    return this.tenantResolver.resolveTenantId(userId);
  }

  @Get()
  @ApiOperation({ summary: 'Get current theme configuration for current app' })
  async getTheme(@CurrentUser('id') userId: string) {
    const tenantId = await this.getTenantId(userId);
    return this.themeService.getTheme(tenantId);
  }

  @Put()
  @ApiOperation({ summary: 'Update theme configuration with versioning for current app' })
  async updateTheme(@CurrentUser('id') userId: string, @Body() dto: UpdateThemeDto) {
    const tenantId = await this.getTenantId(userId);
    return this.themeService.updateTheme(tenantId, dto);
  }

  @Get('versions')
  @ApiOperation({ summary: 'Get theme version history for current app' })
  async getVersionHistory(@CurrentUser('id') userId: string) {
    const tenantId = await this.getTenantId(userId);
    return this.themeService.getVersionHistory(tenantId);
  }

  @Get('versions/:version')
  @ApiOperation({ summary: 'Get a specific theme version snapshot for current app' })
  async getVersion(@CurrentUser('id') userId: string, @Param('version') version: string) {
    const tenantId = await this.getTenantId(userId);
    return this.themeService.getVersion(tenantId, parseInt(version, 10));
  }

  @Post('versions/:version/restore')
  @ApiOperation({ summary: 'Restore a previous theme version for current app' })
  async restoreVersion(@CurrentUser('id') userId: string, @Param('version') version: string) {
    const tenantId = await this.getTenantId(userId);
    return this.themeService.restoreVersion(tenantId, parseInt(version, 10));
  }

  @Post('reset')
  @ApiOperation({ summary: 'Reset theme to factory defaults for current app' })
  async resetToDefaults(@CurrentUser('id') userId: string) {
    const tenantId = await this.getTenantId(userId);
    return this.themeService.resetToDefaults(tenantId);
  }
}