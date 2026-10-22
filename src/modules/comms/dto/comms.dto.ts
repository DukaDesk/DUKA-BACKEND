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
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';

export const COMMS_MEDIA_MOBILE_ONLY = true as const;

export class CommsMediaRef {
  @ApiPropertyOptional({ description: 'Uploaded Media asset id backing this media' })
  @IsOptional()
  @IsUUID()
  mediaId?: string;

  @ApiProperty({ description: 'Deliverable URL for the asset (from app/media or platform uploads)' })
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

export class CreateAnnouncementDto {
  @ApiProperty({ enum: ['broadcast', 'direct'], default: 'broadcast' })
  @IsIn(['broadcast', 'direct'])
  kind!: 'broadcast' | 'direct';

  @ApiPropertyOptional({
    enum: ['merchants', 'mobile', 'both'],
    description: 'Broadcast audience. Media is only valid when the audience includes mobile users.',
  })
  @IsOptional()
  @IsIn(['merchants', 'mobile', 'both'])
  audience?: 'merchants' | 'mobile' | 'both';

  @ApiPropertyOptional({ description: 'Direct message → merchant tenant recipient' })
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiPropertyOptional({ description: 'Direct message → authenticated mobile user' })
  @IsOptional()
  @IsUUID()
  recipientUserId?: string;

  @ApiPropertyOptional({ description: 'Direct message → anonymous mobile device actor key' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  recipientActorId?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @ApiProperty({ maxLength: 4000 })
  @IsString()
  @MaxLength(4000)
  body!: string;

  @ApiPropertyOptional({ type: [CommsMediaRef], maxItems: 4 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => CommsMediaRef)
  media?: CommsMediaRef[];
}

export class CommsReplyDto {
  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @MaxLength(2000)
  body!: string;
}

export class ListAnnouncementsDto {
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

  @ApiPropertyOptional({ enum: ['broadcast', 'direct', 'all'] })
  @IsOptional()
  @IsIn(['broadcast', 'direct', 'all'])
  kind?: 'broadcast' | 'direct' | 'all';

  @ApiPropertyOptional({ enum: ['merchants', 'mobile', 'both'] })
  @IsOptional()
  @IsIn(['merchants', 'mobile', 'both'])
  audience?: 'merchants' | 'mobile' | 'both';
}
