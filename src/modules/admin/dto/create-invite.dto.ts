import { IsEmail, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateInviteDto {
  @ApiProperty({ example: 'ops@dukadesk.com' })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: 'platform_operator',
    enum: ['super_admin', 'platform_operator', 'support_agent'],
  })
  @IsIn(['super_admin', 'platform_operator', 'support_agent', 'admin', 'support', 'operations', 'finance'], {
    message: 'Role must be one of super_admin, platform_operator, support_agent',
  })
  role: string;

  @ApiPropertyOptional({ example: 7, description: 'Days until the invite expires (1-30, default 7)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  expiresInDays?: number;
}
