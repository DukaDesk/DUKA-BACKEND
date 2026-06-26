import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { RendererService } from './renderer.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Renderer')
@Public()
@Controller({ version: '1' })
export class RendererController {
  constructor(private readonly rendererService: RendererService) {}

  @Get('tenants/:id/definition')
  @ApiOperation({ summary: 'Get application definition for a tenant' })
  getAppDefinition(@Param('id') id: string) {
    return this.rendererService.getAppDefinition(id);
  }

  @Get('resolve/:slug')
  @ApiOperation({ summary: 'Resolve tenant by slug' })
  resolveBySlug(@Param('slug') slug: string) {
    return this.rendererService.resolveBySlug(slug);
  }
}
