import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { ImageOptimizer } from './image-optimizer.service';
import { StorageService } from './storage.service';
import { randomUUID } from 'crypto';

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/avif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'video/mp4',
  'video/webm',
  'audio/mpeg',
  'audio/wav',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private imageOptimizer: ImageOptimizer,
    private storage: StorageService,
  ) {}

  async upload(tenantId: string, file: any, folderId?: string) {
    if (!file) throw new BadRequestException('No file provided');

    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(`File type '${file.mimetype}' is not allowed.`);
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(`File size ${Math.round(file.size / 1024 / 1024)}MB exceeds limit of 10MB`);
    }

    const hash = randomUUID();
    const ext = require('path').extname(file.originalname) || '.bin';
    const baseName = hash;
    const fileName = `${baseName}${ext}`;
    const storageKey = `uploads/${fileName}`;

    await this.storage.upload(storageKey, file.buffer, file.mimetype);

    const isImage = file.mimetype.startsWith('image/');
    let variants: any = null;
    let optimizedUrl = `/uploads/${fileName}`;

    if (isImage) {
      try {
        const result = await this.imageOptimizer.optimize(file.buffer, file.mimetype, baseName);
        variants = {
          original: { url: optimizedUrl, width: result.metadata.width, height: result.metadata.height, format: result.metadata.format, size: file.size },
          optimized: { url: `/uploads/${baseName}.webp`, size: result.optimized.size, format: 'webp' },
          presets: result.variants.map((v) => ({ url: v.filePath, width: v.width, height: v.height, format: v.format, size: v.size, name: v.name })),
        };

        await this.storage.upload(`uploads/${baseName}.webp`, result.optimized.buffer, 'image/webp');
        optimizedUrl = `/uploads/${baseName}.webp`;

        const origPath = `uploads/${fileName}`;
        if (origPath !== `uploads/${baseName}.webp`) {
          await this.storage.delete(origPath);
        }
      } catch (err: any) {
        this.logger.warn(`Image optimization failed for ${file.originalname}: ${err.message}`);
      }
    }

    const media = await this.prisma.media.create({
      data: {
        tenantId,
        fileName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        url: optimizedUrl,
        hash,
        variants: variants as any,
        type: isImage ? 'image' : 'document',
        folderId: folderId || null,
      },
    });

    if (isImage && variants) {
      await this.prisma.assetVersion.create({
        data: {
          mediaId: media.id,
          version: 1,
          fileSize: file.size,
          hash,
          storagePath: optimizedUrl,
          metadata: variants as any,
        },
      });
    }

    await this.redis.del(`media:${tenantId}`);

    return media;
  }

  async findAll(tenantId: string, folderId?: string) {
    return this.prisma.media.findMany({
      where: { tenantId, folderId: folderId || null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const media = await this.prisma.media.findUnique({ where: { id } });
    if (!media) throw new NotFoundException('Media not found');
    return media;
  }

  async delete(id: string) {
    const media = await this.prisma.media.findUnique({ where: { id } });
    if (!media) throw new NotFoundException('Media not found');

    await this.storage.delete(media.url);

    if (media.variants) {
      const v: any = media.variants;
      for (const preset of v.presets || []) {
        await this.storage.delete(preset.url);
      }
    }

    await this.prisma.media.delete({ where: { id } });
    return { message: 'Media deleted' };
  }

  async update(id: string, data: { fileName?: string; alt?: string; folderId?: string | null; visibility?: string }) {
    const media = await this.prisma.media.findUnique({ where: { id } });
    if (!media) throw new NotFoundException('Media not found');
    return this.prisma.media.update({ where: { id }, data });
  }

  async getCdnUrl(mediaId: string, variant?: string): Promise<string> {
    const media = await this.prisma.media.findUnique({ where: { id: mediaId } });
    if (!media) throw new NotFoundException('Media not found');
    const baseUrl = this.storage.baseUrl;
    if (!variant || !media.variants) return `${baseUrl}${media.url}`;
    const v: any = media.variants;
    const preset = (v.presets || []).find((p: any) => p.name === variant);
    return `${baseUrl}${preset?.url || media.url}`;
  }

  async createFolder(tenantId: string, name: string, parentId?: string) {
    return this.prisma.assetFolder.create({
      data: { tenantId, name, parentId: parentId || null },
    });
  }

  async getFolders(tenantId: string, parentId?: string) {
    return this.prisma.assetFolder.findMany({
      where: { tenantId, parentId: parentId || null },
      include: { children: true, _count: { select: { media: true } } },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async updateFolder(id: string, data: { name?: string; parentId?: string | null }) {
    const folder = await this.prisma.assetFolder.findUnique({ where: { id } });
    if (!folder) throw new NotFoundException('Folder not found');
    return this.prisma.assetFolder.update({ where: { id }, data });
  }

  async deleteFolder(id: string) {
    const folder = await this.prisma.assetFolder.findUnique({ where: { id }, include: { children: true, media: true } });
    if (!folder) throw new NotFoundException('Folder not found');
    if (folder.children.length > 0) throw new BadRequestException('Folder has subfolders — delete them first');
    if (folder.media.length > 0) throw new BadRequestException('Folder has media — move or delete them first');
    return this.prisma.assetFolder.delete({ where: { id } });
  }
}
