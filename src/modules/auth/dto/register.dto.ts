import { IsEmail, IsString, MinLength, IsOptional, IsIn, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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
    description: 'Requested platform role — required, pending admin approval',
  })
  @IsString()
  @IsNotEmpty({ message: 'Role is required' })
  @IsIn(['super_admin', 'platform_operator', 'support_agent', 'admin', 'support', 'operations', 'finance'], {
    message: 'Role must be one of super_admin, platform_operator, support_agent',
  })
  role: string;
}
