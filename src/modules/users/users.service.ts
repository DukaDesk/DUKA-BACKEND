import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { EventBusService } from '../../shared/events/event-bus.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { GrantConsentDto } from './dto/grant-consent.dto';
import { DeactivateProfileDto } from './dto/deactivate-profile.dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
  ) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
    if (!user) throw new NotFoundException('User not found');
    const { passwordHash, ...rest } = user;
    return rest;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const { firstName, lastName, phoneNumber, ...profileData } = dto;

    if (firstName || lastName || phoneNumber) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { firstName, lastName, phoneNumber },
      });
    }

    await this.prisma.profile.upsert({
      where: { userId },
      create: { userId, ...profileData },
      update: profileData,
    });

    return this.getProfile(userId);
  }

  async getMemberships(userId: string) {
    return this.prisma.tenantUser.findMany({
      where: { userId, status: 'active' },
      include: {
        tenant: {
          select: { id: true, name: true, slug: true, logo: true, status: true },
        },
      },
    });
  }

  async getConsents(userId: string) {
    return this.prisma.consent.findMany({
      where: { userId },
      include: { scopes: true, tenant: { select: { id: true, name: true, slug: true } } },
    });
  }

  async grantConsent(userId: string, dto: GrantConsentDto) {
    const existing = await this.prisma.consent.findUnique({
      where: { tenantId_userId: { tenantId: dto.tenantId, userId } },
    });

    if (existing) {
      return this.prisma.consent.update({
        where: { id: existing.id },
        data: {
          status: 'active',
          version: existing.version + 1,
          scopes: {
            deleteMany: {},
            create: dto.scopes.map((scope) => ({ scope })),
          },
        },
        include: { scopes: true },
      });
    }

    return this.prisma.consent.create({
      data: {
        tenantId: dto.tenantId,
        userId,
        scopes: {
          create: dto.scopes.map((scope) => ({ scope })),
        },
      },
      include: { scopes: true },
    });
  }

  async revokeConsent(userId: string, tenantId: string) {
    const consent = await this.prisma.consent.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });
    if (!consent) throw new NotFoundException('Consent not found');

    return this.prisma.consent.update({
      where: { id: consent.id },
      data: { status: 'revoked', revokedAt: new Date() },
    });
  }

  async deactivate(userId: string, dto?: DeactivateProfileDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.status === 'deactivated') {
      throw new BadRequestException('Profile is already deactivated');
    }
    if (user.status === 'deleted') {
      throw new BadRequestException('Profile has been deleted');
    }

    const now = new Date();
    const scheduledDeletionAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          status: 'deactivated',
          deactivatedAt: now,
          scheduledDeletionAt,
        },
      });

      await tx.refreshToken.updateMany({
        where: { userId, revoked: false },
        data: { revoked: true },
      });
    });

    await this.eventBus.publish({
      type: 'user.deactivated',
      aggregateId: userId,
      data: { reason: dto?.reason || null, scheduledDeletionAt },
    });

    this.logger.log(`User ${userId} deactivated. Scheduled permanent deletion: ${scheduledDeletionAt.toISOString()}`);

    return {
      message: 'Profile deactivated successfully. It will be permanently deleted in 30 days. Log in to reactivate.',
      deactivatedAt: now,
      scheduledDeletionAt,
    };
  }

  async reactivate(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.status !== 'deactivated') {
      throw new BadRequestException('Profile is not deactivated');
    }
    if (user.scheduledDeletionAt && user.scheduledDeletionAt < new Date()) {
      throw new BadRequestException('Deactivation period has expired. Profile has been permanently deleted.');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        status: 'active',
        deactivatedAt: null,
        scheduledDeletionAt: null,
      },
    });

    await this.eventBus.publish({
      type: 'user.reactivated',
      aggregateId: userId,
      data: {},
    });

    this.logger.log(`User ${userId} reactivated`);

    return { message: 'Profile reactivated successfully. Welcome back!' };
  }

  async permanentDelete(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const memberships = await this.prisma.tenantUser.findMany({
      where: { userId, role: 'owner' },
      include: { tenant: { select: { id: true, name: true } } },
    });

    if (memberships.length > 0) {
      const ownerTenants = memberships.map((m) => m.tenant.name).join(', ');
      throw new ForbiddenException(
        `Cannot delete profile: you are the owner of: ${ownerTenants}. Transfer ownership or delete the tenants first.`,
      );
    }

    await this.prisma.user.delete({ where: { id: userId } });

    await this.eventBus.publish({
      type: 'user.permanently_deleted',
      aggregateId: userId,
      data: {},
    });

    this.logger.log(`User ${userId} permanently deleted`);

    return { message: 'Profile permanently deleted.' };
  }

  async getDeactivationStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        status: true,
        deactivatedAt: true,
        scheduledDeletionAt: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const daysRemaining = user.scheduledDeletionAt
      ? Math.max(0, Math.ceil((user.scheduledDeletionAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      : null;

    return {
      status: user.status,
      deactivatedAt: user.deactivatedAt,
      scheduledDeletionAt: user.scheduledDeletionAt,
      daysRemaining,
    };
  }

  async cleanupDeactivatedAccounts() {
    const expired = await this.prisma.user.findMany({
      where: {
        status: 'deactivated',
        scheduledDeletionAt: { lte: new Date() },
      },
      select: { id: true, email: true, scheduledDeletionAt: true },
    });

    this.logger.log(`Found ${expired.length} accounts past scheduled deletion`);

    for (const user of expired) {
      try {
        const memberships = await this.prisma.tenantUser.findMany({
          where: { userId: user.id, role: 'owner' },
        });

        if (memberships.length > 0) {
          this.logger.warn(`Skipping deletion of user ${user.id}: still owns ${memberships.length} tenant(s)`);
          continue;
        }

        await this.prisma.user.delete({ where: { id: user.id } });

        await this.eventBus.publish({
          type: 'user.auto_deleted_after_30_days',
          aggregateId: user.id,
          data: { email: user.email },
        });

        this.logger.log(`Auto-deleted user ${user.id} (${user.email}) after deactivation period`);
      } catch (err) {
        this.logger.error(`Failed to auto-delete user ${user.id}: ${(err as Error).message}`);
      }
    }

    return { deleted: expired.length };
  }
}
