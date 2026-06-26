import { IsString, IsArray } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GrantConsentDto {
  @ApiProperty()
  @IsString()
  tenantId: string;

  @ApiProperty({ example: ['profile.read', 'email.read'] })
  @IsArray()
  @IsString({ each: true })
  scopes: string[];
}
