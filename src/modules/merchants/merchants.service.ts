import {
  Injectable,
  NotFoundException,
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
      throw new ConflictException('A tenant with this slug already exists');
    }

    const tenant = await this.prisma.tenant.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        email: dto.email,
        phone: dto.phone,
        logo: dto.logo,
        users: {
          create: {
            userId,
            role: 'owner',
          },
        },
      },
    });

    // Seed a non-empty default app so new merchants never publish/serve screens: [].
    await this.seedDefaultApp(tenant.id, tenant.name, tenant.slug);

    return tenant;
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
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async findBySlug(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      include: { theme: true, navigation: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async update(id: string, userId: string, dto: UpdateTenantDto) {
    await this.verifyOwnership(id, userId);

    if (dto.slug) {
      const existing = await this.prisma.tenant.findUnique({ where: { slug: dto.slug } });
      if (existing && existing.id !== id) {
        throw new ConflictException('Slug already in use');
      }
    }

    return this.prisma.tenant.update({
      where: { id },
      data: dto,
    });
  }

  async publish(id: string, userId: string) {
    await this.verifyOwnership(id, userId);

    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: { pages: true, theme: true, navigation: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const updated = await this.prisma.tenant.update({
      where: { id },
      data: { status: 'published', publishedAt: new Date() },
    });

    await this.prisma.theme.upsert({
      where: { tenantId: id },
      create: { tenantId: id },
      update: {},
    });

    return updated;
  }

  async getMyTenants(userId: string) {
    return this.prisma.tenantUser.findMany({
      where: { userId },
      include: {
        tenant: {
          select: { id: true, name: true, slug: true, logo: true, status: true, publishedAt: true },
        },
      },
    });
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
    if (!membership) throw new NotFoundException('Membership not found');

    await this.prisma.tenantUser.delete({ where: { id: membership.id } });
    return { message: 'User removed from tenant' };
  }

  private async verifyOwnership(tenantId: string, userId: string) {
    const membership = await this.prisma.tenantUser.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });
    if (!membership || !['owner', 'manager'].includes(membership.role)) {
      throw new ForbiddenException({ code: 'NOT_OWNER', message: 'Only tenant owners and managers can perform this action' });
    }
  }
}
