import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { GrantConsentDto } from './dto/grant-consent.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

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

    const profile = await this.prisma.profile.upsert({
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
}
