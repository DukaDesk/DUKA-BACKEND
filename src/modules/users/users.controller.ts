import { Controller, Get, Put, Post, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { GrantConsentDto } from './dto/grant-consent.dto';
import { DeactivateProfileDto } from './dto/deactivate-profile.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Profile')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'profile', version: '1' })
export class ProfileController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Get current user profile' })
  getProfile(@CurrentUser('id') userId: string) {
    return this.usersService.getProfile(userId);
  }

  @Put()
  @ApiOperation({ summary: 'Update user profile' })
  updateProfile(@CurrentUser('id') userId: string, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(userId, dto);
  }

  @Get('memberships')
  @ApiOperation({ summary: 'Get all tenant memberships' })
  getMemberships(@CurrentUser('id') userId: string) {
    return this.usersService.getMemberships(userId);
  }

  @Get('consents')
  @ApiOperation({ summary: 'Get all consents' })
  getConsents(@CurrentUser('id') userId: string) {
    return this.usersService.getConsents(userId);
  }

  @Post('consents')
  @ApiOperation({ summary: 'Grant consent to a tenant' })
  grantConsent(@CurrentUser('id') userId: string, @Body() dto: GrantConsentDto) {
    return this.usersService.grantConsent(userId, dto);
  }

  @Delete('consents/:tenantId')
  @ApiOperation({ summary: 'Revoke consent for a tenant' })
  revokeConsent(@CurrentUser('id') userId: string, @Param('tenantId') tenantId: string) {
    return this.usersService.revokeConsent(userId, tenantId);
  }

  @Post('deactivate')
  @ApiOperation({ summary: 'Deactivate profile (30-day soft delete before permanent deletion)' })
  deactivate(@CurrentUser('id') userId: string, @Body() dto?: DeactivateProfileDto) {
    return this.usersService.deactivate(userId, dto);
  }

  @Post('reactivate')
  @ApiOperation({ summary: 'Reactivate a deactivated profile' })
  reactivate(@CurrentUser('id') userId: string) {
    return this.usersService.reactivate(userId);
  }

  @Delete()
  @ApiOperation({ summary: 'Permanently delete profile immediately (GDPR/Apple/Google compliance)' })
  permanentDelete(@CurrentUser('id') userId: string) {
    return this.usersService.permanentDelete(userId);
  }

  @Get('deactivation-status')
  @ApiOperation({ summary: 'Get deactivation status and days remaining' })
  getDeactivationStatus(@CurrentUser('id') userId: string) {
    return this.usersService.getDeactivationStatus(userId);
  }
}
