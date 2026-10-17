import { IsEmail, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendOtpDto {
  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ description: 'Short-lived challenge returned by the admin login endpoint' })
  @IsOptional()
  @IsUUID()
  challengeId?: string;
}
