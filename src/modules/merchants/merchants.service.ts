import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';

@Injectable()
export class MerchantsService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateTenantDto) {
    const existing = await this.prisma.tenant.findUnique({ where: { slug: dto.slug } });
    if (existing) {
      throw new ConflictException('A merchant with this slug already exists');
    }

    const category = (dto as any)?.category?.trim() || null;

    let tenant: any;
    try {
      tenant = await this.prisma.tenant.create({
        data: {
          name: dto.name,
          slug: dto.slug,
          email: dto.email,
          phone: dto.phone,
          logo: dto.logo,
          ...(category ? { category } : {}),
          users: {
            create: {
              userId,
              role: 'owner',
            },
          },
        },
      });
    } catch (e: any) {
      // Column may not exist yet in environments where the
      // 20261003000000_add_tenant_category migration hasn't run —
      // fall back to a column-less create; category is still
      // persisted to TenantConfig below.
      if (category && /column .*category.*does not exist|Unknown column/i.test(e?.message || '')) {
        tenant = await this.prisma.tenant.create({
          data: {
            name: dto.name,
            slug: dto.slug,
            email: dto.email,
            phone: dto.phone,
            logo: dto.logo,
            users: { create: { userId, role: 'owner' } },
          },
        });
      } else {
        throw e;
      }
    }

    if (category) {
      await this.saveCategoryConfig(tenant.id, category).catch(() => {});
    }

    // Seed a non-empty default app so new merchants never publish/serve screens: [].
    await this.seedDefaultApp(tenant.id, tenant.name, tenant.slug);

    return this.withCategory(tenant);
  }

  /** Persist desk category to TenantConfig.config.app.category (no-migration fallback). */
  private async saveCategoryConfig(tenantId: string, category: string) {
    const existing = await this.prisma.tenantConfig.findUnique({ where: { tenantId } }).catch(() => null);
    const prevConfig = ((existing as any)?.config ?? {}) as Record<string, any>;
    const prevApp = (prevConfig.app ?? {}) as Record<string, any>;
    await this.prisma.tenantConfig.upsert({
      where: { tenantId },
      create: {
        tenantId,
        config: { ...prevConfig, app: { ...prevApp, category, updatedAt: new Date().toISOString() } },
      },
      update: {
        config: { ...prevConfig, app: { ...prevApp, category, updatedAt: new Date().toISOString() } },
      },
    }).catch(() => {});
  }

  private async readConfigCategory(tenantId: string): Promise<string | null> {
    try {
      const cfg = await this.prisma.tenantConfig.findUnique({ where: { tenantId } });
      const config = (cfg as any)?.config ?? {};
      return config?.app?.category || config?.category || null;
    } catch {
      return null;
    }
  }

  /** Merge Tenant.category (source of truth) with TenantConfig fallback. */
  private async withCategory<T extends { id: string }>(tenant: T): Promise<T & { category: string | null }> {
    if (!tenant) return tenant as any;
    const direct = (tenant as any)?.category || null;
    if (direct) return { ...(tenant as any), category: direct };
    const fallback = await this.readConfigCategory((tenant as any).id);
    return { ...(tenant as any), category: fallback };
  }

  private async seedDefaultApp(tenantId: string, name: string, slug: string) {
    const template = await this.prisma.template.findFirst({
      where: { isActive: true, slug: 'modern-store' },
    });

    if (template) {
      try {
        const config = template.config as any;
        if (config?.pages?.length) {
          for (const [index, page] of config.pages.entries()) {
            await this.prisma.page.create({
              data: {
                tenantId,
                templateId: template.id,
                name: page.name,
                slug: page.slug,
                isHome: !!page.isHome,
                sortOrder: page.sortOrder ?? index,
                sections: {
                  create:
                    page.sections?.map((section: any, si: number) => ({
                      type: section.type,
                      sortOrder: section.sortOrder ?? si,
                      config: section.config ?? {},
                      components: {
                        create:
                          section.components?.map((comp: any, ci: number) => ({
                            type: comp.type,
                            props: comp.props ?? {},
                            sortOrder: comp.sortOrder ?? ci,
                          })) || [],
                      },
                    })) || [],
                },
              },
            });
          }
        }
        if (config?.theme) {
          await this.prisma.theme.create({
            data: { tenantId, ...config.theme },
          });
        }
        if (config?.navigation) {
          await this.prisma.navigation.create({
            data: { tenantId, items: config.navigation },
          });
        }
        return;
      } catch {
        // fall through to minimal seed
      }
    }

    // Minimal home + shop pages when template seed is unavailable.
    await this.prisma.page.create({
      data: {
        tenantId,
        name: 'Home',
        slug: 'home',
        isHome: true,
        sortOrder: 0,
        sections: {
          create: [
            {
              type: 'text',
              sortOrder: 0,
              config: {},
              components: {
                create: [
                  {
                    type: 'TextBlock',
                    sortOrder: 0,
                    props: { text: `Welcome to ${name}` },
                  },
                ],
              },
            },
          ],
        },
      },
    });
    await this.prisma.page.create({
      data: {
        tenantId,
        name: 'Shop',
        slug: 'shop',
        isHome: false,
        sortOrder: 1,
        sections: {
          create: [
            {
              type: 'grid',
              sortOrder: 0,
              config: { columns: 2 },
              components: {
                create: [{ type: 'ProductGrid', sortOrder: 0, props: { limit: 12 } }],
              },
            },
          ],
        },
      },
    });
    await this.prisma.navigation.create({
      data: {
        tenantId,
        items: [
          { label: 'Home', screenId: 'home', path: '/home' },
          { label: 'Shop', screenId: 'shop', path: '/shop' },
        ],
      },
    });
    await this.prisma.theme.create({ data: { tenantId } });
    void slug;
  }

  async findById(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        theme: true,
        navigation: true,
        _count: { select: { products: true, pages: true, users: true } },
      },
    });
    if (!tenant) throw new NotFoundException({ code: 'MERCHANT_NOT_FOUND', message: 'Merchant not found' });
    return this.withCategory(tenant);
  }

  async findBySlug(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      include: { theme: true, navigation: true },
    });
    if (!tenant) throw new NotFoundException({ code: 'MERCHANT_NOT_FOUND', message: 'Merchant not found' });
    return this.withCategory(tenant);
  }

  async update(id: string, userId: string, dto: UpdateTenantDto) {
    await this.verifyOwnership(id, userId);

    if (dto.slug) {
      const existing = await this.prisma.tenant.findUnique({ where: { slug: dto.slug } });
      if (existing && existing.id !== id) {
        throw new ConflictException('Slug already in use');
      }
    }

    const { category: rawCategory, ...rest } = dto as any;
    const category = rawCategory?.trim() || null;

    let updated: any;
    try {
      updated = await this.prisma.tenant.update({
        where: { id },
        data: { ...rest, ...(category ? { category } : {}) },
      });
    } catch (e: any) {
      if (category && /column .*category.*does not exist|Unknown column/i.test(e?.message || '')) {
        updated = await this.prisma.tenant.update({ where: { id }, data: rest });
      } else {
        throw e;
      }
    }

    if (category) {
      await this.saveCategoryConfig(id, category).catch(() => {});
      updated = { ...updated, category };
    } else {
      updated = await this.withCategory(updated);
    }

    return updated;
  }

  async publish(id: string, userId: string) {
    await this.verifyOwnership(id, userId);
    throw new BadRequestException({
      code: 'APPROVAL_REQUIRED',
      message: 'Submit an app through the publishing review flow; apps become public after admin approval',
    });
  }

  async getMyTenants(userId: string) {
    let rows: any[];
    try {
      rows = await this.prisma.tenantUser.findMany({
        where: { userId },
        include: {
          tenant: {
            select: { id: true, name: true, slug: true, logo: true, status: true, publishedAt: true, category: true },
          },
        },
      });
    } catch (e: any) {
      // Pre-migration fallback: tenants.category column doesn't exist yet.
      if (/column .*category.*does not exist|Unknown column/i.test(e?.message || '')) {
        rows = await this.prisma.tenantUser.findMany({
          where: { userId },
          include: {
            tenant: {
              select: { id: true, name: true, slug: true, logo: true, status: true, publishedAt: true },
            },
          },
        });
      } else {
        throw e;
      }
    }
    // Enrich each membership row with the desk category flag so the
    // frontend can preset/remember dashboard tools without extra fetches.
    const enriched = await Promise.all(
      rows.map(async (row: any) => {
        const direct = (row.tenant as any)?.category || null;
        const fallback = direct ? null : await this.readConfigCategory(row.tenant?.id);
        const category = direct || fallback || null;
        return {
          ...row,
          tenant: { ...row.tenant, category },
        };
      }),
    );
    return enriched;
  }

  async addUser(tenantId: string, userId: string, role: string = 'staff') {
    const existing = await this.prisma.tenantUser.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });
    if (existing) {
      throw new ConflictException('User is already a member');
    }

    return this.prisma.tenantUser.create({
      data: { tenantId, userId, role: role as any },
    });
  }

  async removeUser(tenantId: string, userId: string) {
    const membership = await this.prisma.tenantUser.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });
    if (!membership) throw new NotFoundException({ code: 'MERCHANT_MEMBER_NOT_FOUND', message: 'Merchant member not found' });

    await this.prisma.tenantUser.delete({ where: { id: membership.id } });
    return { message: 'User removed from tenant' };
  }

  private async verifyOwnership(tenantId: string, userId: string) {
    const membership = await this.prisma.tenantUser.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });
    if (!membership || !['owner', 'manager'].includes(membership.role)) {
      throw new ForbiddenException({ code: 'NOT_OWNER', message: 'Only merchant owners and managers can perform this action' });
    }
  }
}
