import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { RbacService } from '../rbac/rbac.service';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private rbacService: RbacService,
  ) {}

  async listUsers(page = 1, limit = 50, filters?: {
    email?: string;
    role?: string;
    tenantId?: string;
    status?: string;
  }) {
    const where: any = {};

    if (filters?.email) {
      where.email = {
        contains: filters.email,
        mode: 'insensitive' as const,
      };
    }

    if (filters?.role) {
      where.roles = {
        some: { role: { name: filters.role } },
      };
    }

    if (filters?.tenantId) {
      where.tenantId = filters.tenantId;
    }

    if (filters?.status) {
      const normalized = filters.status.toLowerCase();
      const allowedStatuses = ['active', 'pending', 'suspended', 'rejected', 'deactivated', 'deleted'];
      if (allowedStatuses.includes(normalized)) {
        where.status = normalized;
      }
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: {
          roles: {
            include: {
              role: true,
            },
          },
          tenants: {
            include: {
              tenant: true,
            },
          },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      users,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getUserById(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
        tenants: {
          include: {
            tenant: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async approveUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    return this.prisma.user.update({
      where: { id: userId },
      data: { status: 'active' },
    });
  }

  async rejectUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    return this.prisma.user.update({
      where: { id: userId },
      data: { status: 'suspended' },
    });
  }

  async inviteUser(inviteData: {
    email: string;
    role: string;
    tenantId: string;
    inviterId: string;
  }) {
    // Check if user exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: inviteData.email },
    });

    if (existingUser) {
      // User exists, assign role in tenant
      await this.rbacService.assignRole(
        existingUser.id,
        inviteData.role,
        inviteData.tenantId,
      );

      return { message: 'User invited and role assigned', userId: existingUser.id };
    }

    // Create new user with invite - simplified: we'll just assign role to existing flow
    // In production, this would trigger OTP/email invitation
    throw new NotFoundException('User not found. Please register first.');
  }

  async assignUserRoles(userId: string, roleData: {
    role: string;
    tenantId: string;
  }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.rbacService.assignRole(userId, roleData.role, roleData.tenantId);

    return { message: `Role ${roleData.role} assigned to user ${userId} in tenant ${roleData.tenantId}` };
  }

  async removeUser(userId: string, tenantId?: string) {
    const where: any = { userId };

    if (tenantId) {
      where.tenantId = tenantId;
    }

    const deleted = await this.prisma.userRole.deleteMany({ where });

    return { message: `User ${userId} removed${tenantId ? ` from tenant ${tenantId}` : ''}`, deletedCount: deleted.count };
  }

async getTenantUsers(tenantId: string, page = 1, limit = 50) {
    const [users, total] = await Promise.all([
      this.prisma.userRole.findMany({
        where: { tenantId },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              status: true,
            },
          },
          role: true,
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { id: 'desc' },
      }),
      this.prisma.userRole.count({ where: { tenantId } }),
    ]);

    return {
      users: users.map(ur => ur.user),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async deactivate(userId: string, dto?: { reason?: string }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if already scheduled for deletion
    if (user.scheduledDeletionAt) {
      const daysRemaining = Math.ceil(
        (user.scheduledDeletionAt.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      );
      return { message: `User already scheduled for deletion in ${daysRemaining} days`, daysRemaining };
    }

    // Set 30-day soft delete
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        status: 'deactivated',
        scheduledDeletionAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    return { message: 'User deactivated successfully (30-day soft delete)' };
  }

  async reactivate(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.status !== 'deactivated') {
      return { message: 'User is not deactivated' };
    }

    // Check if within 30-day window
    if (!user.scheduledDeletionAt) {
      return { message: 'User deactivation record not found' };
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    if (now > thirtyDaysAgo) {
      // Still within 30-day window - allow reactivation
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          status: 'active',
          scheduledDeletionAt: null,
        },
      });
      return { message: 'User reactivated successfully' };
    } else {
      // Outside 30-day window - need permanent deletion
      return { message: '30-day deactivation window has expired. Use permanentDelete instead.' };
    }
  }

  async permanentDelete(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Hard delete the user
    await this.prisma.user.delete({ where: { id: userId } });

    return { message: `User ${userId} permanently deleted` };
  }

  async getDeactivationStatus(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.status !== 'deactivated' || !user.scheduledDeletionAt) {
      return { status: 'active', daysRemaining: null };
    }

    const now = new Date();
    const deletionTime = user.scheduledDeletionAt.getTime();
    const currentTime = now.getTime();
    const daysRemaining = Math.ceil((deletionTime - currentTime) / (1000 * 60 * 60 * 24));

    if (daysRemaining <= 0) {
      return { status: 'expired', daysRemaining: 0 };
    }

    return { status: 'deactivated', daysRemaining };
  }
}