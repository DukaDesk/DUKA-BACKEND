import { IsString, IsEmail, IsOptional, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTenantDto {
  @ApiProperty({ example: 'ABC Pharmacy' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ example: 'abc-pharmacy' })
  @IsString()
  @MinLength(2)
  slug: string;

  @ApiPropertyOptional({ example: 'info@abcpharmacy.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+2348012345678' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  logo?: string;
}
