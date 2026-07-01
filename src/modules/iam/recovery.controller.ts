import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { RecoveryService } from './recovery.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Recovery')
@Public()
@Controller({ path: 'auth', version: '1' })
export class RecoveryController {
  constructor(private readonly recoveryService: RecoveryService) {}

  @Post('forgot-password')
  @ApiOperation({ summary: 'Request password reset' })
  forgotPassword(@Body('email') email: string) {
    return this.recoveryService.requestReset(email);
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password with token' })
  resetPassword(@Body('token') token: string, @Body('password') password: string) {
    return this.recoveryService.resetPassword(token, password);
  }
}
