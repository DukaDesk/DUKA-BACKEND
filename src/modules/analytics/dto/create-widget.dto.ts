import { IsString, IsOptional, IsNumber, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateWidgetDto {
  @ApiProperty({ example: 'metric', enum: ['metric', 'chart', 'table', 'list'] })
  @IsString()
  @IsIn(['metric', 'chart', 'table', 'list'])
  type: string;

  @ApiProperty({ example: 'Total Revenue' })
  @IsString()
  title: string;

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

  @ApiPropertyOptional({ default: 4 })
  @IsOptional()
  @IsNumber()
  width?: number;

  @ApiPropertyOptional({ default: 2 })
  @IsOptional()
  @IsNumber()
  height?: number;

  @ApiPropertyOptional({ example: 'revenue' })
  @IsOptional()
  @IsString()
  metric?: string;

  @ApiPropertyOptional({ example: 'orders' })
  @IsOptional()
  @IsString()
  dataset?: string;

  @ApiPropertyOptional()
  @IsOptional()
  query?: Record<string, any>;
}
