import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class TemplatesService {
  constructor(private prisma: PrismaService) {}

  async findAll(category?: string) {
    const where = { isActive: true } as any;
    if (category) where.category = category;
    return this.prisma.template.findMany({ where, orderBy: { name: 'asc' } });
  }

  async findById(id: string) {
    const template = await this.prisma.template.findUnique({ where: { id } });
    if (!template) throw new NotFoundException('Template not found');
    return template;
  }

  async useTemplate(tenantId: string, templateId: string) {
    const template = await this.findById(templateId);
    const config = template.config as any;

    if (config?.pages) {
      for (const page of config.pages) {
        await this.prisma.page.create({
          data: {
            tenantId,
            templateId: template.id,
            name: page.name,
            slug: page.slug,
            isHome: page.isHome || false,
            sortOrder: page.sortOrder || 0,
            sections: {
              create: page.sections?.map((section: any, si: number) => ({
                type: section.type,
                sortOrder: section.sortOrder || si,
                config: section.config,
                components: {
                  create: section.components?.map((comp: any, ci: number) => ({
                    type: comp.type,
                    props: comp.props,
                    sortOrder: comp.sortOrder || ci,
                  })) || [],
                },
              })) || [],
            },
          },
        });
      }
    }

    if (config?.theme) {
      await this.prisma.theme.upsert({
        where: { tenantId },
        create: { tenantId, ...config.theme },
        update: config.theme,
      });
    }

    if (config?.navigation) {
      await this.prisma.navigation.upsert({
        where: { tenantId },
        create: { tenantId, items: config.navigation },
        update: { items: config.navigation },
      });
    }

    return { message: 'Template applied successfully' };
  }
}
