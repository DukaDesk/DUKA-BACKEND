import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class WebsiteBffService {
  constructor(private prisma: PrismaService) {}

  async getPublicCategories() {
    // B2C verticals live for discovery (kept in sync with mobile discovery).
    return [
      { id: 'commerce', name: 'Commerce', icon: 'shopping-bag', description: 'Shop from amazing stores' },
      { id: 'restaurant', name: 'Restaurant', icon: 'utensils', description: 'Order from local restaurants' },
      { id: 'salon', name: 'Salon', icon: 'scissors', description: 'Find beauty professionals' },
    ];
  }

  async getFeaturedTenants() {
    return this.prisma.tenant.findMany({
      where: { status: 'published' },
      select: { id: true, name: true, slug: true, logo: true, publishedAt: true },
      take: 12,
      orderBy: { publishedAt: 'desc' },
    });
  }

  async getPricingPlans() {
    return this.prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { price: 'asc' },
    });
  }
}
