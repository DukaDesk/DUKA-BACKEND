import {
  Controller, Get, Param, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IntegrationsService } from './integrations.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Integrations - Public (Consumer-Facing)')
@Controller({ path: 'merchants/:merchantId/integrations', version: '1' })
export class IntegrationsPublicController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Get('available')
  @ApiOperation({ summary: 'List available integration connectors' })
  getAvailableConnectors() {
    return this.integrationsService.getAvailableConnectors();
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get()
  @ApiOperation({ summary: 'List connected integrations for a merchant' })
  getConnectors(@Param('merchantId') merchantId: string) {
    return this.integrationsService.getConnectors(merchantId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get(':provider')
  @ApiOperation({ summary: 'Get integration details for a merchant' })
  getConnector(@Param('merchantId') merchantId: string, @Param('provider') provider: string) {
    return this.integrationsService.getConnector(merchantId, provider);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get(':provider/sync-history')
  @ApiOperation({ summary: 'Get sync job history for a merchant' })
  getSyncHistory(@Param('merchantId') merchantId: string, @Param('provider') provider: string) {
    return this.integrationsService.getSyncHistory(merchantId, provider);
  }
}