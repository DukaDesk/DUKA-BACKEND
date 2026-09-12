import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class TemplatesService {
  private readonly logger = new Logger(TemplatesService.name);

  constructor(private prisma: PrismaService) {}

  async findAll(category?: string, page = 1, limit = 20) {
    const where = { isActive: true } as any;
    if (category) where.category = category;

    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.template.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          category: true,
          thumbnail: true,
          isActive: true,
          createdAt: true,
        },
      }),
      this.prisma.template.count({ where }),
    ]);

    return {
      data,
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async findById(id: string) {
    const template = await this.prisma.template.findUnique({ where: { id } });
    if (!template) throw new NotFoundException('Template not found');
    if (!template.isActive) {
      throw new BadRequestException('Template is inactive and cannot be used');
    }
    return template;
  }

  async useTemplate(tenantId: string, templateId: string) {
    const template = await this.findById(templateId);
    const config = template.config as any;

    if (!config || !config.pages || config.pages.length === 0) {
      throw new BadRequestException('Template has no pages defined');
    }

    const existingTheme = await this.prisma.theme.findUnique({ where: { tenantId } });

    for (const page of config.pages) {
      if (!page.name || !page.slug) {
        throw new BadRequestException(`Template page missing required fields (name, slug)`);
      }

      const existingPage = await this.prisma.page.findUnique({
        where: { tenantId_slug: { tenantId, slug: page.slug } },
      });
      if (existingPage) {
        this.logger.warn(`Page slug '${page.slug}' already exists — skipping page '${page.name}'`);
        continue;
      }

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

    if (config?.theme) {
      const templateTheme = config.theme;
      const mergedTheme = existingTheme
        ? {
            primaryColor: templateTheme.primaryColor || existingTheme.primaryColor,
            secondaryColor: templateTheme.secondaryColor || existingTheme.secondaryColor,
            backgroundColor: templateTheme.backgroundColor || existingTheme.backgroundColor,
            textColor: templateTheme.textColor || existingTheme.textColor,
            fontFamily: templateTheme.fontFamily || existingTheme.fontFamily,
            borderRadius: templateTheme.borderRadius || existingTheme.borderRadius,
            logo: existingTheme.logo || templateTheme.logo,
            favicon: existingTheme.favicon || templateTheme.favicon,
          }
        : templateTheme;

      await this.prisma.theme.upsert({
        where: { tenantId },
        create: { tenantId, ...templateTheme },
        update: mergedTheme,
      });
    }

    if (config?.navigation) {
      await this.prisma.navigation.upsert({
        where: { tenantId },
        create: { tenantId, items: config.navigation },
        update: { items: config.navigation },
      });
    }

    const templateMedia = await this.prisma.media.findMany({
      where: { templateId: template.id },
    });

    let mediaCopied = 0;
    for (const asset of templateMedia) {
      const existingAsset = await this.prisma.media.findFirst({
        where: { tenantId, hash: asset.hash },
      });
      if (!existingAsset) {
        await this.prisma.media.create({
          data: {
            tenantId,
            fileName: asset.fileName,
            mimeType: asset.mimeType,
            size: asset.size,
            url: asset.url,
            alt: asset.alt,
            type: asset.type,
            hash: asset.hash,
            variants: asset.variants as any,
            visibility: asset.visibility,
            tags: asset.tags,
          },
        });
        mediaCopied++;
      }
    }

    return {
      message: 'Template applied successfully',
      templateId: template.id,
      templateName: template.name,
      pagesCreated: config.pages.length,
      mediaCopied,
    };
  }
}
