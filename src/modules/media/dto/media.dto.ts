import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsIn } from 'class-validator';

export class UpdateMediaDto {
  @ApiPropertyOptional({ description: 'Original file name' })
  @IsString()
  @IsOptional()
  fileName?: string;

  @ApiPropertyOptional({ description: 'Alt text for accessibility' })
  @IsString()
  @IsOptional()
  alt?: string;

  @ApiPropertyOptional({ description: 'Folder ID to move media into', nullable: true })
  @IsString()
  @IsOptional()
  folderId?: string | null;

  @ApiPropertyOptional({ description: 'Visibility scope', enum: ['tenant', 'public'] })
  @IsString()
  @IsIn(['tenant', 'public'])
  @IsOptional()
  visibility?: string;
}

export class CreateFolderDto {
  @ApiProperty({ description: 'Folder name' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Parent folder ID' })
  @IsString()
  @IsOptional()
  parentId?: string;
}

export class UpdateFolderDto {
  @ApiPropertyOptional({ description: 'Folder name' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ description: 'Parent folder ID', nullable: true })
  @IsString()
  @IsOptional()
  parentId?: string | null;
}
