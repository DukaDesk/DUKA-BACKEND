import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
  ArrayMaxSize,
  ArrayMinSize,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';

export class FeedMediaRef {
  @ApiPropertyOptional({ description: 'Uploaded Media asset id backing this media' })
  @IsOptional()
  @IsUUID()
  mediaId?: string;

  @ApiProperty({ description: 'Deliverable URL for the asset (from app/media uploads)' })
  @IsString()
  url!: string;

  @ApiProperty({ enum: ['image', 'video'] })
  @IsIn(['image', 'video'])
  type!: 'image' | 'video';

  @ApiPropertyOptional({ description: 'Poster frame URL for videos' })
  @IsOptional()
  @IsString()
  posterUrl?: string;
}

export class CreateFeedPostDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  caption?: string;

  @ApiPropertyOptional({ description: 'Product the CTA always opens in the merchant app' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ default: 'Buy Now', maxLength: 40 })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  ctaLabel?: string;

  @ApiProperty({ type: [FeedMediaRef], maxItems: 10, description: '1 image…10 images, or exactly 1 video' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => FeedMediaRef)
  media!: FeedMediaRef[];
}

export class UpdateFeedPostDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  caption?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ maxLength: 40 })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  ctaLabel?: string;

  @ApiPropertyOptional({ type: [FeedMediaRef] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => FeedMediaRef)
  media?: FeedMediaRef[];

  @ApiPropertyOptional({ enum: ['published', 'retired'], default: 'published' })
  @IsOptional()
  @IsIn(['published', 'retired'])
  status?: 'published' | 'retired';
}

export class ListFeedPostsDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
