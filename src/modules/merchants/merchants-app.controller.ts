import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { MerchantsService } from './merchants.service';
import { TenantConfigService } from './tenant-config.service';
import { SubscriptionService } from './subscription.service';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TenantResolverService } from '../../shared/tenant/tenant-resolver.service';

@ApiTags('Merchants - App (Tenant Self-Service)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'app/merchants', version: '1' })
export class MerchantsAppController {
  constructor(
    private readonly merchantsService: MerchantsService,
    private readonly tenantConfigService: TenantConfigService,
    private readonly subscriptionService: SubscriptionService,
    private readonly tenantResolver: TenantResolverService,
  ) {}

  private async getTenantId(userId: string): Promise<string> {
    return this.tenantResolver.resolveTenantId(userId);
  }

  @Get()
  @ApiOperation({ summary: 'Get my tenants' })
  async getMyTenants(@CurrentUser('id') userId: string) {
    return this.merchantsService.getMyTenants(userId);
  }

  @Put()
  @ApiOperation({ summary: 'Update current tenant' })
  async updateTenant(@CurrentUser('id') userId: string, @Body() dto: UpdateTenantDto) {
    const tenantId = await this.getTenantId(userId);
    return this.merchantsService.update(tenantId, userId, dto);
  }

  @Post('publish')
  @ApiOperation({ summary: 'Publish current tenant' })
  async publish(@CurrentUser('id') userId: string) {
    const tenantId = await this.getTenantId(userId);
    return this.merchantsService.publish(tenantId, userId);
  }

  @Get('config')
  @ApiOperation({ summary: 'Get current tenant runtime configuration' })
  async getConfig(@CurrentUser('id') userId: string) {
    const tenantId = await this.getTenantId(userId);
    return this.tenantConfigService.getConfig(tenantId);
  }

  @Put('config')
  @ApiOperation({ summary: 'Update current tenant runtime configuration' })
  async updateConfig(@CurrentUser('id') userId: string, @Body() data: any) {
    const tenantId = await this.getTenantId(userId);
    return this.tenantConfigService.updateConfig(tenantId, data);
  }

  @Get('subscription')
  @ApiOperation({ summary: 'Get current tenant subscription' })
  async getSubscription(@CurrentUser('id') userId: string) {
    const tenantId = await this.getTenantId(userId);
    return this.subscriptionService.getSubscription(tenantId);
  }

  @Post('subscribe')
  @ApiOperation({ summary: 'Subscribe current tenant to a plan' })
  async subscribe(@CurrentUser('id') userId: string, @Body('plan') planSlug: string) {
    const tenantId = await this.getTenantId(userId);
    return this.subscriptionService.subscribe(tenantId, planSlug);
  }

  @Post('subscription/cancel')
  @ApiOperation({ summary: 'Cancel current tenant subscription' })
  async cancelSubscription(@CurrentUser('id') userId: string) {
    const tenantId = await this.getTenantId(userId);
    return this.subscriptionService.cancel(tenantId);
  }
}