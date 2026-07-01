import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma.service';

export interface ValidationResult {
  passed: boolean;
  errors: { field: string; message: string }[];
  warnings: string[];
}

@Injectable()
export class ValidationEngine {
  constructor(private prisma: PrismaService) {}

  async validateDraft(tenantId: string): Promise<ValidationResult> {
    const errors: { field: string; message: string }[] = [];
    const warnings: string[] = [];

    const pages = await this.prisma.page.findMany({
      where: { tenantId, isActive: true },
    });

    if (pages.length === 0) {
      errors.push({ field: 'pages', message: 'At least one page is required' });
    }

    const homePages = pages.filter((p) => p.isHome);
    if (homePages.length === 0) {
      errors.push({ field: 'isHome', message: 'A home page must be set' });
    }
    if (homePages.length > 1) {
      errors.push({ field: 'isHome', message: 'Only one page can be the home page' });
    }

    const slugs = pages.map((p) => p.slug);
    const duplicateSlugs = slugs.filter((s, i) => slugs.indexOf(s) !== i);
    if (duplicateSlugs.length > 0) {
      errors.push({ field: 'slug', message: `Duplicate slugs: ${duplicateSlugs.join(', ')}` });
    }

    const sections = await this.prisma.section.findMany({
      where: { pageId: { in: pages.map((p) => p.id) }, isActive: true },
      include: { components: true },
    });

    for (const section of sections) {
      if (section.components.length === 0) {
        warnings.push(`Section ${section.id} has no components`);
      }
    }

    const theme = await this.prisma.theme.findUnique({ where: { tenantId } });
    if (!theme) {
      warnings.push('No custom theme configured — default theme will be used');
    }

    const navigation = await this.prisma.navigation.findUnique({ where: { tenantId } });
    if (!navigation || !navigation.items) {
      warnings.push('No navigation configured');
    }

    return {
      passed: errors.length === 0,
      errors,
      warnings,
    };
  }
}
