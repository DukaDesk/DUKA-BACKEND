import { Controller, Get, Put, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { BuilderService } from './builder.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Builder')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'tenants/:tenantId', version: '1' })
export class BuilderController {
  constructor(private readonly builderService: BuilderService) {}

  @Get('pages')
  @ApiOperation({ summary: 'Get all pages for a tenant' })
  getPages(@Param('tenantId') tenantId: string) {
    return this.builderService.getPages(tenantId);
  }

  @Put('pages/:pageId')
  @ApiOperation({ summary: 'Update a page' })
  updatePage(@Param('pageId') pageId: string, @Body() data: any) {
    return this.builderService.updatePage(pageId, data);
  }

  @Post('pages/:pageId/sections')
  @ApiOperation({ summary: 'Add a section to a page' })
  addSection(@Param('pageId') pageId: string, @Body() data: any) {
    return this.builderService.addSection(pageId, data);
  }

  @Put('sections/:sectionId')
  @ApiOperation({ summary: 'Update a section' })
  updateSection(@Param('sectionId') sectionId: string, @Body() data: any) {
    return this.builderService.updateSection(sectionId, data);
  }

  @Post('sections/:sectionId/components')
  @ApiOperation({ summary: 'Add a component to a section' })
  addComponent(@Param('sectionId') sectionId: string, @Body() data: any) {
    return this.builderService.addComponent(sectionId, data);
  }

  @Put('components/:componentId')
  @ApiOperation({ summary: 'Update a component' })
  updateComponent(@Param('componentId') componentId: string, @Body() data: any) {
    return this.builderService.updateComponent(componentId, data);
  }

  @Get('navigation')
  @ApiOperation({ summary: 'Get navigation for a tenant' })
  getNavigation(@Param('tenantId') tenantId: string) {
    return this.builderService.getNavigation(tenantId);
  }

  @Put('navigation')
  @ApiOperation({ summary: 'Update navigation for a tenant' })
  updateNavigation(@Param('tenantId') tenantId: string, @Body() items: any) {
    return this.builderService.updateNavigation(tenantId, items);
  }

  @Get('theme')
  @ApiOperation({ summary: 'Get theme for a tenant' })
  getTheme(@Param('tenantId') tenantId: string) {
    return this.builderService.getTheme(tenantId);
  }

  @Put('theme')
  @ApiOperation({ summary: 'Update theme for a tenant' })
  updateTheme(@Param('tenantId') tenantId: string, @Body() data: any) {
    return this.builderService.updateTheme(tenantId, data);
  }
}
