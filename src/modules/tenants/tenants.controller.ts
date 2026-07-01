import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { TenantConfigService } from './tenant-config.service';
import { SubscriptionService } from './subscription.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Tenants')
@Controller({ path: 'tenants', version: '1' })
export class TenantsController {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly tenantConfigService: TenantConfigService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post()
  @ApiOperation({ summary: 'Create a new tenant' })
  create(@CurrentUser('id') userId: string, @Body() dto: CreateTenantDto) {
    return this.tenantsService.create(userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('my')
  @ApiOperation({ summary: 'Get my tenants' })
  getMyTenants(@CurrentUser('id') userId: string) {
    return this.tenantsService.getMyTenants(userId);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get tenant by ID' })
  findById(@Param('id') id: string) {
    return this.tenantsService.findById(id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Put(':id')
  @ApiOperation({ summary: 'Update tenant' })
  update(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateTenantDto,
  ) {
    return this.tenantsService.update(id, userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(':id/publish')
  @ApiOperation({ summary: 'Publish tenant' })
  publish(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.tenantsService.publish(id, userId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get(':id/config')
  @ApiOperation({ summary: 'Get tenant runtime configuration' })
  getConfig(@Param('id') id: string) {
    return this.tenantConfigService.getConfig(id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Put(':id/config')
  @ApiOperation({ summary: 'Update tenant runtime configuration' })
  updateConfig(@Param('id') id: string, @Body() data: any) {
    return this.tenantConfigService.updateConfig(id, data);
  }

  @Public()
  @Get(':id/features')
  @ApiOperation({ summary: 'Get enabled capabilities for tenant' })
  getFeatures(@Param('id') id: string) {
    return this.tenantConfigService.getFeatures(id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get(':id/subscription')
  @ApiOperation({ summary: 'Get tenant subscription' })
  getSubscription(@Param('id') id: string) {
    return this.subscriptionService.getSubscription(id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(':id/subscribe')
  @ApiOperation({ summary: 'Subscribe to a plan' })
  subscribe(@Param('id') id: string, @Body('plan') planSlug: string) {
    return this.subscriptionService.subscribe(id, planSlug);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(':id/subscription/cancel')
  @ApiOperation({ summary: 'Cancel subscription' })
  cancelSubscription(@Param('id') id: string) {
    return this.subscriptionService.cancel(id);
  }
}
