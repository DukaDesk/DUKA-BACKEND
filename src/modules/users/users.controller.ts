import {
  Controller, Get, Post, Body, Param, UseGuards, Query,
  Delete,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiParam } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PlatformRoleGuard, RequirePlatformRoles } from '../admin/platform-role.guard';
import { UsersService } from './users.service';

@Controller('admin/users')
@ApiTags('Admin - User Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PlatformRoleGuard)
@RequirePlatformRoles('super_admin')
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
  @ApiQuery({ name: 'search', required: false, description: 'Search by email, first name, or last name' })
  @ApiQuery({ name: 'sort', required: false, enum: ['createdAt', 'email', 'firstName', 'lastName', 'status'] })
  @ApiQuery({ name: 'order', required: false, enum: ['asc', 'desc'] })
  async listUsers(
    @Query() query: {
      page?: number;
      limit?: number;
      email?: string;
      role?: string;
      tenantId?: string;
      status?: string;
      search?: string;
      sort?: string;
      order?: string;
    },
  ) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 50;
    return this.usersService.listUsers(
      page,
      limit,
      {
        email: query.email,
        role: query.role,
        tenantId: query.tenantId,
        status: query.status,
        search: query.search,
        sort: query.sort,
        order: query.order,
      },
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user detail: profile, roles, merchant memberships, last login' })
  @ApiParam({ name: 'id', description: 'User ID' })
  async getUserById(@Param() param: { id: string }) {
    return this.usersService.getUserById(param.id);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Approve a pending/suspended user (set status to active)' })
  @ApiParam({ name: 'id', description: 'User ID' })
  async approveUser(
    @Param() param: { id: string },
  ) {
    return this.usersService.approveUser(param.id);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject a user (set status to suspended)' })
  @ApiParam({ name: 'id', description: 'User ID' })
  async rejectUser(
    @Param() param: { id: string },
  ) {
    return this.usersService.rejectUser(param.id);
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
    @Query('role') queryRole?: string,
    @Query('tenantId') queryTenantId?: string,
  ) {
    return this.usersService.inviteUser({
      email: body.email,
      role: body.role || queryRole || 'staff',
      tenantId: body.tenantId || queryTenantId || param.id,
      inviterId: adminUserId,
    });
  }

  @Post(':id/roles')
  @ApiOperation({ summary: 'Assign/update roles for user in tenant(s)' })
  @ApiParam({ name: 'id', description: 'User ID' })
  async assignUserRoles(
    @Param() param: { id: string },
    @Body() body: { role: string; tenantId?: string },
    @CurrentUser('id') adminUserId: string,
  ) {
    return this.usersService.assignUserRoles(param.id, {
      role: body.role,
      tenantId: body.tenantId,
    }, adminUserId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove user from platform' })
  @ApiParam({ name: 'id', description: 'User ID' })
  async removeUser(
    @Param() param: { id: string },
    @CurrentUser('id') adminUserId: string,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.usersService.removeUser(param.id, tenantId, adminUserId);
  }

  @Get('merchant/:merchantId')
  @ApiOperation({ summary: 'Users scoped to a merchant (Merchant detail → Users tab)' })
  @ApiParam({ name: 'merchantId', description: 'Merchant ID' })
  @ApiQuery({ name: 'page', required: false, type: Number, default: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, default: 50 })
  async getMerchantUsers(
    @Param() param: { merchantId: string },
    @Query() query: { page?: number; limit?: number },
  ) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 50;
    return this.usersService.getTenantUsers(param.merchantId, page, limit);
  }

  @Get('tenant/:tenantId')
  @ApiOperation({ summary: 'Users scoped to a tenant (legacy alias for merchant/:merchantId)' })
  @ApiParam({ name: 'tenantId', description: 'Tenant ID' })
  @ApiQuery({ name: 'page', required: false, type: Number, default: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, default: 50 })
  async getTenantUsersAlias(
    @Param() param: { tenantId: string },
    @Query() query: { page?: number; limit?: number },
  ) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 50;
    return this.usersService.getTenantUsers(param.tenantId, page, limit);
  }
}