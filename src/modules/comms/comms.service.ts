import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import type { CommsMediaRef } from './dto/comms.dto';

/** Media announcements may only target the mobile (secondary) audience. */
export const MEDIA_MOBILE_ONLY = true as const;
/** Platform-owned "tenant" record whose DAM stores announcement media. */
export const PLATFORM_TENANT_SLUG = 'duka-desk-platform';

export interface CommsMedia extends Omit<CommsMediaRef, 'mediaId' | 'posterUrl'> {
  mediaId: string | null;
  posterUrl: string | null;
}

export const ANNOUNCEMENT_SELECT = {
  id: true,
  kind: true,
  audience: true,
  tenantId: true,
  recipientUserId: true,
  recipientActorId: true,
  title: true,
  body: true,
  media: true,
  status: true,
  createdAt: true,
  tenant: { select: { id: true, name: true, slug: true, logo: true } },
} as const;

const REPLY_SELECT = {
  id: true,
  announcementId: true,
  author: true,
  tenantId: true,
  body: true,
  media: true,
  createdAt: true,
} as const;

function validateCommsMedia(media: CommsMediaRef[] | undefined | null): CommsMedia[] | undefined {
  if (media === undefined || media === null) return undefined;
  if (!Array.isArray(media)) throw new BadRequestException('media must be an array');
  if (media.length > 4) throw new BadRequestException('At most 4 media items per message');
  for (const [index, item] of media.entries()) {
    if (!item || typeof item.url !== 'string' || !/^https?:\/\//i.test(item.url)) {
      throw new BadRequestException(`media[${index}] must carry an http(s) url`);
    }
    if (item.type !== 'image' && item.type !== 'video') {
      throw new BadRequestException(`media[${index}].type must be "image" or "video"`);
    }
  }
  return media.map(item => ({
    mediaId: item.mediaId ?? null,
    url: item.url,
    type: item.type,
    posterUrl: item.posterUrl ?? null,
  }));
}

@Injectable()
export class CommsService {
  private readonly logger = new Logger(CommsService.name);

  constructor(private prisma: PrismaService) {}

  /** Platform DAM uploads ride a dedicated platform tenant record. */
  async getPlatformTenantId(): Promise<string> {
    const platform = await this.prisma.tenant.upsert({
      where: { slug: PLATFORM_TENANT_SLUG },
      update: {},
      create: { name: 'DukaDesk', slug: PLATFORM_TENANT_SLUG },
    });
    return platform.id;
  }

  /**
   * Product rule: a pure `merchants` announcement is text-only. Media is
   * allowed when the audience includes mobile users, or on direct sends to
   * a mobile recipient.
   */
  private assertMediaRule(input: { kind: string; audience?: string; tenantId?: string; media?: CommsMediaRef[] }) {
    const hasMedia = Array.isArray(input.media) && input.media.length > 0;
    if (!hasMedia) return;
    const mobileOnly = input.kind === 'broadcast'
      ? input.audience !== 'merchants'
      : !input.tenantId; // direct to a mobile recipient keeps media; merchant DMs are text-only
    if (!mobileOnly) {
      throw new BadRequestException('Media announcements can only reach mobile users — text-only for merchants');
    }
  }

  /** Admin: compose a broadcast or a direct message. */
  async createAnnouncement(input: {
    kind: 'broadcast' | 'direct';
    audience?: 'merchants' | 'mobile' | 'both';
    tenantId?: string;
    recipientUserId?: string;
    recipientActorId?: string;
    title?: string;
    body: string;
    media?: CommsMediaRef[];
  }) {
    const body = (input.body || '').trim();
    if (!body) throw new BadRequestException('body is required');
    const title = input.title?.trim() || null;

    if (input.kind === 'broadcast') {
      if (!['merchants', 'mobile', 'both'].includes(input.audience ?? '')) {
        throw new BadRequestException('broadcast requires audience: merchants | mobile | both');
      }
      this.assertMediaRule(input);
      return this.prisma.announcement.create({
        data: {
          kind: 'broadcast',
          audience: input.audience,
          title,
          body,
          media: (validateCommsMedia(input.media) ?? undefined) as any,
          recipientUserId: null,
          recipientActorId: null,
          tenantId: null,
        },
        select: ANNOUNCEMENT_SELECT as any,
      });
    }

    // ─── Direct ───────────────────────────────────────────────
    const targets = [input.tenantId, input.recipientUserId, input.recipientActorId].filter(Boolean);
    if (targets.length === 0) {
      throw new BadRequestException('direct message needs one recipient: tenantId, recipientUserId or recipientActorId');
    }
    if (targets.length > 1) {
      throw new BadRequestException('direct message takes exactly one recipient — pick tenantId OR recipientUserId OR recipientActorId');
    }
    if (input.tenantId) {
      const tenant = await this.prisma.tenant.findUnique({ where: { id: input.tenantId }, select: { id: true } });
      if (!tenant) throw new BadRequestException('tenantId does not exist');
      this.assertMediaRule(input);
      return this.prisma.announcement.create({
        data: {
          kind: 'direct',
          tenantId: input.tenantId,
          title,
          body,
          media: (validateCommsMedia(input.media) ?? undefined) as any,
        },
        select: ANNOUNCEMENT_SELECT as any,
      });
    }
    if (input.recipientUserId) {
      const user = await this.prisma.user.findUnique({ where: { id: input.recipientUserId }, select: { id: true } });
      if (!user) throw new BadRequestException('recipientUserId does not exist');
      this.assertMediaRule(input);
      return this.prisma.announcement.create({
        data: {
          kind: 'direct',
          recipientUserId: input.recipientUserId,
          title,
          body,
          media: (validateCommsMedia(input.media) ?? undefined) as any,
        },
        select: ANNOUNCEMENT_SELECT as any,
      });
    }
    this.assertMediaRule(input);
    return this.prisma.announcement.create({
      data: {
        kind: 'direct',
        recipientActorId: input.recipientActorId,
        title,
        body,
        media: (validateCommsMedia(input.media) ?? undefined) as any,
      },
      select: ANNOUNCEMENT_SELECT as any,
    });
  }

  /** Admin: list everything for the messaging inbox. */
  async listAll(page = 1, limit = 20, kind?: 'broadcast' | 'direct' | 'all', audience?: string) {
    const where: any = {};
    if (kind && kind !== 'all') where.kind = kind;
    if (audience) where.audience = audience;
    const [data, total] = await Promise.all([
      this.prisma.announcement.findMany({
        where,
        select: {
          ...ANNOUNCEMENT_SELECT,
          _count: { select: { replies: true, reads: true } },
          replies: { take: 1, orderBy: { createdAt: 'desc' as const }, select: { author: true, body: true, createdAt: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.announcement.count({ where }),
    ]);
    return { data, meta: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  /** Admin: full thread — message + merchant replies + platform answers. */
  async getThread(announcementId: string) {
    const announcement = await this.prisma.announcement.findUnique({
      where: { id: announcementId },
      select: ANNOUNCEMENT_SELECT as any,
    });
    if (!announcement) throw new NotFoundException('Message not found');
    const replies = await this.prisma.announcementReply.findMany({
      where: { announcementId },
      orderBy: { createdAt: 'asc' },
      select: REPLY_SELECT as any,
    });
    const reads = await this.prisma.announcementRead.count({ where: { announcementId } });
    return { ...announcement, replies, readCount: reads };
  }

  /** Admin: answer a merchant (or broadcast) thread as the platform. */
  async addPlatformReply(announcementId: string, body: string) {
    const announcement = await this.prisma.announcement.findUnique({ where: { id: announcementId }, select: { id: true } });
    if (!announcement) throw new NotFoundException('Message not found');
    const text = (body || '').trim();
    if (!text) throw new BadRequestException('Reply body is required');
    return this.prisma.announcementReply.create({
      data: { announcementId, author: 'platform', body: text },
      select: REPLY_SELECT as any,
    });
  }

  /** Admin: retract a message. Threads/replies/read receipts cascade. */
  async deleteAnnouncement(announcementId: string) {
    const announcement = await this.prisma.announcement.findUnique({ where: { id: announcementId }, select: { id: true } });
    if (!announcement) throw new NotFoundException('Message not found');
    await this.prisma.announcement.delete({ where: { id: announcementId } });
    return { id: announcementId, deleted: true };
  }

  /** Merchant inbox: broadcasts to merchants + direct messages to this tenant. */
  async merchantList(tenantId: string, page = 1, limit = 20) {
    const where = {
      OR: [
        { kind: 'broadcast', audience: { in: ['merchants', 'both'] } },
        { kind: 'direct', tenantId },
      ],
    };
    const [rows, total] = await Promise.all([
      this.prisma.announcement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: { ...ANNOUNCEMENT_SELECT, reads: { where: { tenantId }, select: { id: true } } },
      }),
      this.prisma.announcement.count({ where }),
    ]);
    const data = rows.map((row: any) => ({
      ...this.stripRecipientPii(row),
      readAt: row.reads?.[0]?.readAt ?? null,
      unread: row.reads?.length === 0,
      reads: undefined,
    }));
    return { data, meta: { page, limit, total, pages: Math.ceil(total / limit) }, unread: data.filter(item => item.unread).length };
  }

  /** Merchant thread view: message + visible replies. */
  async merchantThread(announcementId: string, tenantId: string) {
    const announcement: any = await this.prisma.announcement.findFirst({
      where: {
        id: announcementId,
        OR: [
          { kind: 'broadcast', audience: { in: ['merchants', 'both'] } },
          { kind: 'direct', tenantId },
        ],
      },
      select: ANNOUNCEMENT_SELECT as any,
    });
    if (!announcement) throw new NotFoundException('Message not found');
    const replies = await this.prisma.announcementReply.findMany({
      where: { announcementId, OR: [{ author: 'platform' }, { tenantId }] },
      orderBy: { createdAt: 'asc' },
      select: REPLY_SELECT as any,
    });
    return { ...this.stripRecipientPii(announcement), replies };
  }

  /** Merchants reply to platform messages (text-only). */
  async merchantReply(announcementId: string, tenantId: string, body: string) {
    const announcement = await this.prisma.announcement.findFirst({
      where: {
        id: announcementId,
        OR: [
          { kind: 'broadcast', audience: { in: ['merchants', 'both'] } },
          { kind: 'direct', tenantId },
        ],
      },
      select: { id: true },
    });
    if (!announcement) throw new NotFoundException('Message not found');
    const text = (body || '').trim();
    if (!text) throw new BadRequestException('Reply body is required');
    const reply = await this.prisma.announcementReply.create({
      data: { announcementId, author: 'merchant', tenantId, body: text },
      select: REPLY_SELECT as any,
    });
    return reply;
  }

  /** Merchant marks a message read. */
  async markMerchantRead(announcementId: string, tenantId: string) {
    const existing = await this.prisma.announcementRead.findFirst({
      where: { announcementId, tenantId },
      select: { id: true, readAt: true },
    });
    if (existing) return { id: existing.id, readAt: existing.readAt, alreadyRead: true };
    const read = await this.prisma.announcementRead.create({
      data: { announcementId, tenantId },
      select: { id: true, readAt: true },
    });
    return { id: read.id, readAt: read.readAt, alreadyRead: false };
  }

  private stripRecipientPii(row: any) {
    return { ...row, recipientUserId: undefined, recipientActorId: undefined };
  }
}

