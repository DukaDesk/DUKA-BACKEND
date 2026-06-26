import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class RendererService {
  constructor(private prisma: PrismaService) {}

  async getAppDefinition(tenantId: string) {
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

    const definition = {
      tenantId: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      theme: this.buildTheme(tenant.theme),
      navigation: tenant.navigation?.items || [],
      screens: tenant.pages.map((page) => ({
        name: page.name,
        slug: page.slug,
        isHome: page.isHome,
        blocks: page.sections.map((section) => ({
          id: section.id,
          type: section.type,
          config: section.config,
          components: section.components.map((component) => ({
            id: component.id,
            type: component.type,
            props: component.props,
          })),
        })),
      })),
    };

    return definition;
  }

  async resolveBySlug(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug, status: 'published' },
      select: { id: true, name: true, slug: true, logo: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  private buildTheme(theme: any) {
    if (!theme) {
      return {
        primaryColor: '#0066FF',
        secondaryColor: '#00CC66',
        backgroundColor: '#FFFFFF',
        textColor: '#1A1A1A',
        fontFamily: 'Inter',
        borderRadius: '8px',
      };
    }

    return {
      primaryColor: theme.primaryColor,
      secondaryColor: theme.secondaryColor,
      backgroundColor: theme.backgroundColor,
      textColor: theme.textColor,
      fontFamily: theme.fontFamily,
      borderRadius: theme.borderRadius,
      logo: theme.logo,
      favicon: theme.favicon,
    };
  }
}
