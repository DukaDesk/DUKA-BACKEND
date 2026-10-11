import { Injectable, BadRequestException, ForbiddenException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { ImageOptimizer } from './image-optimizer.service';
import { StorageService } from './storage.service';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';

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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VARIANT_MIME: Record<string, string> = {
  webp: 'image/webp',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
};

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly mediaPrivacyMoves = new Map<string, Promise<any>>();

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
      throw new BadRequestException(
        `File size ${Math.round(file.size / 1024 / 1024)}MB exceeds limit of 10MB`,
      );
    }

    // BUILDER TODO 3.1 — never pass a raw query folderId into Prisma.
    const resolvedFolderId = await this.resolveFolderId(tenantId, folderId);

    const hash = randomUUID();
    const ext = require('path').extname(file.originalname) || '.bin';
    const baseName = hash;
    const fileName = `${baseName}${ext}`;
    const storageKey = `uploads/${fileName}`;

    // B6 — retain the URL returned by StorageService (S3/CDN or local).
    let finalUrl = await this.storage.upload(storageKey, file.buffer, file.mimetype);

    const isImage = file.mimetype.startsWith('image/');
    let variants: any = null;

    if (isImage) {
      try {
        const result = await this.imageOptimizer.optimize(file.buffer, file.mimetype, baseName);

        const optimizedKey = `uploads/${baseName}.webp`;
        const optimizedUrl = await this.storage.upload(
          optimizedKey,
          result.optimized.buffer,
          'image/webp',
        );

        const presetEntries: any[] = [];
        for (const variant of result.variants) {
          const mime = VARIANT_MIME[variant.format] || 'application/octet-stream';
          const url = await this.storage.upload(variant.key, variant.buffer, mime);
          presetEntries.push({
            name: variant.name,
            url,
            key: variant.key,
            width: variant.width,
            height: variant.height,
            format: variant.format,
            size: variant.size,
          });
        }

        variants = {
          original: {
            url: finalUrl,
            key: storageKey,
            width: result.metadata.width,
            height: result.metadata.height,
            format: result.metadata.format,
            size: file.size,
          },
          optimized: {
            url: optimizedUrl,
            key: optimizedKey,
            size: result.optimized.size,
            format: 'webp',
          },
          presets: presetEntries,
        };

        // Delete the original only when it is a different object key than the
        // optimized WebP (prevents .webp uploads from self-deleting — B6).
        if (storageKey !== optimizedKey) {
          await this.storage.delete(storageKey);
        }

        finalUrl = optimizedUrl;
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
        url: finalUrl,
        hash,
        variants: variants as any,
        type: isImage ? 'image' : 'document',
        folderId: resolvedFolderId,
      },
    });

    if (isImage && variants) {
      await this.prisma.assetVersion.create({
        data: {
          mediaId: media.id,
          version: 1,
          fileSize: file.size,
          hash,
          storagePath: finalUrl,
          metadata: variants as any,
        },
      });
    }

    await this.redis.del(`media:${tenantId}`);

    return media;
  }

  /**
   * folderId rules (BUILDER TODO 3.1):
   * - omitted/empty → null (root)
   * - valid UUID → must exist for this tenant, else 400 INVALID_FOLDER
   * - non-UUID string → treated as folder name; find-or-create (idempotent, tenant-scoped)
   */
  private async resolveFolderId(tenantId: string, folderId?: string): Promise<string | null> {
    if (!folderId || !folderId.trim()) return null;
    const value = folderId.trim();

    if (UUID_RE.test(value)) {
      const folder = await this.prisma.assetFolder.findFirst({
        where: { id: value, tenantId },
        select: { id: true },
      });
      if (!folder) {
        throw new BadRequestException({
          code: 'INVALID_FOLDER',
          message: 'Folder not found',
        });
      }
      return folder.id;
    }

    // Name/slug form (e.g. legacy "?folderId=builder")
    const existing = await this.prisma.assetFolder.findFirst({
      where: { tenantId, name: value },
      select: { id: true },
    });
    if (existing) return existing.id;

    const created = await this.prisma.assetFolder.create({
      data: { tenantId, name: value },
      select: { id: true },
    });
    return created.id;
  }

  async findAll(tenantId: string, folderId?: string) {
    const where: any = { tenantId };
    // Only filter by folder when explicitly provided; otherwise list all tenant media.
    if (folderId && folderId.trim()) {
      const resolved = await this.resolveFolderId(tenantId, folderId);
      where.folderId = resolved;
    }
    const media = await this.prisma.media.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(media.map((item) => this.withTemporaryUrl(item)));
  }

  async findOne(id: string, tenantId: string) {
    const media = await this.prisma.media.findFirst({ where: { id, tenantId } });
    if (!media) throw new NotFoundException('Media not found');
    return this.withTemporaryUrl(media);
  }

  async delete(id: string, tenantId: string) {
    const media = await this.prisma.media.findFirst({ where: { id, tenantId } });
    if (!media) throw new NotFoundException('Media not found');
    if (media.url.startsWith('private://')) {
      const referenced = await this.prisma.kycSubmission.findFirst({
        where: { tenantId, documents: { array_contains: [{ url: media.url }] } },
        select: { id: true },
      });
      if (referenced) throw new ForbiddenException('A document attached to a compliance submission cannot be deleted');
    }

    await this.storage.delete(media.url);

    if (media.variants) {
      const v: any = media.variants;
      for (const preset of v.presets || []) {
        await this.storage.delete(preset.key || preset.url);
      }
      if (v.optimized?.key) await this.storage.delete(v.optimized.key);
      if (v.original?.key && v.original.key !== v.optimized?.key) {
        await this.storage.delete(v.original.key);
      }
    }

    await this.prisma.media.delete({ where: { id } });
    return { message: 'Media deleted' };
  }

  async update(
    id: string,
    tenantId: string,
    data: { fileName?: string; alt?: string; folderId?: string | null; visibility?: string },
  ) {
    const media = await this.prisma.media.findFirst({ where: { id, tenantId } });
    if (!media) throw new NotFoundException('Media not found');
    if (media.url.startsWith('private://') && data.visibility && data.visibility !== 'private') {
      throw new ForbiddenException('Compliance files cannot be made public');
    }

    let folderId = data.folderId;
    if (folderId != null && folderId !== '') {
      folderId = await this.resolveFolderId(media.tenantId, folderId);
    } else if (folderId === '') {
      folderId = null;
    }

    const updated = await this.prisma.media.update({
      where: { id },
      data: { ...data, folderId: folderId as any },
    });
    return this.withTemporaryUrl(updated);
  }

  async getCdnUrl(mediaId: string, tenantId: string, variant?: string): Promise<string> {
    const media = await this.prisma.media.findFirst({ where: { id: mediaId, tenantId } });
    if (!media) throw new NotFoundException('Media not found');
    if (media.url.startsWith('private://')) {
      return this.storage.createTemporaryReadUrl(media.url, media.mimeType);
    }
    if (!variant || !media.variants) {
      return media.url.startsWith('http')
        ? media.url
        : `${this.storage.baseUrl}${media.url}`;
    }
    const v: any = media.variants;
    const preset = (v.presets || []).find((p: any) => p.name === variant);
    const url = preset?.url || media.url;
    return url.startsWith('http') ? url : `${this.storage.baseUrl}${url}`;
  }

  async privatizeComplianceDocuments(tenantId: string, documents: Array<{ name?: string; url: string; type?: string }>) {
    const inputUrls = [...new Set(documents.map((document) => document.url))];
    const canonicalUrls = new Map(inputUrls.map((url) => [url, this.storage.asPrivateReference(url) ?? url]));
    const lookupUrls = [...new Set([...inputUrls, ...canonicalUrls.values()])];
    const mediaItems = inputUrls.length
      ? await this.prisma.media.findMany({ where: { tenantId, url: { in: lookupUrls } } })
      : [];
    const byUrl = new Map(mediaItems.map((media) => [media.url, media]));
    for (const url of inputUrls) {
      if (!byUrl.has(canonicalUrls.get(url)!)) {
        throw new BadRequestException('Compliance documents must be uploaded to this merchant’s media library');
      }
    }

    const privateUrls = new Map<string, string>();
    for (const url of inputUrls) {
      const media = byUrl.get(canonicalUrls.get(url)!);
      if (!media) continue;
      const privateMedia = await this.moveMediaToPrivate(media);
      privateUrls.set(url, privateMedia.url);
    }
    return documents.map((document) => ({ ...document, url: privateUrls.get(document.url)! }));
  }

  async createComplianceDocumentLinks(
    tenantId: string,
    submissionId: string,
    documents: Array<{ name?: string; url: string; type?: string }> = [],
  ) {
    const urls = [...new Set(documents.map((document) => document.url))];
    const mediaItems = urls.length
      ? await this.prisma.media.findMany({ where: { tenantId, url: { in: urls } } })
      : [];
    const byUrl = new Map(mediaItems.map((media) => [media.url, media]));
    const links = new Map<string, { url: string; privateUrl: string }>();

    for (const url of urls) {
      const existingMedia = byUrl.get(url);
      if (!existingMedia) continue;
      const media = await this.moveMediaToPrivate(existingMedia);
      links.set(url, {
        url: await this.storage.createTemporaryReadUrl(media.url, media.mimeType),
        privateUrl: media.url,
      });
    }

    const storedDocuments = documents.map((document) => ({
      ...document,
      url: links.get(document.url)?.privateUrl ?? document.url,
    }));
    await this.prisma.kycSubmission.update({
      where: { id: submissionId },
      data: { documents: storedDocuments as any },
    });
    return documents.map((document) => ({
      ...document,
      url: links.get(document.url)?.url,
      unavailable: !links.has(document.url),
    }));
  }

  private async moveMediaToPrivate(media: any): Promise<any> {
    if (media.url.startsWith('private://')) return media;
    const inProgress = this.mediaPrivacyMoves.get(media.id);
    if (inProgress) return inProgress;
    const move = this.performPrivateMove(media);
    this.mediaPrivacyMoves.set(media.id, move);
    try {
      return await move;
    } finally {
      this.mediaPrivacyMoves.delete(media.id);
    }
  }

  private async performPrivateMove(media: any): Promise<any> {
    const previousUrl = media.url;
    const privateUrl = await this.storage.moveToPrivate(media.url);
    const variants = media.variants as any;
    if (variants) {
      const variantUrls = [variants.original?.url, variants.optimized?.url, ...(variants.presets || []).map((item: any) => item.url)];
      for (const url of new Set(variantUrls.filter((value: any) => value && value !== media.url))) {
        await this.storage.delete(url);
      }
    }
    const updatedMedia = await this.prisma.media.update({
      where: { id: media.id },
      data: { url: privateUrl, visibility: 'private', variants: Prisma.JsonNull },
    });
    const priorSubmissions = await this.prisma.kycSubmission.findMany({
      where: { tenantId: media.tenantId, documents: { array_contains: [{ url: previousUrl }] } },
    });
    await Promise.all(priorSubmissions.map((submission: any) => {
      const docs = Array.isArray(submission.documents) ? submission.documents : [];
      const documents = docs.map((document: any) => document?.url === previousUrl
        ? { ...document, url: privateUrl }
        : document);
      return this.prisma.kycSubmission.update({ where: { id: submission.id }, data: { documents } });
    }));
    return updatedMedia;
  }

  private async withTemporaryUrl(media: any): Promise<any> {
    if (!media.url.startsWith('private://')) return media;
    return { ...media, url: await this.storage.createTemporaryReadUrl(media.url, media.mimeType) };
  }


  async createFolder(tenantId: string, name: string, parentId?: string) {
    return this.prisma.assetFolder.create({
      data: { tenantId, name, parentId: parentId || null },
    });
  }

  async getFolders(tenantId: string, parentId?: string) {
    const where: any = { tenantId };
    if (parentId !== undefined) where.parentId = parentId || null;
    return this.prisma.assetFolder.findMany({
      where,
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
    const folder = await this.prisma.assetFolder.findUnique({
      where: { id },
      include: { children: true, media: true },
    });
    if (!folder) throw new NotFoundException('Folder not found');
    if (folder.children.length > 0)
      throw new BadRequestException('Folder has subfolders — delete them first');
    if (folder.media.length > 0)
      throw new BadRequestException('Folder has media — move or delete them first');
    return this.prisma.assetFolder.delete({ where: { id } });
  }
}
