import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { RendererService } from './renderer.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Renderer')
@Public()
@Controller({ version: '1' })
export class RendererController {
  constructor(private readonly rendererService: RendererService) {}

  @Get('merchants/:id/definition')
  @ApiOperation({ summary: 'Get application definition for a tenant' })
  @ApiQuery({ name: 'version', required: false, description: 'Specific release version (e.g. 1.0.3)' })
  getAppDefinition(@Param('id') id: string, @Query('version') version?: string) {
    return this.rendererService.getAppDefinition(id, version);
  }

  @Get('resolve/:slug')
  @ApiOperation({ summary: 'Resolve tenant by slug' })
  resolveBySlug(@Param('slug') slug: string) {
    return this.rendererService.resolveBySlug(slug);
  }
}
