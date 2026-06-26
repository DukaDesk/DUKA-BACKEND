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
export class TenantsService {
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

    return tenant;
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
    if (!membership || membership.role !== 'owner') {
      throw new ForbiddenException('Only the tenant owner can perform this action');
    }
  }
}
