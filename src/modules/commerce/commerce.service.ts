import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class CommerceService {
  constructor(private prisma: PrismaService) {}

  async createCategory(tenantId: string, data: any) {
    return this.prisma.category.create({
      data: { tenantId, ...data },
    });
  }

  async getCategories(tenantId: string) {
    return this.prisma.category.findMany({
      where: { tenantId, isActive: true },
      include: { _count: { select: { products: true } } },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async updateCategory(categoryId: string, data: any) {
    const cat = await this.prisma.category.findUnique({ where: { id: categoryId } });
    if (!cat) throw new NotFoundException('Category not found');
    return this.prisma.category.update({ where: { id: categoryId }, data });
  }

  async deleteCategory(categoryId: string) {
    await this.prisma.category.update({
      where: { id: categoryId },
      data: { isActive: false },
    });
    return { message: 'Category deleted' };
  }

  async createProduct(tenantId: string, data: any) {
    return this.prisma.product.create({
      data: {
        tenantId,
        name: data.name,
        slug: data.slug,
        description: data.description,
        price: data.price,
        compareAtPrice: data.compareAtPrice,
        currency: data.currency || 'NGN',
        stock: data.stock || 0,
        sku: data.sku,
        categoryId: data.categoryId,
        images: data.images
          ? { create: data.images.map((url: string, i: number) => ({ url, sortOrder: i })) }
          : undefined,
      },
      include: { images: true },
    });
  }

  async getProducts(tenantId: string, query: any) {
    const where: any = { tenantId, isActive: true };
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.search) where.name = { contains: query.search, mode: 'insensitive' };

    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: { images: true, category: { select: { id: true, name: true, slug: true } } },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data,
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async getProduct(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { images: true, category: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async updateProduct(productId: string, data: any) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');

    const { images, ...productData } = data;

    if (images) {
      await this.prisma.productImage.deleteMany({ where: { productId } });
      await this.prisma.productImage.createMany({
        data: images.map((url: string, i: number) => ({ productId, url, sortOrder: i })),
      });
    }

    return this.prisma.product.update({
      where: { id: productId },
      data: productData,
      include: { images: true },
    });
  }

  async deleteProduct(productId: string) {
    await this.prisma.product.update({
      where: { id: productId },
      data: { isActive: false },
    });
    return { message: 'Product deleted' };
  }
}
