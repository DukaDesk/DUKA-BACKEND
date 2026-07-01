import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { DevicesService } from './devices.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Devices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'devices', version: '1' })
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a device' })
  register(@CurrentUser('id') userId: string, @Body() data: any) {
    return this.devicesService.register(userId, data);
  }

  @Get()
  @ApiOperation({ summary: 'List all devices' })
  findAll(@CurrentUser('id') userId: string) {
    return this.devicesService.findAll(userId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update device metadata' })
  update(@Param('id') id: string, @CurrentUser('id') userId: string, @Body() data: any) {
    return this.devicesService.update(id, userId, data);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Revoke a device' })
  revoke(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.devicesService.revoke(id, userId);
  }
}
