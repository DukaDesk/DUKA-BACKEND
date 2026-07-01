import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { ImageOptimizer } from './image-optimizer.service';
import * as path from 'path';
import * as fs from 'fs/promises';
import { randomUUID } from 'crypto';

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private uploadDir = path.join(process.cwd(), 'uploads');

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private imageOptimizer: ImageOptimizer,
  ) {
    fs.mkdir(this.uploadDir, { recursive: true }).catch(() => {});
  }

  async upload(tenantId: string, file: any, folderId?: string) {
    if (!file) throw new BadRequestException('No file provided');

    const hash = randomUUID();
    const ext = path.extname(file.originalname) || '.bin';
    const baseName = hash;
    const fileName = `${baseName}${ext}`;
    const filePath = path.join(this.uploadDir, fileName);
    await fs.writeFile(filePath, file.buffer);

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

        const webpPath = path.join(this.uploadDir, `${baseName}.webp`);
        await fs.writeFile(webpPath, result.optimized.buffer);
        optimizedUrl = `/uploads/${baseName}.webp`;

        const origWebpPath = path.join(this.uploadDir, `${baseName}${ext}`);
        if (origWebpPath !== webpPath) {
          await fs.unlink(origWebpPath).catch(() => {});
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

    const filePath = path.join(process.cwd(), media.url);
    await fs.unlink(filePath).catch(() => {});

    if (media.variants) {
      const variants: any = media.variants;
      for (const preset of variants.presets || []) {
        const vp = path.join(process.cwd(), preset.url);
        await fs.unlink(vp).catch(() => {});
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
    const baseUrl = process.env.CDN_URL || '';
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
