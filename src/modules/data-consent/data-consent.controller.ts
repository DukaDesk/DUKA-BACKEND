import { ApiTags, ApiBearerAuth, ApiOperation, ApiProperty } from '@nestjs/swagger';
import { Body, Controller, Get, Delete, Param, Post, UseGuards, ForbiddenException } from '@nestjs/common';
import { IsBoolean, IsString, Length } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma.service';
import { DataConsentService } from './data-consent.service';
class DecisionDto {
  @ApiProperty({ description: "Current published request fingerprint", minLength: 64, maxLength: 64 })
  @IsString() @Length(64, 64) policyId: string;
  @ApiProperty()
  @IsBoolean() granted: boolean;
}
@ApiTags('App data consent')
@ApiBearerAuth()
@Controller({ path: 'app/data-consent', version: '1' })
@UseGuards(JwtAuthGuard)
export class DataConsentController {
  constructor(private consent: DataConsentService, private prisma: PrismaService) {}
  @Get()
  @ApiOperation({ summary: 'List your app data-sharing choices' })
  list(@CurrentUser('id') userId: string) { return this.consent.list(userId); }
  @Delete(':merchantId')
  @ApiOperation({ summary: 'Revoke your app data-sharing permission' })
  revoke(@CurrentUser('id') userId: string, @Param('merchantId') merchantId: string) { return this.consent.revoke(userId, merchantId); }
  @Get(':merchantId')
  status(@CurrentUser('id') userId: string, @Param('merchantId') merchantId: string) { return this.consent.status(userId, merchantId); }
  @Post(':merchantId')
  decide(@CurrentUser('id') userId: string, @Param('merchantId') merchantId: string, @Body() body: DecisionDto) { return this.consent.decide(userId, merchantId, body.policyId, body.granted); }
  @Get(':merchantId/shared-profile/:userId')
  async profile(@CurrentUser('id') actorId: string, @Param('merchantId') merchantId: string, @Param('userId') userId: string) {
    const member = await this.prisma.tenantUser.findFirst({ where: { tenantId: merchantId, userId: actorId, role: { in: ['owner', 'manager'] }, status: 'active' } });
    if (!member) throw new ForbiddenException('Merchant access required');
    return this.consent.sharedProfile(userId, merchantId);
  }
}
