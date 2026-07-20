import { Controller, Get, Post, Param, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { UsersService } from '../users/users.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'admin', version: '1' })
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly usersService: UsersService,
  ) {}

  @Post('tenants/:id/approve')
  @ApiOperation({ summary: 'Approve a tenant' })
  approveTenant(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.adminService.approveTenant(id, userId);
  }

  @Post('tenants/:id/suspend')
  @ApiOperation({ summary: 'Suspend a tenant' })
  suspendTenant(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.adminService.suspendTenant(id, userId);
  }

  @Get('tenants')
  @ApiOperation({ summary: 'Get all tenants (admin)' })
  @ApiQuery({ name: 'status', required: false })
  getTenants(@CurrentUser('id') userId: string, @Query('status') status?: string) {
    return this.adminService.getTenants(userId, status);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get platform stats' })
  getStats(@CurrentUser('id') userId: string) {
    return this.adminService.getStats(userId);
  }

  @Post('cleanup-deactivated')
  @ApiOperation({ summary: 'Permanently delete accounts past 30-day deactivation period' })
  cleanupDeactivated(@CurrentUser('id') userId: string) {
    return this.usersService.cleanupDeactivatedAccounts();
  }
}
