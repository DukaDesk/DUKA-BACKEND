import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { TemplatesService } from './templates.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Templates')
@Controller({ path: 'templates', version: '1' })
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List all templates' })
  @ApiQuery({ name: 'category', required: false })
  findAll(@Query('category') category?: string) {
    return this.templatesService.findAll(category);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get template by ID' })
  findById(@Param('id') id: string) {
    return this.templatesService.findById(id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(':id/use')
  @ApiOperation({ summary: 'Apply template to a tenant' })
  useTemplate(
    @Param('id') templateId: string,
    @CurrentUser('id') userId: string,
    @Query('tenantId') tenantId: string,
  ) {
    return this.templatesService.useTemplate(tenantId, templateId);
  }
}
