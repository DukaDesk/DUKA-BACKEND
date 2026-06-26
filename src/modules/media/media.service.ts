import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import * as path from 'path';
import * as fs from 'fs/promises';
import { randomUUID } from 'crypto';

@Injectable()
export class MediaService {
  private uploadDir = path.join(process.cwd(), 'uploads');

  constructor(private prisma: PrismaService) {
    fs.mkdir(this.uploadDir, { recursive: true }).catch(() => {});
  }

  async upload(tenantId: string, file: any) {
    if (!file) throw new BadRequestException('No file provided');

    const ext = path.extname(file.originalname);
    const fileName = `${randomUUID()}${ext}`;
    const filePath = path.join(this.uploadDir, fileName);

    await fs.writeFile(filePath, file.buffer);

    const media = await this.prisma.media.create({
      data: {
        tenantId,
        fileName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        url: `/uploads/${fileName}`,
        type: file.mimetype.startsWith('image') ? 'image' : 'document',
      },
    });

    return media;
  }

  async findAll(tenantId: string) {
    return this.prisma.media.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async delete(id: string) {
    const media = await this.prisma.media.findUnique({ where: { id } });
    if (!media) throw new NotFoundException('Media not found');

    const filePath = path.join(process.cwd(), media.url);
    await fs.unlink(filePath).catch(() => {});

    await this.prisma.media.delete({ where: { id } });
    return { message: 'Media deleted' };
  }
}
