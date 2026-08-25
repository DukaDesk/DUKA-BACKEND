import {
  Controller, Get, Post, Body, Param, UseGuards, Query,
  Delete,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiParam } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { UsersService } from './users.service';

@Controller('admin/users')
@ApiTags('Admin - User Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List all users (paginated, filter: email, role, tenant, status)' })
  @ApiQuery({ name: 'page', required: false, type: Number, default: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, default: 50 })
  @ApiQuery({ name: 'email', required: false })
  @ApiQuery({ name: 'role', required: false })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'status', required: false })
  async listUsers(
    @Query() query: {
      page?: number;
      limit?: number;
      email?: string;
      role?: string;
      tenantId?: string;
      status?: string;
    },
    @CurrentUser('id') adminUserId: string,
  ) {
    return this.usersService.listUsers(
      query.page,
      query.limit,
      {
        email: query.email,
        role: query.role,
        tenantId: query.tenantId,
        status: query.status,
      },
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user detail: profile, roles, tenant memberships, last login' })
  @ApiParam({ name: 'id', description: 'User ID' })
  async getUserById(@Param() param: { id: string }, @CurrentUser('id') adminUserId: string) {
    return this.usersService.getUserById(param.id);
  }

  @Post(':id/invite')
  @ApiOperation({ summary: 'Invite user to tenant (sends email with invite link)' })
  @ApiParam({ name: 'id', description: 'Target user ID' })
  @ApiQuery({ name: 'role', required: false, description: 'Role to assign' })
  @ApiQuery({ name: 'tenantId', required: false, description: 'Tenant ID' })
  async inviteUser(
    @Param() param: { id: string },
    @Body() body: { email: string; role?: string; tenantId?: string },
    @CurrentUser('id') adminUserId: string,
  ) {
    return this.usersService.inviteUser({
      email: body.email,
      role: body.role || 'staff',
      tenantId: body.tenantId || param.id,
      inviterId: adminUserId,
    });
  }

  @Post(':id/roles')
  @ApiOperation({ summary: 'Assign/update roles for user in tenant(s)' })
  @ApiParam({ name: 'id', description: 'User ID' })
  async assignUserRoles(
    @Param() param: { id: string },
    @Body() body: { role: string; tenantId: string },
    @CurrentUser('id') adminUserId: string,
  ) {
    return this.usersService.assignUserRoles(param.id, {
      role: body.role,
      tenantId: body.tenantId,
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove user from platform' })
  @ApiParam({ name: 'id', description: 'User ID' })
  async removeUser(
    @Param() param: { id: string },
    @CurrentUser('id') adminUserId: string,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.usersService.removeUser(param.id, tenantId);
  }

  @Get('tenant/:tenantId')
  @ApiOperation({ summary: 'Users scoped to a tenant (Tenant detail → Users tab)' })
  @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
  @ApiQuery({ name: 'page', required: false, type: Number, default: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, default: 50 })
  async getTenantUsers(
    @Param() param: { tenantId: string },
    @Query() query: { page?: number; limit?: number },
    @CurrentUser('id') adminUserId: string,
  ) {
    return this.usersService.getTenantUsers(param.tenantId, query.page, query.limit);
  }
}