import { Injectable, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { ActiveReleaseService } from '../../shared/releases/active-release.service';
import { consentPolicy } from './policy';
@Injectable()
export class DataConsentService {
  constructor(private prisma: PrismaService, private releases: ActiveReleaseService) {}
  async list(userId: string) {
    const records = await this.prisma.consent.findMany({
      where: { userId, scopes: { some: { scope: { startsWith: 'data-policy:' } } } },
      select: { tenantId: true, status: true, grantedAt: true, revokedAt: true, scopes: { select: { scope: true } }, tenant: { select: { name: true, slug: true } } },
      orderBy: { grantedAt: 'desc' },
    });
    return records.map(record => ({ merchantId: record.tenantId, merchantName: record.tenant.name, slug: record.tenant.slug, status: record.status, grantedAt: record.grantedAt, revokedAt: record.revokedAt, fields: record.status === 'active' ? record.scopes.filter(item => item.scope.startsWith('data:')).map(item => item.scope.slice(5)) : [] }));
  }
  async revoke(userId: string, merchantId: string) {
    // Revocation must work even when the app is unpublished or its policy changed.
    await this.prisma.$transaction(async tx => {
      const record = await tx.consent.findUnique({ where: { tenantId_userId: { tenantId: merchantId, userId } }, include: { scopes: true } });
      if (!record) return;
      await tx.consent.update({ where: { id: record.id }, data: { status: 'revoked', revokedAt: new Date(), version: { increment: 1 }, scopes: { deleteMany: { scope: { startsWith: 'data:' } } } } });
      await tx.consentAudit.create({ data: { tenantId: merchantId, userId, action: 'revoke', consentType: record.scopes.find(item => item.scope.startsWith('data-policy:'))?.scope || 'app-data', granted: false } });
    });
    return { merchantId, decision: 'declined' };
  }
  async request(merchantId: string) {
    const release = await this.releases.getActiveRelease(merchantId);
    let policy: ReturnType<typeof consentPolicy>;
    try { policy = consentPolicy(release.release.manifest?.dataRequest); }
    catch { throw new BadRequestException('Invalid published data request'); }
    return { merchantId: release.tenantId, appName: release.release.manifest?.identity?.displayName || release.slug, policy };
  }
  async status(userId: string, merchantId: string) {
    const request = await this.request(merchantId);
    if (!request.policy) return { ...request, decision: 'not_required' };
    const record = await this.prisma.consent.findUnique({ where: { tenantId_userId: { tenantId: request.merchantId, userId } }, include: { scopes: true } });
    const current = record?.scopes.some(s => s.scope === 'data-policy:' + request.policy!.policyId);
    return { ...request, decision: current ? record!.status === 'active' ? 'granted' : 'declined' : 'unanswered' };
  }
  async decide(userId: string, merchantId: string, policyId: string, granted: boolean) {
    const request = await this.request(merchantId);
    if (!request.policy || request.policy.policyId !== policyId) throw new ConflictException('Data request changed. Review the current request.');
    const scopes = [{ scope: 'data-policy:' + policyId }, ...(granted ? request.policy.fields.map(field => ({ scope: 'data:' + field })) : [])];
    await this.prisma.$transaction(async tx => {
      await tx.consent.upsert({
        where: { tenantId_userId: { tenantId: request.merchantId, userId } },
        create: { tenantId: request.merchantId, userId, status: granted ? 'active' : 'revoked', revokedAt: granted ? null : new Date(), scopes: { create: scopes } },
        update: { status: granted ? 'active' : 'revoked', grantedAt: granted ? new Date() : undefined, revokedAt: granted ? null : new Date(), version: { increment: 1 }, scopes: { deleteMany: {}, create: scopes } },
      });
      await tx.consentAudit.create({ data: { tenantId: request.merchantId, userId, action: granted ? 'grant' : 'decline', consentType: 'data-policy:' + policyId, granted } });
    });
    return { ...request, decision: granted ? 'granted' : 'declined' };
  }
  async requireFor(userId: string, merchantId: string, action: string) {
    const request = await this.request(merchantId);
    if (!request.policy?.requiredFor.includes(action)) return { ...request, decision: 'not_required' };
    if (!userId) throw new ForbiddenException({ code: 'DATA_CONSENT_REQUIRED', message: 'Sign in and review this app data request' });
    const status = await this.status(userId, merchantId);
    if (status.policy?.requiredFor.includes(action) && status.decision !== 'granted') throw new ForbiddenException({ code: 'DATA_CONSENT_REQUIRED', message: 'Review this app data request before continuing', merchantId: status.merchantId });
    return status;
  }
  async sharedProfile(userId: string, merchantId: string) {
    const status = await this.status(userId, merchantId);
    if (status.decision !== 'granted' || !status.policy) throw new ForbiddenException('Data sharing has not been granted for this app');
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { firstName: true, lastName: true, email: true, phoneNumber: true, profile: { select: { avatarUrl: true } } } });
    const values: Record<string, unknown> = { name: [user.firstName, user.lastName].filter(Boolean).join(' '), email: user.email, phone: user.phoneNumber, avatar: user.profile?.avatarUrl ?? null };
    return Object.fromEntries(status.policy.fields.map(field => [field, values[field]]));
  }
}
