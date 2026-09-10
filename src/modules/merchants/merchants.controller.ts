import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { MerchantsService } from './merchants.service';
import { TenantConfigService } from './tenant-config.service';
import { SubscriptionService } from './subscription.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Merchants - Public')
@Controller({ path: 'merchants', version: '1' })
export class MerchantsController {
  constructor(
    private readonly merchantsService: MerchantsService,
    private readonly tenantConfigService: TenantConfigService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post()
  @ApiOperation({ summary: 'Create a new tenant' })
  create(@CurrentUser('id') userId: string, @Body() dto: CreateTenantDto) {
    return this.merchantsService.create(userId, dto);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get tenant by ID' })
  findById(@Param('id') id: string) {
    return this.merchantsService.findById(id);
  }

  @Public()
  @Get(':id/features')
  @ApiOperation({ summary: 'Get enabled capabilities for tenant' })
  getFeatures(@Param('id') id: string) {
    return this.tenantConfigService.getFeatures(id);
  }
}