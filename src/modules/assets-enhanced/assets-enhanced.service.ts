import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class AssetsEnhancedService {
  constructor(private prisma: PrismaService) {}

  // ─── Asset Collections ───────────────────────────────────────

  async createCollection(data: {
    tenantId: string; name: string; slug: string;
    description?: string; coverUrl?: string; isPublic?: boolean;
  }) {
    return this.prisma.assetCollection.create({ data: data as any });
  }

  async getCollections(tenantId: string) {
    return this.prisma.assetCollection.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
  }

  async getCollection(id: string) {
    const collection = await this.prisma.assetCollection.findUnique({
      where: { id },
      include: {
        items: {
          include: { media: true },
          orderBy: { order: 'asc' },
        },
      },
    });
    if (!collection) throw new NotFoundException('Collection not found');
    return collection;
  }

  async updateCollection(id: string, data: Partial<{
    name: string; slug: string; description: string;
    coverUrl: string; isPublic: boolean;
  }>) {
    return this.prisma.assetCollection.update({ where: { id }, data: data as any });
  }

  async deleteCollection(id: string) {
    return this.prisma.assetCollection.delete({ where: { id } });
  }

  async addMediaToCollection(collectionId: string, mediaId: string, order?: number) {
    return this.prisma.assetCollectionItem.create({
      data: { collectionId, mediaId, order: order || 0 } as any,
    });
  }

  async removeMediaFromCollection(collectionId: string, mediaId: string) {
    return this.prisma.assetCollectionItem.delete({
      where: { collectionId_mediaId: { collectionId, mediaId } },
    });
  }

  // ─── Asset Sharing ───────────────────────────────────────────

  async createShare(data: {
    tenantId: string; mediaId: string;
    expiresAt?: string; maxDownloads?: number; password?: string; createdBy?: string;
  }) {
    const token = crypto.randomBytes(24).toString('hex');
    return this.prisma.assetShare.create({
      data: {
        ...data,
        token,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
      } as any,
    });
  }

  async getSharedLinks(tenantId: string) {
    return this.prisma.assetShare.findMany({
      where: { tenantId },
      include: { media: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async resolveShareToken(token: string) {
    const share = await this.prisma.assetShare.findUnique({
      where: { token },
      include: { media: true },
    });

    if (!share || !share.isActive) throw new NotFoundException('Share link not found or expired');
    if (share.expiresAt && share.expiresAt < new Date()) throw new BadRequestException('Share link has expired');
    if (share.maxDownloads && share.downloadCount >= share.maxDownloads) {
      throw new BadRequestException('Share link download limit reached');
    }

    await this.prisma.assetShare.update({
      where: { id: share.id },
      data: { downloadCount: { increment: 1 } },
    });

    if (share.maxDownloads && share.downloadCount + 1 >= share.maxDownloads) {
      await this.prisma.assetShare.update({
        where: { id: share.id },
        data: { isActive: false },
      });
    }

    return share;
  }

  async deactivateShare(id: string) {
    return this.prisma.assetShare.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // ─── Storage Providers ───────────────────────────────────────

  async createStorageProvider(data: {
    tenantId?: string; name: string; provider: string;
    config?: Record<string, any>; isDefault?: boolean;
  }) {
    if (data.isDefault) {
      await this.prisma.storageProvider.updateMany({
        where: { tenantId: data.tenantId || null },
        data: { isDefault: false },
      });
    }
    return this.prisma.storageProvider.create({ data: data as any });
  }

  async getStorageProviders(tenantId?: string) {
    const where: any = {};
    if (tenantId) where.tenantId = tenantId;
    return this.prisma.storageProvider.findMany({ where, orderBy: { name: 'asc' } });
  }

  async updateStorageProvider(id: string, data: Partial<{
    name: string; config: Record<string, any>; isDefault: boolean; isActive: boolean;
  }>) {
    if (data.isDefault) {
      const provider = await this.prisma.storageProvider.findUnique({ where: { id } });
      await this.prisma.storageProvider.updateMany({
        where: { tenantId: provider?.tenantId || null },
        data: { isDefault: false },
      });
    }
    return this.prisma.storageProvider.update({ where: { id }, data: data as any });
  }

  async getStorageStats(tenantId?: string) {
    const where: any = {};
    if (tenantId) where.tenantId = tenantId;

    const providers = await this.prisma.storageProvider.findMany({ where });
    const totalMedia = await this.prisma.media.count({ where: { tenantId } });
    const totalSize = await this.prisma.media.aggregate({
      where: { tenantId },
      _sum: { size: true },
    });

    return {
      totalProviders: providers.length,
      totalMedia,
      totalSizeBytes: totalSize._sum.size || 0,
      providers: providers.map((p) => ({
        name: p.name,
        provider: p.provider,
        usedBytes: Number(p.usedBytes),
        isDefault: p.isDefault,
        isActive: p.isActive,
      })),
    };
  }

  // ─── Asset Transformation ────────────────────────────────────

  async getTransformationPresets() {
    return [
      { name: 'thumbnail', width: 150, height: 150, fit: 'cover', format: 'webp' },
      { name: 'small', width: 300, height: 300, fit: 'inside', format: 'webp' },
      { name: 'medium', width: 600, height: 600, fit: 'inside', format: 'webp' },
      { name: 'large', width: 1200, height: 1200, fit: 'inside', format: 'webp' },
      { name: 'og-image', width: 1200, height: 630, fit: 'cover', format: 'webp' },
    ];
  }

  async transformAsset(mediaId: string, options: {
    width?: number; height?: number; fit?: string; format?: string; quality?: number;
  }) {
    const media = await this.prisma.media.findUnique({ where: { id: mediaId } });
    if (!media) throw new NotFoundException('Media not found');

    const preset = options.width || options.height
      ? null
      : { width: options.width, height: options.height, fit: options.fit || 'inside', format: options.format || 'webp' };

    return {
      originalUrl: media.url,
      transformed: {
        url: `${media.url}?transform=1&w=${options.width || ''}&h=${options.height || ''}&fit=${options.fit || 'inside'}&fmt=${options.format || 'webp'}&q=${options.quality || 80}`,
        ...(preset || options),
      },
    };
  }
}
