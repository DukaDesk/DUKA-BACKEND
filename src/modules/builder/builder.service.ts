import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { ComponentRegistryService } from './component-registry.service';
import { ActionBuilderService, ActionConfig, ActionExecutionResult } from './action-builder.service';
import { ConditionalEngineService, ConditionGroup } from './conditional-engine.service';
import { DataBindingService } from './data-binding.service';
import { LivePreviewService, PreviewOutput, RenderedPage } from './live-preview.service';

@Injectable()
export class BuilderService {
  constructor(
    private prisma: PrismaService,
    private componentRegistry: ComponentRegistryService,
    private actionBuilder: ActionBuilderService,
    private conditionalEngine: ConditionalEngineService,
    private dataBinding: DataBindingService,
    private livePreview: LivePreviewService,
  ) {}

  async getPages(tenantId: string) {
    return this.prisma.page.findMany({
      where: { tenantId, isActive: true },
      include: {
        sections: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          include: {
            components: {
              where: { isActive: true },
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async updatePage(pageId: string, data: any) {
    const page = await this.prisma.page.findUnique({ where: { id: pageId } });
    if (!page) throw new NotFoundException('Page not found');

    return this.prisma.page.update({
      where: { id: pageId },
      data: {
        name: data.name,
        slug: data.slug,
        sortOrder: data.sortOrder,
        isHome: data.isHome,
        isActive: data.isActive,
      },
    });
  }

  async addSection(pageId: string, data: any) {
    return this.prisma.section.create({
      data: {
        pageId,
        type: data.type,
        sortOrder: data.sortOrder || 0,
        config: data.config || {},
      },
    });
  }

  async updateSection(sectionId: string, data: any) {
    const section = await this.prisma.section.findUnique({ where: { id: sectionId } });
    if (!section) throw new NotFoundException('Section not found');

    return this.prisma.section.update({
      where: { id: sectionId },
      data: {
        type: data.type,
        sortOrder: data.sortOrder,
        config: data.config,
        isActive: data.isActive,
      },
    });
  }

  async addComponent(sectionId: string, data: any) {
    return this.prisma.component.create({
      data: {
        sectionId,
        type: data.type,
        props: data.props || {},
        sortOrder: data.sortOrder || 0,
      },
    });
  }

  async updateComponent(componentId: string, data: any) {
    const component = await this.prisma.component.findUnique({ where: { id: componentId } });
    if (!component) throw new NotFoundException('Component not found');

    return this.prisma.component.update({
      where: { id: componentId },
      data: {
        type: data.type,
        props: data.props,
        sortOrder: data.sortOrder,
        isActive: data.isActive,
      },
    });
  }

  async getNavigation(tenantId: string) {
    return this.prisma.navigation.findUnique({ where: { tenantId } });
  }

  async updateNavigation(tenantId: string, items: any) {
    return this.prisma.navigation.upsert({
      where: { tenantId },
      create: { tenantId, items },
      update: { items },
    });
  }

  async getTheme(tenantId: string) {
    return this.prisma.theme.findUnique({ where: { tenantId } });
  }

  async updateTheme(tenantId: string, data: any) {
    return this.prisma.theme.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: data,
    });
  }

  getComponentTypes() {
    return this.componentRegistry.getAll();
  }

  getComponentType(type: string) {
    const def = this.componentRegistry.get(type);
    if (!def) throw new NotFoundException(`Component type '${type}' not found`);
    return def;
  }

  getActionTypes() {
    return this.actionBuilder.getAll();
  }

  async componentPreview(tenantId: string, data: { type: string; props: Record<string, any> }) {
    const valid = this.componentRegistry.validate(data.type, data.props);
    if (!valid.valid) {
      return { valid: false, errors: valid.errors };
    }

    return {
      valid: true,
      type: data.type,
      rendered: {
        type: data.type,
        props: data.props,
        actions: data.props.actions || [],
      },
    };
  }

  async executeAction(config: ActionConfig, context: Record<string, any>): Promise<ActionExecutionResult> {
    return this.actionBuilder.execute(config, context);
  }

  async evaluateConditions(conditions: ConditionGroup, context: Record<string, any>): Promise<boolean> {
    return this.conditionalEngine.evaluate(conditions, context);
  }

  async resolveDataBinding(binding: any, context: Record<string, any>, tenantId: string) {
    return this.dataBinding.resolve(binding, context, tenantId);
  }

  async previewTenant(tenantId: string, context?: any): Promise<PreviewOutput> {
    return this.livePreview.previewTenant(tenantId, context);
  }

  async previewPage(tenantId: string, pageId: string, context?: any): Promise<RenderedPage> {
    return this.livePreview.previewPage(tenantId, pageId, context);
  }
}
