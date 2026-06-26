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
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Tenants')
@Controller({ path: 'tenants', version: '1' })
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

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
}
