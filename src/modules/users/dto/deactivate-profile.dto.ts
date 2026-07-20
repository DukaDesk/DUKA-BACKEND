import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class DeactivateProfileDto {
  @ApiPropertyOptional({ description: 'Reason for deactivation' })
  @IsOptional()
  @IsString()
  reason?: string;
}
