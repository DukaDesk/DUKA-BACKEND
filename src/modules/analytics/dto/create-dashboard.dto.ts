import { IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDashboardDto {
  @ApiProperty({ example: 'My Dashboard' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'my-dashboard' })
  @IsString()
  slug: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  layout?: Record<string, any>;
}
