import { Controller, Get, Post, Param, Query, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CommsService } from './comms.service';
import { CommsReplyDto, ListAnnouncementsDto } from './dto/comms.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TenantResolverService } from '../../shared/tenant/tenant-resolver.service';

@ApiTags('Comms - App (Merchant Inbox)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'app/comms', version: '1' })
export class CommsAppController {
  constructor(
    private readonly comms: CommsService,
    private readonly tenantResolver: TenantResolverService,
  ) {}

  private async getTenantId(userId: string): Promise<string> {
    return this.tenantResolver.resolveTenantId(userId);
  }

  @Get('messages')
  @ApiOperation({ summary: 'Merchant inbox: broadcasts for merchants + direct platform messages' })
  async inbox(@CurrentUser('id') userId: string, @Query() query: ListAnnouncementsDto) {
    return this.comms.merchantList(await this.getTenantId(userId), query.page, query.limit);
  }

  @Get('messages/:id')
  @ApiOperation({ summary: 'Read one message with its thread' })
  async thread(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.comms.merchantThread(id, await this.getTenantId(userId));
  }

  @Post('messages/:id/replies')
  @ApiOperation({ summary: 'Reply to a platform message (text-only)' })
  async reply(@CurrentUser('id') userId: string, @Param('id') id: string, @Body() dto: CommsReplyDto) {
    return this.comms.merchantReply(id, await this.getTenantId(userId), dto.body);
  }

  @Post('messages/:id/read')
  @ApiOperation({ summary: 'Mark the message read (drives unread dots)' })
  async read(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.comms.markMerchantRead(id, await this.getTenantId(userId));
  }
}
