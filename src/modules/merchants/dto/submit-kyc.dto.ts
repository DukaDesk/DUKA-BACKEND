import { IsArray, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SubmitKycDto {
  @ApiPropertyOptional({ example: "Ada's Kitchen Ltd" })
  @IsOptional()
  @IsString()
  businessName?: string;

  @ApiPropertyOptional({ example: 'RC123456' })
  @IsOptional()
  @IsString()
  regNo?: string;

  @ApiPropertyOptional({ example: 'TIN-987654' })
  @IsOptional()
  @IsString()
  taxId?: string;

  @ApiPropertyOptional({
    example: [{ name: 'CAC certificate', url: 'https://cdn.example/cac.pdf', type: 'document' }],
    description: 'Compliance documents as media URLs',
  })
  @IsOptional()
  @IsArray()
  documents?: Array<{ name?: string; url: string; type?: string }>;
}
