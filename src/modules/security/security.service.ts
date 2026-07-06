import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class SecurityService {
  private readonly logger = new Logger(SecurityService.name);

  constructor(private prisma: PrismaService) {}

  // ─── Security Policies ───────────────────────────────────────

  async getPolicy(tenantId: string) {
    let policy = await this.prisma.securityPolicy.findUnique({ where: { tenantId } });
    if (!policy) {
      policy = await this.prisma.securityPolicy.create({ data: { tenantId } as any });
    }
    return policy;
  }

  async updatePolicy(tenantId: string, data: Partial<{
    passwordMinLength: number; passwordRequireUpper: boolean;
    passwordRequireLower: boolean; passwordRequireNumber: boolean;
    passwordRequireSymbol: boolean; passwordHistoryCount: number;
    passwordExpiryDays: number; sessionTimeoutMin: number;
    maxLoginAttempts: number; lockoutDurationMin: number;
    mfaRequired: boolean; mfaMethods: string[];
    ipWhitelist: string[]; ipBlacklist: string[]; allowedDomains: string[];
    blockTor: boolean; maxSessionsPerUser: number;
    dataRetentionDays: number; auditRetentionDays: number;
    updatedBy: string;
  }>) {
    return this.prisma.securityPolicy.upsert({
      where: { tenantId },
      create: { tenantId, ...data } as any,
      update: data as any,
    });
  }

  async validatePasswordStrength(password: string, tenantId: string): Promise<{ valid: boolean; errors: string[] }> {
    const policy = await this.getPolicy(tenantId);
    const errors: string[] = [];

    if (password.length < policy.passwordMinLength) {
      errors.push(`Password must be at least ${policy.passwordMinLength} characters`);
    }
    if (policy.passwordRequireUpper && !/[A-Z]/.test(password)) {
      errors.push('Password must contain an uppercase letter');
    }
    if (policy.passwordRequireLower && !/[a-z]/.test(password)) {
      errors.push('Password must contain a lowercase letter');
    }
    if (policy.passwordRequireNumber && !/\d/.test(password)) {
      errors.push('Password must contain a number');
    }
    if (policy.passwordRequireSymbol && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('Password must contain a symbol');
    }

    return { valid: errors.length === 0, errors };
  }

  // ─── API Keys ────────────────────────────────────────────────

  async createApiKey(data: {
    tenantId?: string; userId?: string; name: string;
    scopes?: string[]; expiresAt?: string;
  }) {
    const rawKey = `duka_${crypto.randomBytes(32).toString('hex')}`;
    const keyPrefix = rawKey.substring(0, 12);
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    await this.prisma.apiKey.create({
      data: {
        ...data,
        keyPrefix,
        keyHash,
        scopes: data.scopes || ['*'],
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
      } as any,
    });

    return { rawKey, keyPrefix, message: 'Save this key - it will not be shown again' };
  }

  async validateApiKey(rawKey: string): Promise<{ valid: boolean; apiKey?: any }> {
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const apiKey = await this.prisma.apiKey.findFirst({
      where: { keyHash, isActive: true },
    });

    if (!apiKey) return { valid: false };
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) return { valid: false };

    await this.prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    });

    return { valid: true, apiKey };
  }

  async getApiKeys(tenantId?: string, userId?: string) {
    const where: any = {};
    if (tenantId) where.tenantId = tenantId;
    if (userId) where.userId = userId;

    return this.prisma.apiKey.findMany({
      where,
      select: {
        id: true, name: true, keyPrefix: true, scopes: true,
        expiresAt: true, lastUsedAt: true, isActive: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeApiKey(id: string) {
    return this.prisma.apiKey.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // ─── Security Events ─────────────────────────────────────────

  async recordEvent(data: {
    tenantId?: string; userId?: string; type: string;
    severity?: string; source?: string; ipAddress?: string;
    userAgent?: string; location?: string; details?: Record<string, any>;
    metadata?: Record<string, any>;
  }) {
    return this.prisma.securityEvent.create({ data: data as any });
  }

  async getSecurityEvents(tenantId?: string, filters: {
    type?: string; severity?: string; userId?: string;
    from?: string; to?: string; page?: number; limit?: number;
  } = {}) {
    const where: any = {};
    if (tenantId) where.tenantId = tenantId;
    if (filters.type) where.type = filters.type;
    if (filters.severity) where.severity = filters.severity;
    if (filters.userId) where.userId = filters.userId;
    if (filters.from || filters.to) {
      where.timestamp = {};
      if (filters.from) where.timestamp.gte = new Date(filters.from);
      if (filters.to) where.timestamp.lte = new Date(filters.to);
    }

    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 50, 500);

    const [data, total] = await Promise.all([
      this.prisma.securityEvent.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.securityEvent.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getSecuritySummary(tenantId?: string) {
    const where: any = {};
    if (tenantId) where.tenantId = tenantId;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [totalEvents, events24h, criticalEvents, loginAttempts] = await Promise.all([
      this.prisma.securityEvent.count({ where }),
      this.prisma.securityEvent.count({ where: { ...where, timestamp: { gte: since } } }),
      this.prisma.securityEvent.count({ where: { ...where, severity: 'critical', timestamp: { gte: since } } }),
      this.prisma.securityEvent.count({ where: { ...where, type: { in: ['login_failed', 'login_success', 'logout'] } } }),
    ]);

    return {
      totalEvents,
      eventsLast24h: events24h,
      criticalEvents24h: criticalEvents,
      loginAttempts24h: loginAttempts,
    };
  }

  // ─── IP Validation ───────────────────────────────────────────

  async isIpAllowed(tenantId: string, ip: string): Promise<boolean> {
    const policy = await this.getPolicy(tenantId);
    if (policy.ipBlacklist.includes(ip)) return false;
    if (policy.ipWhitelist.length > 0 && !policy.ipWhitelist.includes(ip)) return false;
    return true;
  }

  // ─── Consent Audits ──────────────────────────────────────────

  async recordConsent(data: {
    tenantId?: string; userId: string; action: string;
    consentType: string; granted: boolean; ipAddress?: string; userAgent?: string;
  }) {
    return this.prisma.consentAudit.create({ data: data as any });
  }

  async getConsentHistory(userId: string) {
    return this.prisma.consentAudit.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
