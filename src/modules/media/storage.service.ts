import { Injectable, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import * as path from 'path';
import * as fs from 'fs/promises';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private s3: S3Client | null = null;
  private bucket: string;
  private useS3: boolean;

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
    if (this.useS3) {
      await this.s3!.send(new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }));
      this.logger.debug(`S3 upload: ${key}`);
      return `${this.baseUrl}/${key}`;
    }

    const uploadDir = path.join(process.cwd(), 'uploads');
    await fs.mkdir(uploadDir, { recursive: true });
    const relativePath = key.replace(/^uploads\//, '');
    const filePath = path.join(uploadDir, relativePath);
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, buffer);
    return `/uploads/${relativePath}`;
  }

  async delete(key: string): Promise<void> {
    if (this.useS3) {
      await this.s3!.send(new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }));
      this.logger.debug(`S3 delete: ${key}`);
      return;
    }

    const uploadDir = path.join(process.cwd(), 'uploads');
    const relativePath = key.replace(/^uploads\//, '');
    const filePath = path.join(uploadDir, relativePath);
    await fs.unlink(filePath).catch(() => {});
  }
}
