import { IsOptional, IsString, IsBoolean, IsObject } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateThemeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  primaryColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  secondaryColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  backgroundColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  textColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fontFamily?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  borderRadius?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  logo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  favicon?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  darkPrimaryColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  darkSecondaryColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  darkBackgroundColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  darkTextColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  typography?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  spacing?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  custom?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
