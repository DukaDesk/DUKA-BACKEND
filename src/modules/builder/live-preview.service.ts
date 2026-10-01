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
  source: 'draft' | 'published' | 'empty';
  releaseVersion?: string;
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
        draftPages: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
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
        },
      },
    });

    if (!tenant) throw new NotFoundException({ code: 'MERCHANT_NOT_FOUND', message: 'Merchant not found' });

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

    let pages = await Promise.all(
      tenant.draftPages.map((page) => this.renderPage(page, defaultContext)),
    );
    let previewTheme = theme;
    let navigation = tenant.navigation?.items || [];
    let source: PreviewOutput['source'] = pages.length ? 'draft' : 'empty';
    let releaseVersion: string | undefined;

    // Some legacy merchants publish an app before draft pages are initialized.
    // In that case, review the active immutable release instead of showing an
    // empty phone preview while the merchant has a published app.
    if (pages.length === 0) {
      const release = tenant.activeReleaseId
        ? await this.prisma.release.findUnique({ where: { id: tenant.activeReleaseId } })
        : await this.prisma.release.findFirst({
            where: { tenantId, status: 'published', channel: 'production' },
            orderBy: [{ publishedAt: 'desc' }, { buildNumber: 'desc' }],
          });
      const manifest = release?.manifest as Record<string, any> | null;
      if (release && manifest && release.status !== 'draft') {
        pages = await this.renderPublishedScreens(manifest, defaultContext);
        previewTheme = manifest.theme || previewTheme;
        navigation = this.previewNavigation(manifest.navigation) || navigation;
        if (pages.length) {
          source = 'published';
          releaseVersion = release.version;
        }
      }
    }

    return {
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
      theme: previewTheme,
      navigation,
      pages,
      source,
      releaseVersion,
    };
  }

  private async renderPublishedScreens(manifest: Record<string, any>, context: PreviewContext): Promise<RenderedPage[]> {
    const screens = manifest.screens;
    const entries: Array<[string, any]> = Array.isArray(screens)
      ? screens.map((screen: any, index: number) => [String(screen?.screenId || screen?.slug || index), screen])
      : screens && typeof screens === 'object'
        ? Object.entries(screens)
        : [];
    const initialScreen = manifest.navigation?.initialScreen || manifest.navigation?.root?.initialRoute;

    return Promise.all(entries.map(async ([screenId, screen]) => {
      const sections = this.publishedScreenSections(screen);
      const renderedSections = await Promise.all(sections.map((section) => this.renderSection(section, context)));
      return {
        name: screen?.name || screen?.title || screenId,
        slug: screen?.slug || screen?.screenId || screenId,
        isHome: Boolean(screen?.isHome || screenId === initialScreen),
        sections: renderedSections.filter((section): section is RenderedSection => section !== null),
      };
    }));
  }

  private publishedScreenSections(screen: any): any[] {
    if (Array.isArray(screen?.blocks)) {
      return screen.blocks.map((block: any, index: number) => ({
        id: block?.id || `${screen?.screenId || 'screen'}-section-${index}`,
        type: block?.type || 'section',
        config: block?.config || {},
        draftComponents: block?.components || block?.children || [],
      }));
    }

    const children = screen?.layout?.children;
    if (!Array.isArray(children)) return [];
    return children.map((node: any, index: number) => {
      const sectionLayout = node?.layout;
      const components = sectionLayout?.children || node?.components || node?.children ||
        (node?.type && node.type !== 'layout' ? [node] : []);
      return {
        id: node?.id || `${screen?.screenId || 'screen'}-section-${index}`,
        type: node?.type || sectionLayout?.kind || 'section',
        config: sectionLayout?.config || node?.config || {},
        draftComponents: components,
      };
    });
  }

  private previewNavigation(navigation: any): any[] | undefined {
    if (Array.isArray(navigation)) return navigation;
    if (Array.isArray(navigation?.items)) return navigation.items;
    if (Array.isArray(navigation?.tabs)) return navigation.tabs;
    return undefined;
  }

  async previewPage(tenantId: string, pageId: string, context?: Partial<PreviewContext>): Promise<RenderedPage> {
    const page = await this.prisma.draftPage.findUnique({
      where: { id: pageId },
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
    });

    if (!page) throw new NotFoundException('Draft page not found');

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
      page.draftSections.map((section: any) => this.renderSection(section, context)),
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
      section.draftComponents.map((component: any) => this.renderComponent(component, context)),
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
