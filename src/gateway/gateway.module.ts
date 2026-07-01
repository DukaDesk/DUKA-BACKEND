import { Module } from '@nestjs/common';
import { GatewayRateLimiter } from './middleware/gateway-rate-limiter';

@Module({
  providers: [GatewayRateLimiter],
  exports: [GatewayRateLimiter],
})
export class GatewayModule {}
