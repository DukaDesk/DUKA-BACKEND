import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CompatibilityService } from './compatibility.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Compatibility')
@Public()
@Controller({ path: 'compatibility', version: '1' })
export class CompatibilityController {
  constructor(private readonly compatibility: CompatibilityService) {}

  @Get()
  @ApiOperation({
    summary: 'Machine-readable runtime compatibility contract (B7)',
    description:
      'Published-app shell capabilities: supported manifest versions, component types, ' +
      'action types, capabilities, asset reference kinds and limits. Consumed by merchant ' +
      'preflight (POST /merchants/{id}/publishing/preflight) and the mobile shell.',
  })
  getContract() {
    return this.compatibility.getContract();
  }
}
