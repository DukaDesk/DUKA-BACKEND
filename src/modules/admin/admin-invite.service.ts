import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../common/prisma.service';
import { CreateInviteDto } from './dto/create-invite.dto';

const INVITE_TOKEN_BYTES = 32;
const DEFAULT_EXPIRY_DAYS = 7;

function normalizeRole(raw: string): string {
  const r = String(raw || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_');
  if (r === 'platform_operator' || r === 'platformoperator' || r === 'admin' || r === 'administrator' || r === 'operations' || r === 'operator') return 'platform_operator';
  if (r === 'support_agent' || r === 'supportagent' || r === 'support') return 'support_agent';
  if (r === 'super_admin' || r === 'superadmin') return 'super_admin';
  return r;
}

@Injectable()
export class AdminInviteService {
  private readonly logger = new Logger(AdminInviteService.name);

  constructor(private prisma: PrismaService) {}

  async createInvite(adminUserId: string, dto: CreateInviteDto) {
    const email = dto.email.toLowerCase().trim();
    const role = normalizeRole(dto.role);
    const days = dto.expiresInDays ?? DEFAULT_EXPIRY_DAYS;
    const token = randomBytes(INVITE_TOKEN_BYTES).toString('hex');
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const invite = await this.prisma.adminInvite.create({
      data: { email, role, token, expiresAt, createdBy: adminUserId },
    });

    return {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      token: invite.token,
      expiresAt: invite.expiresAt,
    };
  }

  async listInvites(status?: string) {
    const now = new Date();
    const invites = await this.prisma.adminInvite.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const withStatus = invites.map((i) => ({
      ...i,
      token: undefined,
      status: i.usedAt ? 'used' : i.revokedAt ? 'revoked' : i.expiresAt < now ? 'expired' : 'pending',
    }));
    if (status) return withStatus.filter((i) => i.status === status);
    return withStatus;
  }

  async revokeInvite(id: string) {
    const invite = await this.prisma.adminInvite.findUnique({ where: { id } });
    if (!invite) throw new NotFoundException('Invite not found');
    if (invite.usedAt) throw new BadRequestException('Invite already used');
    return this.prisma.adminInvite.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  /** Public pre-check for the signup page — token itself is the secret, so email/role may be revealed. */
  async validateInvite(token: string) {
    const invite = await this.prisma.adminInvite.findUnique({ where: { token } });
    if (!invite) throw new NotFoundException('Invalid invite link');
    if (invite.revokedAt) throw new BadRequestException('Invite revoked');
    if (invite.usedAt) throw new BadRequestException('Invite already used');
    if (invite.expiresAt < new Date()) throw new BadRequestException('Invite expired');
    return { email: invite.email, role: invite.role, expiresAt: invite.expiresAt };
  }

  /** Atomically validate + mark used during registration. Throws on any mismatch. */
  async consumeInvite(token: string, email: string, role: string) {
    const invite = await this.prisma.adminInvite.findUnique({ where: { token } });
    if (!invite) throw new BadRequestException('Invalid invite link');
    if (invite.revokedAt) throw new BadRequestException('Invite revoked');
    if (invite.usedAt) throw new BadRequestException('Invite already used');
    if (invite.expiresAt < new Date()) throw new BadRequestException('Invite expired');
    if (invite.email.toLowerCase() !== String(email || '').toLowerCase().trim()) {
      throw new BadRequestException('Invite link does not match this email');
    }
    if (normalizeRole(invite.role) !== normalizeRole(role)) {
      throw new BadRequestException('Invite link does not match this role');
    }
    return this.prisma.adminInvite.update({
      where: { token },
      data: { usedAt: new Date() },
    });
  }
}
