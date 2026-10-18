import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class PlatformAdminService {
  private static readonly POLICY_STATUSES = ['draft', 'in_review', 'published', 'archived'];
  private static readonly TICKET_STATUSES = ['open', 'in_progress', 'escalated', 'resolved', 'closed'];
  private static readonly TICKET_PRIORITIES = ['low', 'normal', 'high', 'urgent'];

  constructor(private prisma: PrismaService) {}

  // ─── Platform Settings ───────────────────────────────────────

  async getSetting(key: string) {
    const setting = await this.prisma.platformSetting.findUnique({ where: { key } });
    if (!setting) throw new NotFoundException(`Setting ${key} not found`);
    return setting;
  }

  async setSetting(key: string, data: {
    value: any; type?: string; category?: string; description?: string; isEncrypted?: boolean;
  }) {
    return this.prisma.platformSetting.upsert({
      where: { key },
      create: { key, ...data },
      update: { ...data },
    });
  }

  async getAllSettings(category?: string) {
    const where: any = {};
    if (category) where.category = category;
    return this.prisma.platformSetting.findMany({ where, orderBy: { key: 'asc' } });
  }

  async getPolicies(page = 1, limit = 20, filters: { status?: string; category?: string; search?: string } = {}) {
    const safePage = Math.max(1, Math.floor(Number(page) || 1));
    const safeLimit = Math.min(100, Math.max(1, Math.floor(Number(limit) || 20)));
    const where: Prisma.PlatformPolicyWhereInput = {};
    const status = filters.status?.toLowerCase();
    if (status && PlatformAdminService.POLICY_STATUSES.includes(status)) where.status = status;
    if (filters.category?.trim()) where.category = filters.category.trim();
    if (filters.search?.trim()) {
      const search = filters.search.trim();
      where.OR = [
        { key: { contains: search, mode: 'insensitive' } },
        { title: { contains: search, mode: 'insensitive' } },
        { body: { contains: search, mode: 'insensitive' } },
      ];
    }
    const [data, total] = await Promise.all([
      this.prisma.platformPolicy.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }],
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
      this.prisma.platformPolicy.count({ where }),
    ]);
    return { data, total, page: safePage, limit: safeLimit, totalPages: Math.ceil(total / safeLimit) };
  }

  private async getPolicyOrThrow(id: string) {
    const policy = await this.prisma.platformPolicy.findUnique({ where: { id } });
    if (!policy) throw new NotFoundException('Policy not found');
    return policy;
  }

  async createPolicy(actorId: string, data: {
    key: string; title: string; body: string; category?: string; effectiveAt?: string;
  }) {
    if (!data?.key?.trim() || !data?.title?.trim() || !data?.body?.trim()) {
      throw new BadRequestException('key, title, and body are required');
    }
    const key = data.key.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[-._]+|[-._]+$/g, '');
    if (!key) throw new BadRequestException('key must contain at least one alphanumeric character');
    const existing = await this.prisma.platformPolicy.findUnique({ where: { key } });
    if (existing) throw new BadRequestException(`A policy with key "${key}" already exists`);
    return this.prisma.$transaction(async (tx) => {
      const policy = await tx.platformPolicy.create({
        data: {
          key,
          title: data.title.trim(),
          body: data.body,
          category: data.category?.trim() || 'general',
          effectiveAt: data.effectiveAt ? new Date(data.effectiveAt) : undefined,
          createdBy: actorId,
        },
      });
      await tx.auditLog.create({
        data: { userId: actorId, action: 'policy.create', entity: 'platform_policy', entityId: policy.id, metadata: { outcome: 'success', key } },
      });
      return policy;
    });
  }

  async updatePolicy(id: string, actorId: string, data: Partial<{
    title: string; body: string; category: string; effectiveAt: string;
  }>) {
    const policy = await this.getPolicyOrThrow(id);
    if (policy.status === 'published' || policy.status === 'archived') {
      throw new BadRequestException('Published or archived policies cannot be edited — archive or create a new version first');
    }
    const update: Prisma.PlatformPolicyUpdateInput = { version: { increment: 1 } };
    if (data.title !== undefined) {
      if (!data.title.trim()) throw new BadRequestException('title cannot be empty');
      update.title = data.title.trim();
    }
    if (data.body !== undefined) {
      if (!data.body.trim()) throw new BadRequestException('body cannot be empty');
      update.body = data.body;
    }
    if (data.category !== undefined) update.category = data.category.trim() || 'general';
    if (data.effectiveAt !== undefined) {
      const effectiveAt = new Date(data.effectiveAt);
      if (Number.isNaN(effectiveAt.getTime())) throw new BadRequestException('Invalid effectiveAt date');
      update.effectiveAt = effectiveAt;
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.platformPolicy.update({ where: { id }, data: update });
      await tx.auditLog.create({
        data: { userId: actorId, action: 'policy.update', entity: 'platform_policy', entityId: id, metadata: { outcome: 'success', version: updated.version } },
      });
      return updated;
    });
  }

  async submitPolicy(id: string, actorId: string) {
    const policy = await this.getPolicyOrThrow(id);
    if (policy.status !== 'draft') throw new BadRequestException('Only a draft policy can be submitted for review');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.platformPolicy.update({ where: { id }, data: { status: 'in_review' } });
      await tx.auditLog.create({
        data: { userId: actorId, action: 'policy.submit', entity: 'platform_policy', entityId: id, metadata: { outcome: 'success' } },
      });
      return updated;
    });
  }

  async publishPolicy(id: string, actorId: string) {
    const policy = await this.getPolicyOrThrow(id);
    if (policy.status !== 'in_review') throw new BadRequestException('Only a policy in review can be published');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.platformPolicy.update({
        where: { id },
        data: { status: 'published', publishedAt: new Date(), publishedBy: actorId },
      });
      await tx.auditLog.create({
        data: { userId: actorId, action: 'policy.publish', entity: 'platform_policy', entityId: id, metadata: { outcome: 'success', version: updated.version } },
      });
      return updated;
    });
  }

  async archivePolicy(id: string, actorId: string) {
    const policy = await this.getPolicyOrThrow(id);
    if (policy.status !== 'published') throw new BadRequestException('Only a published policy can be archived');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.platformPolicy.update({ where: { id }, data: { status: 'archived' } });
      await tx.auditLog.create({
        data: { userId: actorId, action: 'policy.archive', entity: 'platform_policy', entityId: id, metadata: { outcome: 'success' } },
      });
      return updated;
    });
  }

  // ─── Support tickets ─────────────────────────────────────────

  async listSupportTickets(page = 1, limit = 20, filters: {
    status?: string; priority?: string; assigneeId?: string; search?: string;
  } = {}) {
    const safePage = Math.max(1, Math.floor(Number(page) || 1));
    const safeLimit = Math.min(100, Math.max(1, Math.floor(Number(limit) || 20)));
    const where: Prisma.SupportTicketWhereInput = {};
    const status = filters.status?.toLowerCase();
    if (status && PlatformAdminService.TICKET_STATUSES.includes(status)) where.status = status;
    const priority = filters.priority?.toLowerCase();
    if (priority && PlatformAdminService.TICKET_PRIORITIES.includes(priority)) where.priority = priority;
    if (filters.assigneeId?.trim()) where.assigneeId = filters.assigneeId.trim();
    if (filters.search?.trim()) {
      const search = filters.search.trim();
      where.OR = [
        { subject: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }
    const [data, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
      this.prisma.supportTicket.count({ where }),
    ]);
    return { data, total, page: safePage, limit: safeLimit, totalPages: Math.ceil(total / safeLimit) };
  }

  async getSupportTicket(id: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
      include: { events: { orderBy: { createdAt: 'asc' } } },
    });
    if (!ticket) throw new NotFoundException('Support ticket not found');
    return ticket;
  }

  private async getTicketOrThrow(id: string) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException('Support ticket not found');
    return ticket;
  }

  async createSupportTicket(actorId: string, data: {
    subject: string; description: string; priority?: string; category?: string;
    tenantId?: string; reportedBy?: string; assigneeId?: string;
  }) {
    if (!data?.subject?.trim() || !data?.description?.trim()) {
      throw new BadRequestException('subject and description are required');
    }
    const priority = (data.priority || 'normal').toLowerCase();
    if (!PlatformAdminService.TICKET_PRIORITIES.includes(priority)) {
      throw new BadRequestException('Invalid ticket priority');
    }
    const assigneeId = data.assigneeId?.trim() || undefined;
    return this.prisma.$transaction(async (tx) => {
      const ticket = await tx.supportTicket.create({
        data: {
          subject: data.subject.trim(),
          description: data.description.trim(),
          priority,
          category: data.category?.trim() || 'general',
          tenantId: data.tenantId?.trim() || undefined,
          reportedBy: data.reportedBy?.trim() || undefined,
          assigneeId,
          status: assigneeId ? 'in_progress' : 'open',
          createdBy: actorId,
        },
      });
      await tx.supportTicketEvent.create({
        data: { ticketId: ticket.id, type: 'created', actorId, message: 'Ticket created' },
      });
      await tx.auditLog.create({
        data: { userId: actorId, tenantId: ticket.tenantId, action: 'support.ticket_create', entity: 'support_ticket', entityId: ticket.id, metadata: { outcome: 'success', priority } },
      });
      return ticket;
    });
  }

  async assignSupportTicket(id: string, actorId: string, assigneeId: string) {
    const ticket = await this.getTicketOrThrow(id);
    if (!assigneeId?.trim()) throw new BadRequestException('assigneeId is required');
    const assignee = assigneeId.trim();
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.supportTicket.update({
        where: { id },
        data: { assigneeId: assignee, status: ticket.status === 'open' ? 'in_progress' : ticket.status },
      });
      await tx.supportTicketEvent.create({
        data: { ticketId: id, type: 'assigned', actorId, metadata: { assigneeId: assignee } },
      });
      await tx.auditLog.create({
        data: { userId: actorId, tenantId: ticket.tenantId, action: 'support.ticket_assign', entity: 'support_ticket', entityId: id, metadata: { outcome: 'success', assigneeId: assignee } },
      });
      return updated;
    });
  }

  async escalateSupportTicket(id: string, actorId: string, note?: string) {
    const ticket = await this.getTicketOrThrow(id);
    if (ticket.status === 'resolved' || ticket.status === 'closed') {
      throw new BadRequestException('A resolved or closed ticket cannot be escalated');
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.supportTicket.update({
        where: { id },
        data: { status: 'escalated', escalatedAt: new Date() },
      });
      await tx.supportTicketEvent.create({
        data: { ticketId: id, type: 'escalated', actorId, message: note?.trim() || undefined },
      });
      await tx.auditLog.create({
        data: { userId: actorId, tenantId: ticket.tenantId, action: 'support.ticket_escalate', entity: 'support_ticket', entityId: id, metadata: { outcome: 'success' } },
      });
      return updated;
    });
  }

  async resolveSupportTicket(id: string, actorId: string, resolution: string) {
    const ticket = await this.getTicketOrThrow(id);
    if (!resolution?.trim()) throw new BadRequestException('A resolution is required');
    const trimmed = resolution.trim();
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.supportTicket.update({
        where: { id },
        data: { status: 'resolved', resolvedAt: new Date(), resolution: trimmed },
      });
      await tx.supportTicketEvent.create({
        data: { ticketId: id, type: 'resolved', actorId, message: trimmed },
      });
      await tx.auditLog.create({
        data: { userId: actorId, tenantId: ticket.tenantId, action: 'support.ticket_resolve', entity: 'support_ticket', entityId: id, metadata: { outcome: 'success' } },
      });
      return updated;
    });
  }

  async commentSupportTicket(id: string, actorId: string, message: string) {
    await this.getTicketOrThrow(id);
    if (!message?.trim()) throw new BadRequestException('A comment is required');
    return this.prisma.supportTicketEvent.create({
      data: { ticketId: id, type: 'comment', actorId, message: message.trim() },
    });
  }

  async deleteSetting(key: string) {
    return this.prisma.platformSetting.delete({ where: { key } });
  }

  // ─── System Announcements ────────────────────────────────────

  async createAnnouncement(data: {
    title: string; body: string; type?: string; priority?: string;
    audiences?: string[]; startsAt?: string; expiresAt?: string; createdBy?: string;
  }) {
    return this.prisma.systemAnnouncement.create({
      data: {
        ...data,
        startsAt: data.startsAt ? new Date(data.startsAt) : undefined,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
      } as any,
    });
  }

  async getActiveAnnouncements(type?: string) {
    const now = new Date();

    const allActive = await this.prisma.systemAnnouncement.findMany({
      where: { isActive: true },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    return allActive.filter((a) => {
      if (type && a.type !== type) return false;
      if (a.startsAt && a.startsAt > now) return false;
      if (a.expiresAt && a.expiresAt < now) return false;
      return true;
    });
  }

  async getAllAnnouncements(page = 1, limit = 20) {
    const [data, total] = await Promise.all([
      this.prisma.systemAnnouncement.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.systemAnnouncement.count(),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async updateAnnouncement(id: string, data: any) {
    return this.prisma.systemAnnouncement.update({ where: { id }, data });
  }

  async deleteAnnouncement(id: string) {
    return this.prisma.systemAnnouncement.delete({ where: { id } });
  }

  // ─── Feature Flags ───────────────────────────────────────────

  async createFeatureFlag(data: {
    key: string; name: string; description?: string;
    enabled?: boolean; rules?: Record<string, any>; tenants?: string[];
  }) {
    return this.prisma.featureFlag.create({ data: data as any });
  }

  async getAllFeatureFlags() {
    return this.prisma.featureFlag.findMany({ orderBy: { key: 'asc' } });
  }

  async getFeatureFlag(key: string) {
    const flag = await this.prisma.featureFlag.findUnique({ where: { key } });
    if (!flag) throw new NotFoundException(`Feature flag ${key} not found`);
    return flag;
  }

  async isEnabled(key: string, tenantId?: string): Promise<boolean> {
    const flag = await this.prisma.featureFlag.findUnique({ where: { key } });
    if (!flag || !flag.enabled) return false;
    if (tenantId && flag.tenants.length > 0) {
      return flag.tenants.includes(tenantId);
    }
    return true;
  }

  async updateFeatureFlag(key: string, data: Partial<{
    name: string; description: string; enabled: boolean;
    rules: Record<string, any>; tenants: string[];
  }>) {
    return this.prisma.featureFlag.update({ where: { key }, data: data as any });
  }

  async deleteFeatureFlag(key: string) {
    return this.prisma.featureFlag.delete({ where: { key } });
  }

  // ─── Plan Management ─────────────────────────────────────────

  async createPlan(data: {
    name: string; slug: string; price: number; currency?: string;
    features?: Record<string, any>; limits?: Record<string, any>; isActive?: boolean;
  }) {
    return this.prisma.plan.create({ data: data as any });
  }

  async getAllPlans() {
    return this.prisma.plan.findMany({ orderBy: { price: 'asc' } });
  }

  async getPlan(id: string) {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Plan not found');
    return plan;
  }

  async updatePlan(id: string, data: Partial<{
    name: string; price: number; currency: string;
    features: Record<string, any>; limits: Record<string, any>; isActive: boolean;
  }>) {
    return this.prisma.plan.update({ where: { id }, data: data as any });
  }

  async deletePlan(id: string) {
    return this.prisma.plan.delete({ where: { id } });
  }

  // ─── API Quotas ──────────────────────────────────────────────

  async getApiQuota(tenantId: string) {
    let quota = await this.prisma.apiQuota.findUnique({ where: { tenantId } });
    if (!quota) {
      quota = await this.prisma.apiQuota.create({
        data: { tenantId } as any,
      });
    }
    return quota;
  }

  async updateApiQuota(tenantId: string, data: Partial<{
    requestsPerMin: number; requestsPerHour: number; requestsPerDay: number;
    burstLimit: number; concurrentLimit: number;
  }>) {
    return this.prisma.apiQuota.upsert({
      where: { tenantId },
      create: { tenantId, ...data } as any,
      update: data as any,
    });
  }

  async checkQuota(tenantId: string): Promise<{ allowed: boolean; remaining: { min: number; hour: number; day: number } }> {
    const quota = await this.getApiQuota(tenantId);
    const now = new Date();

    if (quota.resetMinAt && now > quota.resetMinAt) {
      quota.currentMin = 0;
    }
    if (quota.resetHourAt && now > quota.resetHourAt) {
      quota.currentHour = 0;
    }
    if (quota.resetDayAt && now > quota.resetDayAt) {
      quota.currentDay = 0;
    }

    const allowed = quota.currentMin < quota.requestsPerMin &&
                    quota.currentHour < quota.requestsPerHour &&
                    quota.currentDay < quota.requestsPerDay;

    return {
      allowed,
      remaining: {
        min: Math.max(0, quota.requestsPerMin - quota.currentMin),
        hour: Math.max(0, quota.requestsPerHour - quota.currentHour),
        day: Math.max(0, quota.requestsPerDay - quota.currentDay),
      },
    };
  }

  async incrementQuota(tenantId: string) {
    const quota = await this.getApiQuota(tenantId);
    const now = new Date();
    const minLater = new Date(now.getTime() + 60000);
    const hourLater = new Date(now.getTime() + 3600000);
    const dayLater = new Date(now.getTime() + 86400000);

    return this.prisma.apiQuota.update({
      where: { tenantId },
      data: {
        currentMin: { increment: 1 },
        currentHour: { increment: 1 },
        currentDay: { increment: 1 },
        resetMinAt: quota.resetMinAt || minLater,
        resetHourAt: quota.resetHourAt || hourLater,
        resetDayAt: quota.resetDayAt || dayLater,
      },
    });
  }

  // ─── Subscriptions ───────────────────────────────────────────

  async getAllSubscriptions(
    page = 1,
    limit = 20,
    filters: { status?: string; plan?: string; search?: string; sort?: string; order?: string } = {},
  ) {
    const safePage = Math.max(1, Math.floor(Number(page) || 1));
    const safeLimit = Math.min(100, Math.max(1, Math.floor(Number(limit) || 20)));
    const where: Prisma.SubscriptionWhereInput = {};
    const allowedStatuses = ['active', 'past_due', 'canceled', 'trialing', 'paused', 'incomplete'];
    const status = filters.status?.toLowerCase();
    if (status && allowedStatuses.includes(status)) where.status = status;
    if (filters.plan?.trim()) where.plan = { slug: filters.plan.trim() };
    if (filters.search?.trim()) {
      const search = filters.search.trim();
      where.OR = [
        { tenant: { name: { contains: search, mode: 'insensitive' } } },
        { tenant: { email: { contains: search, mode: 'insensitive' } } },
        { plan: { name: { contains: search, mode: 'insensitive' } } },
        { plan: { slug: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const order: Prisma.SortOrder = filters.order === 'asc' ? 'asc' : 'desc';
    const orderBy: Record<string, Prisma.SubscriptionOrderByWithRelationInput> = {
      createdAt: { createdAt: order },
      status: { status: order },
      currentPeriodEnd: { endDate: order },
      merchantName: { tenant: { name: order } },
      planName: { plan: { name: order } },
      amount: { plan: { price: order } },
    };
    const selectedOrder = orderBy[filters.sort || 'createdAt'] ?? orderBy.createdAt;
    const [data, total] = await Promise.all([
      this.prisma.subscription.findMany({
        where,
        include: { tenant: true, plan: true },
        orderBy: selectedOrder,
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
      this.prisma.subscription.count({ where }),
    ]);

    return { data, total, page: safePage, limit: safeLimit, totalPages: Math.ceil(total / safeLimit) };
  }

  async updateSubscription(id: string, data: Partial<{
    planId: string; status: string; endDate: string; autoRenew: boolean;
  }>) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new BadRequestException('Subscription update body must be an object');
    }
    const update: Prisma.SubscriptionUncheckedUpdateInput = {};
    if (data.planId !== undefined) {
      if (typeof data.planId !== 'string' || !data.planId.trim()) {
        throw new BadRequestException('planId must be a non-empty string');
      }
      update.planId = data.planId;
    }
    if (data.status !== undefined) {
      if (typeof data.status !== 'string') throw new BadRequestException('Invalid subscription status');
      const allowedStatuses = ['active', 'past_due', 'canceled', 'trialing', 'paused', 'incomplete'];
      const status = data.status.toLowerCase();
      if (!allowedStatuses.includes(status)) throw new BadRequestException('Invalid subscription status');
      update.status = status;
    }
    if (data.endDate !== undefined) {
      if (typeof data.endDate !== 'string') throw new BadRequestException('Invalid subscription endDate');
      const endDate = new Date(data.endDate);
      if (Number.isNaN(endDate.getTime())) throw new BadRequestException('Invalid subscription endDate');
      update.endDate = endDate;
    }
    if (data.autoRenew !== undefined) {
      if (typeof data.autoRenew !== 'boolean') throw new BadRequestException('autoRenew must be a boolean');
      update.autoRenew = data.autoRenew;
    }
    if (Object.keys(update).length === 0) throw new BadRequestException('No supported subscription fields provided');

    return this.prisma.subscription.update({
      where: { id },
      data: update,
    });
  }

  // ─── Operational Reports & Exports ───────────────────────────

  private static readonly REPORT_KEYS = ['subscriptions', 'support-tickets', 'policies'];
  private static readonly EXPORT_ROW_CAP = 5000;

  private static readonly REPORT_COLUMNS: Record<string, { header: string; get: (row: any) => unknown }[]> = {
    subscriptions: [
      { header: 'Subscription ID', get: (r) => r.id },
      { header: 'Merchant', get: (r) => r.tenant?.name ?? '' },
      { header: 'Plan', get: (r) => r.plan?.name ?? r.plan?.slug ?? '' },
      { header: 'Status', get: (r) => r.status },
      { header: 'Amount', get: (r) => r.plan?.price ?? '' },
      { header: 'Currency', get: (r) => r.plan?.currency ?? r.currency ?? '' },
      { header: 'Auto Renew', get: (r) => (r.autoRenew ? 'yes' : 'no') },
      { header: 'Period End', get: (r) => (r.endDate ? new Date(r.endDate).toISOString() : '') },
      { header: 'Started', get: (r) => (r.createdAt ? new Date(r.createdAt).toISOString() : '') },
    ],
    'support-tickets': [
      { header: 'Ticket ID', get: (r) => r.id },
      { header: 'Subject', get: (r) => r.subject },
      { header: 'Status', get: (r) => r.status },
      { header: 'Priority', get: (r) => r.priority },
      { header: 'Category', get: (r) => r.category },
      { header: 'Assignee', get: (r) => r.assigneeId ?? '' },
      { header: 'Merchant', get: (r) => r.tenantId ?? '' },
      { header: 'Opened', get: (r) => (r.createdAt ? new Date(r.createdAt).toISOString() : '') },
      { header: 'Resolved', get: (r) => (r.resolvedAt ? new Date(r.resolvedAt).toISOString() : '') },
    ],
    policies: [
      { header: 'Key', get: (r) => r.key },
      { header: 'Title', get: (r) => r.title },
      { header: 'Status', get: (r) => r.status },
      { header: 'Version', get: (r) => r.version },
      { header: 'Category', get: (r) => r.category },
      { header: 'Effective', get: (r) => (r.effectiveAt ? new Date(r.effectiveAt).toISOString() : '') },
      { header: 'Published', get: (r) => (r.publishedAt ? new Date(r.publishedAt).toISOString() : '') },
      { header: 'Updated', get: (r) => (r.updatedAt ? new Date(r.updatedAt).toISOString() : '') },
    ],
  };

  async exportReport(report: string, filters: Record<string, any> = {}, actorId?: string) {
    const key = String(report || '').toLowerCase();
    if (!PlatformAdminService.REPORT_KEYS.includes(key)) {
      throw new BadRequestException('Unsupported report');
    }
    const rows = await this.collectReportRows(key, filters);
    const columns = PlatformAdminService.REPORT_COLUMNS[key];
    const csv = this.toCsv(columns.map((c) => c.header), rows.map((row) => columns.map((c) => c.get(row))));
    if (actorId) {
      await this.prisma.auditLog.create({
        data: { userId: actorId, action: 'report.export', entity: 'report', entityId: key, metadata: { outcome: 'success', rows: rows.length } },
      });
    }
    return { report: key, filename: `${key}-${new Date().toISOString().slice(0, 10)}.csv`, rows: rows.length, csv };
  }

  private async collectReportRows(key: string, filters: Record<string, any>): Promise<any[]> {
    const pageSize = 100;
    const cap = PlatformAdminService.EXPORT_ROW_CAP;
    const collected: any[] = [];
    let page = 1;
    let total = Infinity;
    while (collected.length < cap && collected.length < total) {
      const result = key === 'subscriptions'
        ? await this.getAllSubscriptions(page, pageSize, filters)
        : key === 'support-tickets'
          ? await this.listSupportTickets(page, pageSize, filters)
          : await this.getPolicies(page, pageSize, filters);
      total = result.total;
      if (!result.data?.length) break;
      collected.push(...result.data);
      page += 1;
    }
    return collected.slice(0, cap);
  }

  private toCsv(headers: string[], rows: unknown[][]): string {
    const escape = (value: unknown): string => {
      const raw = value === null || value === undefined ? '' : String(value);
      // Guard against spreadsheet formula injection, then quote per RFC 4180.
      const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const lines = [headers.map(escape).join(','), ...rows.map((row) => row.map(escape).join(','))];
    return lines.join('\r\n');
  }

  // ─── Platform Stats ──────────────────────────────────────────

  async getPlatformStats() {
    const [tenants, users, orders, bookings, subscriptions] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.user.count(),
      this.prisma.order.count(),
      this.prisma.booking.count(),
      this.prisma.subscription.count(),
    ]);

    const activeTenants = await this.prisma.tenant.count({ where: { status: 'published' } });
    const activeSubscriptions = await this.prisma.subscription.count({ where: { status: 'active' } });

    return {
      totalTenants: tenants,
      activeTenants,
      totalUsers: users,
      totalOrders: orders,
      totalBookings: bookings,
      totalSubscriptions: subscriptions,
      activeSubscriptions,
    };
  }
}
