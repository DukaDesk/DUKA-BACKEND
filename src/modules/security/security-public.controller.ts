import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { SecurityService } from './security.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Security - Public')
@Controller({ version: '1' })
export class SecurityPublicController {
  constructor(private readonly securityService: SecurityService) {}

  @Post('security/validate-password')
  @ApiOperation({ summary: 'Validate password against policy (public)' })
  validatePassword(@Body() data: { password: string; merchantId: string }) {
    return this.securityService.validatePasswordStrength(data.password, data.merchantId);
  }
}