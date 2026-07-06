import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { ThemeCompiler } from '../theme/theme-compiler.service';
import { ComponentRegistryService } from './component-registry.service';
import { ConditionalEngineService, ConditionGroup } from './conditional-engine.service';
import { DataBindingService, DataBinding } from './data-binding.service';
import { ActionBuilderService, ActionConfig } from './action-builder.service';

export interface PreviewContext {
  tenantId: string;
  userId?: string;
  isLoggedIn: boolean;
  isDarkMode: boolean;
  route: Record<string, any>;
  device: { platform: string; width: number; height: number };
  [key: string]: any;
}

export interface RenderedComponent {
  id: string;
  type: string;
  props: Record<string, any>;
  actions?: ActionConfig[];
  children?: RenderedComponent[];
}

export interface RenderedSection {
  id: string;
  type: string;
  config: Record<string, any>;
  components: RenderedComponent[];
}

export interface RenderedPage {
  name: string;
  slug: string;
  isHome: boolean;
  sections: RenderedSection[];
}

export interface PreviewOutput {
  tenant: { id: string; name: string; slug: string };
  theme: any;
  navigation: any;
  pages: RenderedPage[];
}

@Injectable()
export class LivePreviewService {
  constructor(
    private prisma: PrismaService,
    private themeCompiler: ThemeCompiler,
    private componentRegistry: ComponentRegistryService,
    private conditionalEngine: ConditionalEngineService,
    private dataBinding: DataBindingService,
    private actionBuilder: ActionBuilderService,
  ) {}

  async previewTenant(tenantId: string, context?: Partial<PreviewContext>): Promise<PreviewOutput> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        theme: true,
        navigation: true,
        pages: {
          where: { isActive: true },
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
        },
      },
    });

    if (!tenant) throw new NotFoundException('Tenant not found');

    const defaultContext: PreviewContext = {
      tenantId,
      isLoggedIn: false,
      isDarkMode: false,
      route: {},
      device: { platform: 'mobile', width: 390, height: 844 },
      ...context,
    };

    const theme = tenant.theme
      ? this.themeCompiler.compileForPreview(tenant.theme)
      : undefined;

    const pages = await Promise.all(
      tenant.pages.map((page) => this.renderPage(page, defaultContext)),
    );

    return {
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
      theme,
      navigation: tenant.navigation?.items || [],
      pages,
    };
  }

  async previewPage(tenantId: string, pageId: string, context?: Partial<PreviewContext>): Promise<RenderedPage> {
    const page = await this.prisma.page.findUnique({
      where: { id: pageId },
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

    if (!page) throw new NotFoundException('Page not found');

    const defaultContext: PreviewContext = {
      tenantId,
      isLoggedIn: false,
      isDarkMode: false,
      route: {},
      device: { platform: 'mobile', width: 390, height: 844 },
      ...context,
    };

    return this.renderPage(page, defaultContext);
  }

  private async renderPage(page: any, context: PreviewContext): Promise<RenderedPage> {
    const sections = await Promise.all(
      page.sections.map((section: any) => this.renderSection(section, context)),
    );

    return {
      name: page.name,
      slug: page.slug,
      isHome: page.isHome,
      sections: sections.filter(Boolean),
    };
  }

  private async renderSection(section: any, context: PreviewContext): Promise<RenderedSection | null> {
    const config = (section.config as Record<string, any>) || {};

    if (config.conditions) {
      const visible = this.conditionalEngine.evaluate(config.conditions as ConditionGroup, context);
      if (!visible) return null;
    }

    const components = await Promise.all(
      section.components.map((component: any) => this.renderComponent(component, context)),
    );

    return {
      id: section.id,
      type: section.type,
      config,
      components: components.filter(Boolean),
    };
  }

  private async renderComponent(component: any, context: PreviewContext): Promise<RenderedComponent | null> {
    const props = (component.props as Record<string, any>) || {};

    if (props.conditions) {
      const visible = this.conditionalEngine.evaluate(props.conditions as ConditionGroup, context);
      if (!visible) return null;
    }

    const resolvedProps = await this.resolveComponentProps(component.type, props, context);

    const def = this.componentRegistry.get(component.type);

    return {
      id: component.id,
      type: component.type,
      props: resolvedProps,
      actions: props.actions as ActionConfig[] | undefined,
      children: undefined,
    };
  }

  private async resolveComponentProps(
    type: string,
    props: Record<string, any>,
    context: PreviewContext,
  ): Promise<Record<string, any>> {
    const bindings = props.bindings as Record<string, DataBinding> | undefined;
    if (!bindings) return props;

    const resolvedBindings = await this.dataBinding.resolveAll(bindings, context, context.tenantId);

    const result = { ...props };
    delete result.bindings;
    delete result.conditions;

    return { ...result, ...resolvedBindings };
  }
}
