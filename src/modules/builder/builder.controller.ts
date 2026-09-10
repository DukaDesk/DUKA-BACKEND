import { Controller, Get, Put, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { BuilderService } from './builder.service';
import { PreviewOutput, RenderedPage } from './live-preview.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Builder')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'app', version: '1' })
export class BuilderController {
  constructor(private readonly builderService: BuilderService) {}

  @Get('pages')
  @ApiOperation({ summary: 'Get all pages for the current app' })
  getPages(@CurrentUser('id') userId: string) {
    return this.builderService.getPages(userId);
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
  @ApiOperation({ summary: 'Get navigation for the current app' })
  getNavigation(@CurrentUser('id') userId: string) {
    return this.builderService.getNavigation(userId);
  }

  @Put('navigation')
  @ApiOperation({ summary: 'Update navigation for the current app' })
  updateNavigation(@CurrentUser('id') userId: string, @Body() items: any) {
    return this.builderService.updateNavigation(userId, items);
  }

  // ─── Component Registry ───────────────────────────────────

  @Get('component-types')
  @ApiOperation({ summary: 'Get all registered component definitions' })
  getComponentTypes() {
    return this.builderService.getComponentTypes();
  }

  @Get('component-types/:type')
  @ApiOperation({ summary: 'Get a specific component type definition' })
  getComponentType(@Param('type') type: string) {
    return this.builderService.getComponentType(type);
  }

  // ─── Action Builder ───────────────────────────────────────

  @Get('action-types')
  @ApiOperation({ summary: 'Get all registered action definitions' })
  getActionTypes() {
    return this.builderService.getActionTypes();
  }

  @Post('actions/execute')
  @ApiOperation({ summary: 'Execute an action with given context' })
  executeAction(@Body() body: { config: any; context: Record<string, any> }) {
    return this.builderService.executeAction(body.config, body.context);
  }

  // ─── Conditional Rendering ─────────────────────────────────

  @Post('conditions/evaluate')
  @ApiOperation({ summary: 'Evaluate conditional visibility' })
  evaluateConditions(@Body() body: { conditions: any; context: Record<string, any> }) {
    return this.builderService.evaluateConditions(body.conditions, body.context);
  }

  // ─── Data Binding ──────────────────────────────────────────

  @Post('data-binding/resolve')
  @ApiOperation({ summary: 'Resolve a data binding against context' })
  resolveDataBinding(
    @CurrentUser('id') userId: string,
    @Body() body: { binding: any; context: Record<string, any> },
  ) {
    return this.builderService.resolveDataBinding(body.binding, body.context, userId);
  }

  // ─── Live Preview ──────────────────────────────────────────

  @Post('preview')
  @ApiOperation({ summary: 'Preview the full app rendering with optional context overrides' })
  previewTenant(@CurrentUser('id') userId: string, @Body() context?: any): Promise<PreviewOutput> {
    return this.builderService.previewTenant(userId, context);
  }

  @Post('pages/:pageId/preview')
  @ApiOperation({ summary: 'Preview a single page with optional context overrides' })
  previewPage(
    @CurrentUser('id') userId: string,
    @Param('pageId') pageId: string,
    @Body() context?: any,
  ): Promise<RenderedPage> {
    return this.builderService.previewPage(userId, pageId, context);
  }

  // ─── Component Preview ─────────────────────────────────────

  @Post('component-preview')
  @ApiOperation({ summary: 'Validate and preview a component configuration' })
  componentPreview(
    @CurrentUser('id') userId: string,
    @Body() data: { type: string; props: Record<string, any> },
  ) {
    return this.builderService.componentPreview(userId, data);
  }

  // ─── Legacy theme endpoints ────────────────────────────────

  @Get('theme')
  @ApiOperation({ summary: 'Get theme for the current app' })
  getTheme(@CurrentUser('id') userId: string) {
    return this.builderService.getTheme(userId);
  }

  @Put('theme')
  @ApiOperation({ summary: 'Update theme for the current app' })
  updateTheme(@CurrentUser('id') userId: string, @Body() data: any) {
    return this.builderService.updateTheme(userId, data);
  }
}
