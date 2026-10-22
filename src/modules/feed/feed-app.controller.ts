import { Controller, Get, Post, Delete, Patch, Param, Query, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { FeedService } from './feed.service';
import { CreateFeedPostDto, ListFeedPostsDto, UpdateFeedPostDto } from './dto/feed.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TenantResolverService } from '../../shared/tenant/tenant-resolver.service';

@ApiTags('Promo Feed - App (Merchant Self-Service)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'app/feed', version: '1' })
export class FeedAppController {
  constructor(
    private readonly feed: FeedService,
    private readonly tenantResolver: TenantResolverService,
  ) {}

  private async getTenantId(userId: string): Promise<string> {
    return this.tenantResolver.resolveTenantId(userId);
  }

  @Get('quota')
  @ApiOperation({ summary: 'Daily promo quota for this tenant (tier-driven, Free defaults to 5/day)' })
  async quota(@CurrentUser('id') userId: string) {
    return this.feed.getQuota(await this.getTenantId(userId));
  }

  @Get('posts')
  @ApiOperation({ summary: 'List own promo posts with engagement counts' })
  async list(
    @CurrentUser('id') userId: string,
    @Query() query: ListFeedPostsDto,
  ) {
    return this.feed.listPosts(await this.getTenantId(userId), query.page, query.limit);
  }

  @Post('posts')
  @ApiOperation({ summary: 'Create a promo post (media + optional product the CTA always opens)' })
  async create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateFeedPostDto,
  ) {
    return this.feed.createPost(await this.getTenantId(userId), dto);
  }

  @Patch('posts/:id')
  @ApiOperation({ summary: 'Update own promo post (counts are merchant-read-only)' })
  async update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateFeedPostDto,
  ) {
    return this.feed.updatePost(id, await this.getTenantId(userId), dto);
  }

  @Delete('posts/:id')
  @ApiOperation({ summary: 'Delete own promo post' })
  async remove(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.feed.deletePost(id, await this.getTenantId(userId));
  }
}
