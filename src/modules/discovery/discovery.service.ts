import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class DiscoveryService {
  constructor(private prisma: PrismaService) {}

  async getFeatured() {
    return this.prisma.tenant.findMany({
      where: { status: 'published' },
      select: { id: true, name: true, slug: true, logo: true },
      take: 10,
      orderBy: { publishedAt: 'desc' },
    });
  }

  async search(query: string) {
    return this.prisma.tenant.findMany({
      where: {
        status: 'published',
        name: { contains: query, mode: 'insensitive' },
      },
      select: { id: true, name: true, slug: true, logo: true, publishedAt: true },
      take: 20,
      orderBy: { name: 'asc' },
    });
  }

  async getCategories() {
    const categories = [
      { id: 'commerce', name: 'Commerce', icon: 'shopping-bag' },
      { id: 'restaurant', name: 'Restaurant', icon: 'utensils' },
      { id: 'fashion', name: 'Fashion', icon: 'shirt' },
      { id: 'grocery', name: 'Grocery', icon: 'shopping-cart' },
      { id: 'clinic', name: 'Clinic', icon: 'stethoscope' },
      { id: 'salon', name: 'Salon', icon: 'scissors' },
      { id: 'law-firm', name: 'Law Firm', icon: 'scale' },
      { id: 'church', name: 'Church', icon: 'cross' },
      { id: 'mosque', name: 'Mosque', icon: 'mosque' },
      { id: 'ngo', name: 'NGO', icon: 'heart' },
      { id: 'school', name: 'School', icon: 'graduation-cap' },
      { id: 'coaching', name: 'Coaching', icon: 'book-open' },
    ];
    return categories;
  }

  async getNearby(lat: number, lng: number) {
    return this.prisma.tenant.findMany({
      where: { status: 'published' },
      select: { id: true, name: true, slug: true, logo: true },
      take: 20,
    });
  }
}
