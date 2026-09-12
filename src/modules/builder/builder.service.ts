import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { ComponentRegistryService } from './component-registry.service';
import { ActionBuilderService, ActionConfig, ActionExecutionResult } from './action-builder.service';
import { ConditionalEngineService, ConditionGroup } from './conditional-engine.service';
import { DataBindingService } from './data-binding.service';
import { LivePreviewService, PreviewOutput, RenderedPage } from './live-preview.service';

@Injectable()
export class BuilderService {
  private readonly logger = new Logger(BuilderService.name);

  constructor(
    private prisma: PrismaService,
    private componentRegistry: ComponentRegistryService,
    private actionBuilder: ActionBuilderService,
    private conditionalEngine: ConditionalEngineService,
    private dataBinding: DataBindingService,
    private livePreview: LivePreviewService,
  ) {}

  private async resolveTenantId(userId: string): Promise<string> {
    const tenantUser = await this.prisma.tenantUser.findFirst({
      where: {
        userId,
        role: { in: ['owner', 'manager'] },
        status: 'active',
      },
      select: { tenantId: true },
      orderBy: { role: 'asc' },
    });

    if (!tenantUser) {
      throw new ForbiddenException('User does not have access to any tenant as owner or manager');
    }

    return tenantUser.tenantId;
  }

  async initializeDrafts(userId: string) {
    const tenantId = await this.resolveTenantId(userId);

    const existingDrafts = await this.prisma.draftPage.findFirst({ where: { tenantId } });
    if (existingDrafts) {
      return { message: 'Drafts already initialized', initialized: false };
    }

    const pages = await this.prisma.page.findMany({
      where: { tenantId, isActive: true },
      orderBy: { sortOrder: 'asc' },
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
    });

    for (const page of pages) {
      const draftPage = await this.prisma.draftPage.create({
        data: {
          tenantId,
          name: page.name,
          slug: page.slug,
          sortOrder: page.sortOrder,
          isHome: page.isHome,
          isActive: page.isActive,
        },
      });

      for (const section of page.sections) {
        const draftSection = await this.prisma.draftSection.create({
          data: {
            pageId: draftPage.id,
            type: section.type,
            sortOrder: section.sortOrder,
            config: section.config as any,
            isActive: section.isActive,
          },
        });

        for (const component of section.components) {
          await this.prisma.draftComponent.create({
            data: {
              sectionId: draftSection.id,
              type: component.type,
              props: component.props as any,
              sortOrder: component.sortOrder,
              isActive: component.isActive,
            },
          });
        }
      }
    }

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { draftVersion: { increment: 1 } },
    });

    this.logger.log(`Initialized drafts for tenant ${tenantId}`);
    return { message: 'Drafts initialized from published state', initialized: true };
  }

  async getDraftStatus(userId: string) {
    const tenantId = await this.resolveTenantId(userId);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { draftVersion: true },
    });

    const draftPageCount = await this.prisma.draftPage.count({ where: { tenantId } });
    return {
      hasDrafts: draftPageCount > 0,
      draftVersion: tenant?.draftVersion || 0,
      draftPageCount,
    };
  }

  async discardDrafts(userId: string) {
    const tenantId = await this.resolveTenantId(userId);

    await this.prisma.draftComponent.deleteMany({
      where: { draftSection: { draftPage: { tenantId } } },
    });
    await this.prisma.draftSection.deleteMany({
      where: { draftPage: { tenantId } },
    });
    await this.prisma.draftPage.deleteMany({ where: { tenantId } });
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { draftVersion: 0 },
    });

    this.logger.log(`Discarded drafts for tenant ${tenantId}`);
    return { message: 'Drafts discarded' };
  }

  async getPages(userId: string) {
    const tenantId = await this.resolveTenantId(userId);
    return this.prisma.draftPage.findMany({
      where: { tenantId, isActive: true },
      include: {
        draftSections: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          include: {
            draftComponents: {
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
    const page = await this.prisma.draftPage.findUnique({ where: { id: pageId } });
    if (!page) throw new NotFoundException('Draft page not found');

    return this.prisma.draftPage.update({
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
    const page = await this.prisma.draftPage.findUnique({ where: { id: pageId } });
    if (!page) throw new NotFoundException('Draft page not found');

    return this.prisma.draftSection.create({
      data: {
        pageId,
        type: data.type,
        sortOrder: data.sortOrder || 0,
        config: data.config || {},
      },
    });
  }

  async updateSection(sectionId: string, data: any) {
    const section = await this.prisma.draftSection.findUnique({ where: { id: sectionId } });
    if (!section) throw new NotFoundException('Draft section not found');

    return this.prisma.draftSection.update({
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
    const section = await this.prisma.draftSection.findUnique({ where: { id: sectionId } });
    if (!section) throw new NotFoundException('Draft section not found');

    return this.prisma.draftComponent.create({
      data: {
        sectionId,
        type: data.type,
        props: data.props || {},
        sortOrder: data.sortOrder || 0,
      },
    });
  }

  async updateComponent(componentId: string, data: any) {
    const component = await this.prisma.draftComponent.findUnique({ where: { id: componentId } });
    if (!component) throw new NotFoundException('Draft component not found');

    return this.prisma.draftComponent.update({
      where: { id: componentId },
      data: {
        type: data.type,
        props: data.props,
        sortOrder: data.sortOrder,
        isActive: data.isActive,
      },
    });
  }

  async deletePage(pageId: string) {
    const page = await this.prisma.draftPage.findUnique({ where: { id: pageId } });
    if (!page) throw new NotFoundException('Draft page not found');

    await this.prisma.draftComponent.deleteMany({
      where: { draftSection: { draftPage: { id: pageId } } },
    });
    await this.prisma.draftSection.deleteMany({ where: { pageId } });
    await this.prisma.draftPage.delete({ where: { id: pageId } });

    return { message: 'Draft page deleted' };
  }

  async deleteSection(sectionId: string) {
    const section = await this.prisma.draftSection.findUnique({ where: { id: sectionId } });
    if (!section) throw new NotFoundException('Draft section not found');

    await this.prisma.draftComponent.deleteMany({ where: { sectionId } });
    await this.prisma.draftSection.delete({ where: { id: sectionId } });

    return { message: 'Draft section deleted' };
  }

  async deleteComponent(componentId: string) {
    const component = await this.prisma.draftComponent.findUnique({ where: { id: componentId } });
    if (!component) throw new NotFoundException('Draft component not found');

    await this.prisma.draftComponent.delete({ where: { id: componentId } });

    return { message: 'Draft component deleted' };
  }

  async getNavigation(userId: string) {
    const tenantId = await this.resolveTenantId(userId);
    return this.prisma.navigation.findUnique({ where: { tenantId } });
  }

  async updateNavigation(userId: string, items: any) {
    const tenantId = await this.resolveTenantId(userId);
    return this.prisma.navigation.upsert({
      where: { tenantId },
      create: { tenantId, items },
      update: { items },
    });
  }

  async getTheme(userId: string) {
    const tenantId = await this.resolveTenantId(userId);
    return this.prisma.theme.findUnique({ where: { tenantId } });
  }

  async updateTheme(userId: string, data: any) {
    const tenantId = await this.resolveTenantId(userId);
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

  async componentPreview(userId: string, data: { type: string; props: Record<string, any> }) {
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

  async resolveDataBinding(binding: any, context: Record<string, any>, userId: string) {
    const tenantId = await this.resolveTenantId(userId);
    return this.dataBinding.resolve(binding, context, tenantId);
  }

  async previewTenant(userId: string, context?: any): Promise<PreviewOutput> {
    const tenantId = await this.resolveTenantId(userId);
    return this.livePreview.previewTenant(tenantId, context);
  }

  async previewPage(userId: string, pageId: string, context?: any): Promise<RenderedPage> {
    const tenantId = await this.resolveTenantId(userId);
    return this.livePreview.previewPage(tenantId, pageId, context);
  }
}
