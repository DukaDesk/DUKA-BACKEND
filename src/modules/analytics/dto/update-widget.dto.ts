import { IsString, IsOptional, IsNumber, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateWidgetDto {
  @ApiPropertyOptional({ enum: ['metric', 'chart', 'table', 'list'] })
  @IsOptional()
  @IsString()
  @IsIn(['metric', 'chart', 'table', 'list'])
  type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subtitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  config?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  position?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  width?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  height?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  metric?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dataset?: string;

  @ApiPropertyOptional()
  @IsOptional()
  query?: Record<string, any>;
}
