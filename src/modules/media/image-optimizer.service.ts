import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import * as path from 'path';
import * as fs from 'fs/promises';

export interface OptimizedVariant {
  name: string;
  width: number;
  height: number;
  format: string;
  quality: number;
}

export interface VariantResult {
  name: string;
  width: number;
  height: number;
  format: string;
  filePath: string;
  size: number;
}

const PRESET_VARIANTS: OptimizedVariant[] = [
  { name: 'thumbnail', width: 150, height: 150, format: 'webp', quality: 80 },
  { name: 'small', width: 400, height: 0, format: 'webp', quality: 85 },
  { name: 'medium', width: 800, height: 0, format: 'webp', quality: 85 },
  { name: 'large', width: 1200, height: 0, format: 'webp', quality: 90 },
  { name: 'og-image', width: 1200, height: 630, format: 'jpeg', quality: 90 },
];

@Injectable()
export class ImageOptimizer {
  private readonly logger = new Logger(ImageOptimizer.name);
  private readonly variantsDir: string;

  constructor() {
    this.variantsDir = path.join(process.cwd(), 'uploads', 'variants');
    fs.mkdir(this.variantsDir, { recursive: true }).catch(() => {});
  }

  async optimize(inputBuffer: Buffer, mimeType: string, baseName: string): Promise<{
    optimized: { buffer: Buffer; size: number; mimeType: string };
    variants: VariantResult[];
    metadata: { width: number; height: number; format: string };
  }> {
    const image = sharp(inputBuffer);
    const metadata = await image.metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;
    const format = mimeType.split('/')[1] || 'jpeg';

    let optimized = inputBuffer;
    let optimizedSize = inputBuffer.length;
    if (mimeType.startsWith('image/')) {
      const compressed = await sharp(inputBuffer)
        .webp({ quality: 90 })
        .toBuffer();
      optimized = compressed;
      optimizedSize = compressed.length;
    }

    const variantResults: VariantResult[] = [];
    for (const variant of PRESET_VARIANTS) {
      if (variant.width > width && variant.height > height) continue;
      if (variant.name === 'thumbnail' && (width < 150 || height < 150)) {
        const thumb = await sharp(inputBuffer)
          .resize(150, 150, { fit: 'cover' })
          .webp({ quality: 70 })
          .toBuffer();
        const thumbName = `${baseName}_${variant.name}.webp`;
        const thumbPath = path.join(this.variantsDir, thumbName);
        await fs.writeFile(thumbPath, thumb);
        variantResults.push({ name: variant.name, width: 150, height: 150, format: 'webp', filePath: `/uploads/variants/${thumbName}`, size: thumb.length });
        continue;
      }

      const resizeOps: sharp.ResizeOptions = variant.height > 0
        ? { width: variant.width, height: variant.height, fit: 'cover' }
        : { width: variant.width, fit: 'inside', withoutEnlargement: true };

      const ext = variant.format;
      let buffer: Buffer;
      if (variant.format === 'webp') {
        buffer = await sharp(inputBuffer).resize(resizeOps).webp({ quality: variant.quality }).toBuffer();
      } else {
        buffer = await sharp(inputBuffer).resize(resizeOps).jpeg({ quality: variant.quality }).toBuffer();
      }

      const fileName = `${baseName}_${variant.name}.${ext}`;
      const filePath = path.join(this.variantsDir, fileName);
      await fs.writeFile(filePath, buffer);
      variantResults.push({ name: variant.name, width: variant.width || width, height: variant.height || Math.round(height * (variant.width / width)), format: ext, filePath: `/uploads/variants/${fileName}`, size: buffer.length });
    }

    return {
      optimized: { buffer: optimized, size: optimizedSize, mimeType: 'image/webp' },
      variants: variantResults,
      metadata: { width, height, format },
    };
  }
}
