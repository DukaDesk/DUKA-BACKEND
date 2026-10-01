import { Injectable, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand, DeleteObjectCommand, CopyObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as path from 'path';
import * as fs from 'fs/promises';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private s3: S3Client | null = null;
  private bucket: string;
  private useS3: boolean;
  private readonly localDocumentSecret = process.env.JWT_SECRET || randomBytes(32).toString('hex');

  constructor() {
    this.useS3 = process.env.STORAGE_PROVIDER === 's3';
    this.bucket = process.env.STORAGE_BUCKET || 'dukadesk';

    if (this.useS3) {
      this.s3 = new S3Client({
        region: process.env.STORAGE_REGION || 'us-east-1',
        endpoint: process.env.STORAGE_ENDPOINT || undefined,
        credentials: {
          accessKeyId: process.env.STORAGE_ACCESS_KEY || '',
          secretAccessKey: process.env.STORAGE_SECRET_KEY || '',
        },
        forcePathStyle: true,
      });
      this.logger.log(`S3 storage: bucket=${this.bucket}`);
    } else {
      this.logger.log('Local disk storage');
    }
  }

  get baseUrl(): string {
    if (this.useS3) {
      const endpoint = process.env.STORAGE_ENDPOINT || '';
      return endpoint ? `${endpoint}/${this.bucket}` : `https://${this.bucket}.s3.amazonaws.com`;
    }
    const cdnUrl = process.env.CDN_URL || '';
    return cdnUrl;
  }

  async upload(key: string, buffer: Buffer, contentType: string): Promise<string> {
    const normalizedKey = this.normalizeKey(key);

    if (this.useS3) {
      await this.s3!.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: normalizedKey,
          Body: buffer,
          ContentType: contentType,
        }),
      );
      this.logger.debug(`S3 upload: ${normalizedKey}`);
      return `${this.baseUrl}/${normalizedKey}`;
    }

    const uploadDir = path.join(process.cwd(), 'uploads');
    await fs.mkdir(uploadDir, { recursive: true });
    const relativePath = normalizedKey.replace(/^uploads\//, '');
    const filePath = path.join(uploadDir, relativePath);
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, buffer);
    return `/uploads/${relativePath}`;
  }

  async moveToPrivate(url: string): Promise<string> {
    if (url.startsWith('private://')) return url;
    const sourceKey = this.toStorageKey(url);
    const ext = path.extname(sourceKey);
    const privateKey = `private/kyc/${randomBytes(18).toString('hex')}${ext}`;

    if (this.useS3) {
      await this.s3!.send(new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${sourceKey.split('/').map(encodeURIComponent).join('/')}`,
        Key: privateKey,
      }));
      await this.s3!.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: sourceKey }));
    } else {
      const uploadsRoot = path.resolve(process.cwd(), 'uploads');
      const sourcePath = path.resolve(uploadsRoot, sourceKey.replace(/^uploads\//, ''));
      if (!sourcePath.startsWith(`${uploadsRoot}${path.sep}`)) throw new Error('Invalid media path');
      const privateRoot = path.resolve(process.cwd(), 'private-uploads');
      const targetPath = path.resolve(privateRoot, privateKey.replace(/^private\//, ''));
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.rename(sourcePath, targetPath);
    }
    return `private://${privateKey}`;
  }

  async createTemporaryReadUrl(privateUrl: string, contentType: string): Promise<string> {
    const key = this.privateKey(privateUrl);
    if (this.useS3) {
      return getSignedUrl(this.s3!, new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentType: contentType,
        ResponseContentDisposition: 'attachment',
        ResponseCacheControl: 'private, no-store, max-age=0',
      }), { expiresIn: 300 });
    }

    const expiresAt = Math.floor(Date.now() / 1000) + 300;
    const payload = Buffer.from(JSON.stringify({ key, contentType, expiresAt })).toString('base64url');
    const signature = this.sign(payload);
    const apiBase = (process.env.API_PUBLIC_URL || `http://localhost:${process.env.PORT || 4000}`).replace(/\/$/, '');
    return `${apiBase}/api/v1/media/private/${payload}.${signature}`;
  }

  asPrivateReference(url: string): string | undefined {
    if (url.startsWith('private://')) return url;
    if (!this.useS3) {
      const match = url.match(/\/media\/private\/([^/?#]+)/);
      if (!match) return undefined;
      const [payload, signature, extra] = match[1].split('.');
      if (!payload || !signature || extra || !this.validSignature(payload, signature)) return undefined;
      try {
        const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        if (data.expiresAt < Math.floor(Date.now() / 1000) || !data.key.startsWith('private/')) return undefined;
        return `private://${data.key}`;
      } catch {
        return undefined;
      }
    }

    try {
      const parts = decodeURIComponent(new URL(url).pathname).replace(/^\/+/, '').split('/');
      if (parts[0] === this.bucket) parts.shift();
      const key = parts.join('/');
      return key.startsWith('private/') ? `private://${key}` : undefined;
    } catch {
      return undefined;
    }
  }

  async readTemporaryFile(token: string): Promise<{ body: Buffer; contentType: string }> {
    const [payload, signature, extra] = token.split('.');
    if (!payload || !signature || extra || !this.validSignature(payload, signature)) {
      throw new Error('Invalid or expired document link');
    }
    let data: { key: string; contentType: string; expiresAt: number };
    try {
      data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    } catch {
      throw new Error('Invalid or expired document link');
    }
    if (data.expiresAt < Math.floor(Date.now() / 1000) || !data.key.startsWith('private/')) {
      throw new Error('Invalid or expired document link');
    }

    const privateRoot = path.resolve(process.cwd(), 'private-uploads');
    const filePath = path.resolve(privateRoot, data.key.replace(/^private\//, ''));
    if (!filePath.startsWith(`${privateRoot}${path.sep}`)) throw new Error('Invalid document path');
    return { body: await fs.readFile(filePath), contentType: data.contentType };
  }

  async delete(keyOrUrl: string): Promise<void> {
    const key = this.toStorageKey(keyOrUrl);

    if (this.useS3) {
      await this.s3!.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      this.logger.debug(`S3 delete: ${key}`);
      return;
    }

    const isPrivate = key.startsWith('private/');
    const root = path.resolve(process.cwd(), isPrivate ? 'private-uploads' : 'uploads');
    const relativePath = key.replace(isPrivate ? /^private\// : /^uploads\//, '');
    const filePath = path.resolve(root, relativePath);
    if (!filePath.startsWith(`${root}${path.sep}`)) return;
    await fs.unlink(filePath).catch(() => {});
  }

  private normalizeKey(key: string): string {
    let k = key.replace(/^\/+/, '');
    if (k.startsWith('http://') || k.startsWith('https://')) {
      return this.toStorageKey(key);
    }
    if (!k.startsWith('uploads/')) k = `uploads/${k.replace(/^uploads\//, '')}`;
    return k;
  }

  /** Accepts a storage key or an absolute/relative URL and returns the object key. */
  private toStorageKey(keyOrUrl: string): string {
    let raw = keyOrUrl;
    if (raw.startsWith('private://')) return raw.slice('private://'.length);
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      try {
        const u = new URL(raw);
        raw = decodeURIComponent(u.pathname);
        // forcePathStyle: /bucket/uploads/... → strip bucket segment
        const parts = raw.replace(/^\/+/, '').split('/');
        if (parts[0] === this.bucket) {
          parts.shift();
          raw = parts.join('/');
        } else {
          raw = raw.replace(/^\/+/, '');
        }
      } catch {
        raw = keyOrUrl;
      }
    }
    raw = raw.replace(/^\/+/, '');
    if (raw.startsWith('uploads/')) return raw;
    // `/uploads/foo` handled above; bare `foo` → uploads/foo
    if (raw.includes('/')) return raw;
    return `uploads/${raw}`;
  }

  private privateKey(privateUrl: string): string {
    if (!privateUrl.startsWith('private://')) throw new Error('Document is not stored privately');
    const key = privateUrl.slice('private://'.length);
    if (!key.startsWith('private/')) throw new Error('Invalid private document reference');
    return key;
  }

  private sign(value: string): string {
    return createHmac('sha256', this.localDocumentSecret).update(value).digest('base64url');
  }

  private validSignature(payload: string, signature: string): boolean {
    const expected = Buffer.from(this.sign(payload));
    const actual = Buffer.from(signature);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
}
