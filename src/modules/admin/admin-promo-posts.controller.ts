import { Controller, Post, Get, Delete, Param, Query, Body, UseGuards, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PlatformRoleGuard, RequirePlatformRoles } from './platform-role.guard';
import { PrismaService } from '../../common/prisma.service';
import { CommsService } from '../comms/comms.service';
import { FeedService, CreateFeedPostInput } from '../feed/feed.service';

@ApiTags('Admin Promotions (promo-feed broadcasts)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PlatformRoleGuard)
@RequirePlatformRoles('super_admin', 'platform_operator')
@Controller({ path: 'admin/promo-posts', version: '1' })
export class AdminPromoPostsController {
  constructor(
    private readonly comms: CommsService,
    private readonly feed: FeedService,
    private readonly prisma: PrismaService,
  ) {}

  /** Admin promos post to the app feed as DukaDesk-owned posts — no quota,
   * no CTA; they reach mobile users' Feed until the 24h sweep purges them. */
  @Post()
  @ApiOperation({ summary: 'Create a DukaDesk promo post (video/image + caption) for the app feed' })
  async create(@Body() dto: CreateFeedPostInput) {
    const platformTenantId = await this.comms.getPlatformTenantId();
    return this.feed.createPost(platformTenantId, dto, { skipQuota: true });
  }

  @Get()
  @ApiOperation({ summary: 'List DukaDesk promo posts (including expired, until purged)' })
  async list(@Query('page') page?: string, @Query('limit') limit?: string) {
    const platformTenantId = await this.comms.getPlatformTenantId();
    return this.feed.listPosts(
      platformTenantId,
      Math.max(parseInt(page || '1', 10) || 1, 1),
      Math.min(parseInt(limit || '20', 10) || 20, 50),
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Retract a DukaDesk promo post' })
  async remove(@Param('id') id: string) {
    const platformTenantId = await this.comms.getPlatformTenantId();
    const existing = await this.prisma.feedPost.findUnique({ where: { id }, select: { tenantId: true } });
    if (!existing || existing.tenantId !== platformTenantId) {
      throw new NotFoundException('Promo post not found (it may have expired)');
    }
    return this.feed.deletePost(id, platformTenantId);
  }
}
