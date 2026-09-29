import { IsEmail, IsString, MinLength, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '+2348012345678' })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiProperty({ example: 'John' })
  @IsString()
  @MinLength(1)
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  @MinLength(1)
  lastName: string;

  @ApiProperty({ example: 'SecurePass123!' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({
    example: 'platform_operator',
    enum: ['super_admin', 'platform_operator', 'support_agent'],
    required: false,
    description: 'Requested platform role — omit for merchant self-serve signup (provisions an owned merchant and signs in immediately); when present the account stays pending admin approval',
  })
  @IsOptional()
  @IsString()
  @IsIn(['super_admin', 'platform_operator', 'support_agent', 'admin', 'support', 'operations', 'finance'], {
    message: 'Role must be one of super_admin, platform_operator, support_agent',
  })
  role?: string;

  @ApiPropertyOptional({ example: "Ada's Kitchen", description: 'Business name — used to provision the owned merchant on self-serve signup' })
  @IsOptional()
  @IsString()
  businessName?: string;
}
